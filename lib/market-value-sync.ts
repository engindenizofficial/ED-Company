import { db } from "./db"
import { teamMarketValue, playerMarketValue, marketValueReviewQueue } from "./db/schema"
import { eq, inArray, lt, and, or } from "drizzle-orm"
import { scrapeLeagueTeams, scrapeTeamSquad, getAdaptiveDelayMs, SCRAPABLE_LEAGUE_IDS } from "./transfermarkt-scraper"
import { getLeagueTeamsForMatching, matchTeams, matchPlayersForTeam } from "./market-value-matcher"

// ---------------------------------------------------------------------------
// Cron job'ın çağırdığı yazma (write) katmanı. Scrape + eşleştirme sonuçlarını
// veritabanına upsert eder. Uygulamanın okuma tarafı (lib/market-values.ts,
// 6. adımda eklenecek) bu tabloları sadece okur — bu dosyayı asla import etmez.
// ---------------------------------------------------------------------------

/** API-Football sezon numarasını döndürür (Ağustos'tan itibaren yeni sezon). */
function currentSeason(): number {
  const now = new Date()
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface LockedRow {
  matchStatus: "matched" | "review" | "unmatched"
  transfermarktId: string | null
}

/**
 * Admin tarafından manuel ONAYLANMIŞ (matchStatus="matched" + manualOverride)
 * takım satırlarını okur. Bu takımlar için cron, isim benzerliğini yeniden
 * hesaplasa bile eşleşme kararı üzerine YAZMAZ — sadece parasal değeri
 * günceller (bkz. syncSingleTeam).
 *
 * ÖNEMLİ — REDDEDİLEN (matchStatus="unmatched" + manualOverride) satırlar bu
 * haritaya BİLEREK dahil edilmez. Admin'in reddetme kararı kalıcı değildir:
 * bir sonraki taramada bu takım, admin hiçbir şey reddetmemiş gibi normal
 * eşleştirme mantığına (matchTeams) girer ve yeni veriye göre "matched",
 * "review" ya da tekrar "unmatched" olabilir.
 */
async function getLockedTeamMap(teamIds: number[]): Promise<Map<number, LockedRow>> {
  const result = new Map<number, LockedRow>()
  if (teamIds.length === 0) return result

  const rows = await db
    .select({
      teamId: teamMarketValue.teamId,
      matchStatus: teamMarketValue.matchStatus,
      transfermarktTeamId: teamMarketValue.transfermarktTeamId,
      manualOverride: teamMarketValue.manualOverride,
    })
    .from(teamMarketValue)
    .where(inArray(teamMarketValue.teamId, teamIds))

  for (const row of rows) {
    if (!row.manualOverride || row.matchStatus !== "matched") continue
    result.set(row.teamId, {
      matchStatus: row.matchStatus as LockedRow["matchStatus"],
      transfermarktId: row.transfermarktTeamId,
    })
  }
  return result
}

/** Oyuncular için aynı kilit mantığı — bkz. getLockedTeamMap. */
async function getLockedPlayerMap(playerIds: number[]): Promise<Map<number, LockedRow>> {
  const result = new Map<number, LockedRow>()
  if (playerIds.length === 0) return result

  const rows = await db
    .select({
      playerId: playerMarketValue.playerId,
      matchStatus: playerMarketValue.matchStatus,
      transfermarktPlayerId: playerMarketValue.transfermarktPlayerId,
      manualOverride: playerMarketValue.manualOverride,
    })
    .from(playerMarketValue)
    .where(inArray(playerMarketValue.playerId, playerIds))

  for (const row of rows) {
    if (!row.manualOverride || row.matchStatus !== "matched") continue
    result.set(row.playerId, {
      matchStatus: row.matchStatus as LockedRow["matchStatus"],
      transfermarktId: row.transfermarktPlayerId,
    })
  }
  return result
}

interface PlayerSyncCounts {
  matched: number
  review: number
  unmatched: number
}

/**
 * Bir takımın kadrosunu Transfermarkt'tan çekip oyuncuları eşleştirir ve
 * yazar. Admin tarafından manuel kilitlenmiş (manualOverride) oyuncu
 * satırlarına dokunmaz — onların kararı sabit sayılır.
 *
 * Export edilmiştir: cron'un normal akışının dışında, bir admin bir takımı
 * review kuyruğundan ONAYLADIĞI anda da çağrılır (bkz.
 * app/actions/market-value-review.ts -> approveReviewEntry), böylece o
 * takımın oyuncu verisi bir sonraki cron koşusuna kadar boş kalmaz.
 */
export async function syncTeamPlayers(
  apiFootballTeamId: number,
  transfermarktTeamId: string,
  season: number,
  runStartedAt: Date,
): Promise<PlayerSyncCounts> {
  const counts: PlayerSyncCounts = { matched: 0, review: 0, unmatched: 0 }

  // Transfermarkt'a art arda çok hızlı istek atmamak için takımlar arası
  // bekleme. Sabit bir taban değer DEĞİL — "market-value" sistemine özel,
  // kendi kendine kalibre olan AIMD gecikmesi (bkz. lib/redis.ts ->
  // getTmDelayMs/recordTmSuccess/recordTmBlock, transfermarkt-scraper.ts ->
  // getAdaptiveDelayMs). Blok görülürse anında sertçe artar, uzun bir başarı
  // serisinde yavaşça azalır; lib/player-position-sync.ts'teki
  // "player-position" sisteminden TAMAMEN BAĞIMSIZ kalibre olur.
  await sleep(await getAdaptiveDelayMs("market-value"))
  let scrapedPlayers = await scrapeTeamSquad(transfermarktTeamId)
  if (scrapedPlayers.length === 0) {
    // Geçici bir rate-limit (503) olabilir — biraz daha bekleyip bir kez tekrar dene.
    await sleep(await getAdaptiveDelayMs("market-value"))
    scrapedPlayers = await scrapeTeamSquad(transfermarktTeamId)
  }
  if (scrapedPlayers.length === 0) return counts

  const playerMatches = await matchPlayersForTeam(apiFootballTeamId, scrapedPlayers)
  const playerIds = playerMatches.map((pm) => pm.apiFootballPlayerId)
  const lockedPlayers = await getLockedPlayerMap(playerIds)

  // Bu takımın kadrosunda API-Football tarafında hâlâ görünen HER oyuncuyu
  // "var" olarak işaretle — kilitli olsun ya da olmasın. Bir oyuncu transfer
  // olup başka bir (taranan) takıma geçtiğinde, o takımın senkronu sırasında
  // burada tekrar "görülecek" ve lastSeenAt tazelenecek; hiçbir taranan
  // takımın kadrosunda artık görünmüyorsa (transfer dışı lig, emeklilik vb.)
  // bu satır dokunulmadan kalır ve temizlik adımında silinir.
  if (playerIds.length > 0) {
    await db
      .update(playerMarketValue)
      .set({ lastSeenAt: runStartedAt })
      .where(inArray(playerMarketValue.playerId, playerIds))
  }

  for (const pm of playerMatches) {
    const locked = lockedPlayers.get(pm.apiFootballPlayerId)
    if (locked) {
      // Admin bu oyuncu için eşleşme kararını vermiş — matchStatus/
      // transfermarktPlayerId üzerine yazılmaz. Ama parasal değeri, kilitli
      // Transfermarkt profilinin bu haftaki scrape edilmiş değeriyle
      // güncel tutuyoruz — aksi halde onaylanan oyuncunun değeri onay
      // anındaki tutarda donuk kalırdı. pm.transfermarktPlayerId'ye
      // GÜVENMİYORUZ çünkü bu haftanın isim eşleştirmesi kilitli profilden
      // farklı bir Transfermarkt oyuncusuna işaret edebilir — bunun yerine
      // doğrudan scrapedPlayers içinde kilitli id'yi arıyoruz.
      if (locked.matchStatus === "matched") counts.matched++
      else counts.unmatched++

      if (locked.matchStatus === "matched" && locked.transfermarktId) {
        const scrapedMatch = scrapedPlayers.find((sp) => sp.transfermarktId === locked.transfermarktId)
        if (scrapedMatch) {
          const now = new Date()
          await db
            .update(playerMarketValue)
            .set({
              valueEur: scrapedMatch.valueEur !== null ? String(scrapedMatch.valueEur) : null,
              fullName: scrapedMatch.name,
              lastScrapedAt: now,
              updatedAt: now,
            })
            .where(eq(playerMarketValue.playerId, pm.apiFootballPlayerId))
        }
      }
      continue
    }

    await upsertPlayerMarketValue(apiFootballTeamId, pm, runStartedAt)

    if (pm.status === "unmatched") {
      counts.unmatched++
      continue
    }
    if (pm.status === "review") {
      counts.review++
      // Ülke bilgisi burada OTOMATIK çekilmez — sadece admin panelindeki
      // "eksik ülke bilgilerini doldur" butonu (backfillReviewQueueCountriesBatch)
      // ile manuel olarak doldurulur. Yeni kayıt null ülke ile, henüz denenmemiş
      // (countryLookupAttempted=false, varsayılan) olarak eklenir.
      await upsertReviewQueueEntry({
        entityType: "player",
        entityId: pm.apiFootballPlayerId,
        entityName: pm.apiFootballPlayerName,
        candidateName: pm.transfermarktPlayerName,
        candidateTransfermarktId: pm.transfermarktPlayerId,
        candidateValueEur: pm.valueEur,
        confidence: pm.confidence,
      })
      continue
    }
    counts.matched++
  }

  return counts
}

/** Bir ligin, zincirleme (takım bazlı) işlenmeye hazır takım listesi. */
export interface TeamSyncTask {
  match: Awaited<ReturnType<typeof matchTeams>>[number]
  locked: LockedRow | null
  /**
   * Kilitli (manualOverride) VE "matched" bir takım için, bu haftanın
   * scrape edilmiş verisinde locked.transfermarktId'ye karşılık gelen güncel
   * piyasa değeri. Admin'in eşleşme kararı (hangi Transfermarkt profili
   * doğru) değişmez, ama parasal değer her hafta bu alandan güncellenir —
   * aksi halde onaylanan takımların değeri onay anındaki tutarda donuk
   * kalırdı. Kilitli değilse veya scrape'te bulunamadıysa null.
   */
  lockedValueEur: number | null
}

export interface LeagueTeamProgress {
  season: number
  tasks: TeamSyncTask[]
  nextTeamIndex: number
  teamsMatched: number
  teamsReview: number
  teamsUnmatched: number
  playersMatched: number
  playersReview: number
  playersUnmatched: number
}

export interface TeamSyncCounts {
  teamsMatched: number
  teamsReview: number
  teamsUnmatched: number
  playersMatched: number
  playersReview: number
  playersUnmatched: number
}

const EMPTY_TEAM_SYNC_COUNTS: TeamSyncCounts = {
  teamsMatched: 0,
  teamsReview: 0,
  teamsUnmatched: 0,
  playersMatched: 0,
  playersReview: 0,
  playersUnmatched: 0,
}

/**
 * Bir ligin takım listesini çekip eşleştirir ve zincirleme işlenmeye hazır
 * hale getirir. TEK bir HTTP round-trip çifti (API-Football standings +
 * Transfermarkt lig sayfası) kullanır — 60 saniyelik serverless zaman
 * aşımının çok altında kalan, "hafif" bir adımdır. Asıl ağır iş (her takımın
 * kadrosunu çekmek) burada YAPILMAZ; dönen `tasks` listesi tek tek
 * `syncSingleTeam` ile işlenir (bkz. lib/market-value-cron-run.ts).
 *
 * @param runStartedAt Bu haftalık cron döngüsünün başladığı an — takımların
 * lastSeenAt'i burada tazelenir (oyuncular her takım işlenirken tazelenir).
 */
export async function prepareLeagueTeamSync(leagueId: number, runStartedAt: Date): Promise<LeagueTeamProgress> {
  const season = currentSeason()

  // Bir önceki ligin son takım/oyuncu isteğinden sonra Transfermarkt'a hemen
  // yeni bir lig sayfası isteği atmamak için bekleme — art arda çok hızlı
  // gelen istekler bot korumasını (403/429) tetikleme riskini artırıyor.
  // Gerçek bloklanma durumunda artık scrapeLeagueTeams sessizce boş dönmüyor,
  // hata fırlatıyor (bkz. transfermarkt-scraper.ts fetchHtml) — bu bekleme
  // sadece bloklanma riskini azaltmak için, hatayı gizlemek için değil.
  // "market-value" sistemine özel AIMD gecikmesi (bkz. getAdaptiveDelayMs).
  await sleep(await getAdaptiveDelayMs("market-value"))

  const [apiFootballTeams, scrapedTeams] = await Promise.all([
    getLeagueTeamsForMatching(leagueId, season),
    scrapeLeagueTeams(leagueId),
  ])

  const teamMatches = matchTeams(apiFootballTeams, scrapedTeams)
  const teamIds = teamMatches.map((tm) => tm.apiFootballTeamId)

  // Admin tarafından manuel onaylanmış/reddedilmiş takımları önceden oku —
  // bu takımların isim benzerliği bu hafta hâlâ eşik altında çıksa bile
  // kararları bozulmayacak (bkz. syncTeamPlayers / getLockedTeamMap).
  const lockedTeams = await getLockedTeamMap(teamIds)

  // Bu ligin standings'inde API-Football tarafında hâlâ görünen HER takımı
  // "var" olarak işaretle — kilitli olsun ya da olmasın (bkz. syncTeamPlayers
  // içindeki aynı mantık, oyuncular için). Bu, bir takımın kadro senkronu
  // (syncSingleTeam) her ne sebeple olursa olsun atlansa/başarısız olsa bile
  // bu takımın "hayalet" sayılıp silinmesini önler.
  if (teamIds.length > 0) {
    await db.update(teamMarketValue).set({ lastSeenAt: runStartedAt }).where(inArray(teamMarketValue.teamId, teamIds))
  }

  const tasks: TeamSyncTask[] = teamMatches.map((match) => {
    const locked = lockedTeams.get(match.apiFootballTeamId) ?? null
    let lockedValueEur: number | null = null
    if (locked && locked.matchStatus === "matched" && locked.transfermarktId) {
      // Admin'in sabitlediği Transfermarkt profilinin bu haftaki scrape
      // edilmiş değerini bul — eşleşme kararına dokunmadan sadece değeri
      // güncel tutmak için.
      const scrapedMatch = scrapedTeams.find((st) => st.transfermarktId === locked.transfermarktId)
      lockedValueEur = scrapedMatch ? scrapedMatch.totalValueEur : null
    }
    return { match, locked, lockedValueEur }
  })

  return {
    season,
    tasks,
    nextTeamIndex: 0,
    teamsMatched: 0,
    teamsReview: 0,
    teamsUnmatched: 0,
    playersMatched: 0,
    playersReview: 0,
    playersUnmatched: 0,
  }
}

/**
 * Zincirin en küçük birimi: SADECE bir takımı (varsa kadrosuyla) işler.
 * `prepareLeagueTeamSync`'in ürettiği tek bir `TeamSyncTask`'ı alır. Takım
 * başına en fazla ~1 Transfermarkt kadro isteği + sabit bekleme (bkz.
 * syncTeamPlayers) yapar, bu yüzden lig büyüklüğünden bağımsız olarak her
 * zaman zaman aşımının çok altında kalır.
 */
export async function syncSingleTeam(
  leagueId: number,
  task: TeamSyncTask,
  season: number,
  runStartedAt: Date,
): Promise<TeamSyncCounts> {
  const tm = task.match
  const locked = task.locked

  if (locked) {
    // Bu takımın eşleşmesi admin tarafından sabitlendi — matchStatus/
    // transfermarktTeamId üzerine yazılmaz, review kuyruğuna da düşürülmez.
    if (locked.matchStatus !== "matched" || !locked.transfermarktId) {
      return { ...EMPTY_TEAM_SYNC_COUNTS, teamsUnmatched: 1 }
    }
    // Eşleşme kararı sabit kalır, ama parasal değeri (totalValueEur) bu
    // haftanın scrape edilmiş verisiyle güncel tutuyoruz — aksi halde
    // onaylanan takımların değeri onay anındaki tutarda donuk kalırdı.
    const now = new Date()
    await db
      .update(teamMarketValue)
      .set({
        totalValueEur: task.lockedValueEur !== null ? String(task.lockedValueEur) : null,
        lastScrapedAt: now,
        updatedAt: now,
      })
      .where(eq(teamMarketValue.teamId, tm.apiFootballTeamId))

    const counts = await syncTeamPlayers(tm.apiFootballTeamId, locked.transfermarktId, season, runStartedAt)
    return {
      ...EMPTY_TEAM_SYNC_COUNTS,
      teamsMatched: 1,
      playersMatched: counts.matched,
      playersReview: counts.review,
      playersUnmatched: counts.unmatched,
    }
  }

  await upsertTeamMarketValue(leagueId, tm, runStartedAt)

  if (tm.status === "unmatched") {
    return { ...EMPTY_TEAM_SYNC_COUNTS, teamsUnmatched: 1 }
  }

  if (tm.status === "review") {
    // Ülke bilgisi burada OTOMATIK çekilmez — sadece admin panelindeki
    // "eksik ülke bilgilerini doldur" butonu (backfillReviewQueueCountriesBatch)
    // ile manuel olarak doldurulur. Yeni kayıt null ülke ile, henüz denenmemiş
    // (countryLookupAttempted=false, varsayılan) olarak eklenir.
    await upsertReviewQueueEntry({
      entityType: "team",
      entityId: tm.apiFootballTeamId,
      entityName: tm.apiFootballTeamName,
      candidateName: tm.transfermarktTeamName,
      candidateTransfermarktId: tm.transfermarktTeamId,
      candidateValueEur: tm.totalValueEur,
      confidence: tm.confidence,
    })
    // Belirsiz takım eşleşmesinde oyuncu aramasına girmiyoruz — yanlış
    // takımın kadrosuyla eşleştirme yapıp hatalı veri üretmemek için.
    return { ...EMPTY_TEAM_SYNC_COUNTS, teamsReview: 1 }
  }

  // Takım eşleşti (status === "matched") — kadroyu çek ve oyuncuları eşleştir.
  if (!tm.transfermarktTeamId) {
    return { ...EMPTY_TEAM_SYNC_COUNTS, teamsMatched: 1 }
  }
  const counts = await syncTeamPlayers(tm.apiFootballTeamId, tm.transfermarktTeamId, season, runStartedAt)
  return {
    ...EMPTY_TEAM_SYNC_COUNTS,
    teamsMatched: 1,
    playersMatched: counts.matched,
    playersReview: counts.review,
    playersUnmatched: counts.unmatched,
  }
}

async function upsertTeamMarketValue(
  leagueId: number,
  tm: Awaited<ReturnType<typeof matchTeams>>[number],
  runStartedAt: Date,
): Promise<void> {
  const id = `team-${tm.apiFootballTeamId}`
  const now = new Date()

  // Bu fonksiyona ulaşıldıysa takım kilitli DEĞİLDİR (bkz. getLockedTeamMap
  // — sadece "matched" + manualOverride satırlar kilitli sayılır). Yani
  // buraya, hiç dokunulmamış bir takım İÇİN ya da daha önce reddedilmiş
  // (manualOverride=true, matchStatus="unmatched") ama artık yeniden
  // değerlendirilen bir takım için gelinebilir. İkinci durumda eski
  // manualOverride bayrağını da temizliyoruz ki veri modeli tutarlı kalsın.
  await db
    .insert(teamMarketValue)
    .values({
      id,
      teamId: tm.apiFootballTeamId,
      leagueId,
      teamName: tm.apiFootballTeamName,
      transfermarktTeamId: tm.transfermarktTeamId,
      transfermarktTeamSlug: null,
      totalValueEur: tm.totalValueEur !== null ? String(tm.totalValueEur) : null,
      matchConfidence: tm.confidence,
      matchStatus: tm.status,
      manualOverride: false,
      lastScrapedAt: now,
      lastSeenAt: runStartedAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: teamMarketValue.teamId,
      set: {
        leagueId,
        teamName: tm.apiFootballTeamName,
        transfermarktTeamId: tm.transfermarktTeamId,
        totalValueEur: tm.totalValueEur !== null ? String(tm.totalValueEur) : null,
        matchConfidence: tm.confidence,
        matchStatus: tm.status,
        manualOverride: false,
        lastScrapedAt: now,
        lastSeenAt: runStartedAt,
        updatedAt: now,
      },
    })
}

async function upsertPlayerMarketValue(
  teamId: number,
  pm: Awaited<ReturnType<typeof matchPlayersForTeam>>[number],
  runStartedAt: Date,
): Promise<void> {
  const id = `player-${pm.apiFootballPlayerId}`
  const now = new Date()

  // Bkz. upsertTeamMarketValue'daki açıklama — buraya ulaşıldıysa oyuncu
  // kilitli DEĞİLDİR; daha önce reddedilmiş bir oyuncunun manualOverride
  // bayrağı da burada temizlenir.
  await db
    .insert(playerMarketValue)
    .values({
      id,
      playerId: pm.apiFootballPlayerId,
      teamId,
      playerName: pm.apiFootballPlayerName,
      // pm.transfermarktPlayerName, Transfermarkt kadro sayfasından gelen TAM
      // ad (örn. "Ousmane Dembélé") — playerName ise API-Football'ın kısa
      // formatı ("O. Dembélé"). Arama ekranı ikisini de kontrol eder.
      fullName: pm.transfermarktPlayerName,
      transfermarktPlayerId: pm.transfermarktPlayerId,
      transfermarktPlayerSlug: null,
      valueEur: pm.valueEur !== null ? String(pm.valueEur) : null,
      matchConfidence: pm.confidence,
      matchStatus: pm.status,
      manualOverride: false,
      lastScrapedAt: now,
      lastSeenAt: runStartedAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: playerMarketValue.playerId,
      set: {
        teamId,
        playerName: pm.apiFootballPlayerName,
        fullName: pm.transfermarktPlayerName,
        transfermarktPlayerId: pm.transfermarktPlayerId,
        valueEur: pm.valueEur !== null ? String(pm.valueEur) : null,
        matchConfidence: pm.confidence,
        matchStatus: pm.status,
        manualOverride: false,
        lastScrapedAt: now,
        lastSeenAt: runStartedAt,
        updatedAt: now,
      },
    })
}

interface ReviewEntryInput {
  entityType: "team" | "player"
  entityId: number
  entityName: string
  candidateName: string | null
  candidateTransfermarktId: string | null
  candidateValueEur: number | null
  confidence: number
}

/**
 * Review kuyruğuna deterministik id (`${entityType}-${entityId}`) ile yazar,
 * böylece cron her çalıştığında aynı belirsiz eşleşme için kuyrukta sonsuz
 * çoğalma olmaz — kayıt güncellenir.
 *
 * Bu fonksiyon SADECE kilitsiz (manualOverride yok / matched değil) bir
 * entity için çağrılır (bkz. syncSingleTeam / syncTeamPlayers — onaylanmış
 * "matched" satırlar tamamen bypass edilir, buraya hiç gelmez). Yani:
 * - Hiç dokunulmamış bir entity için ilk kez "pending" oluşturulur.
 * - Admin'in ÖNCEDEN REDDETTİĞİ bir entity, bu haftaki taramada tekrar
 *   belirsiz çıkarsa, eski "rejected" durumu görmezden gelinip kayıt
 *   yeniden "pending"e açılır — admin'in reddetme kararı kalıcı değildir,
 *   bir sonraki taramada sanki hiç reddetmemiş gibi ele alınır.
 * - Aday (candidateTransfermarktId) değişmiş olabileceğinden, eski
 *   candidateCountry / countryLookupAttempted da sıfırlanır ki admin
 *   panelindeki "eksik ülke bilgilerini doldur" butonu yeni aday için taze
 *   veri çeksin (entityCountry genelde sabit kalır ama tutarlılık için o da
 *   sıfırlanır).
 */
async function upsertReviewQueueEntry(input: ReviewEntryInput): Promise<void> {
  const id = `${input.entityType}-${input.entityId}`
  const now = new Date()

  await db
    .insert(marketValueReviewQueue)
    .values({
      id,
      entityType: input.entityType,
      entityId: input.entityId,
      entityName: input.entityName,
      candidateName: input.candidateName,
      candidateTransfermarktId: input.candidateTransfermarktId,
      candidateValueEur: input.candidateValueEur !== null ? String(input.candidateValueEur) : null,
      confidence: input.confidence,
      status: "pending",
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: marketValueReviewQueue.id,
      set: {
        entityName: input.entityName,
        entityCountry: null,
        candidateName: input.candidateName,
        candidateTransfermarktId: input.candidateTransfermarktId,
        candidateCountry: null,
        countryLookupAttempted: false,
        candidateValueEur: input.candidateValueEur !== null ? String(input.candidateValueEur) : null,
        confidence: input.confidence,
        status: "pending",
        resolvedAt: null,
      },
    })
}

export interface CleanupResult {
  skipped: boolean
  teamsDeleted: number
  playersDeleted: number
  reviewEntriesDeleted: number
}

/**
 * 24 ligin TÜMÜ bu haftalık cron döngüsünde hatasız işlendiyse çağrılır
 * (bkz. app/api/cron/update-market-values). "Hayalet" kayıtları temizler:
 *
 * - Bir takım artık takip edilen 24 ligden hiçbirinin standings'inde
 *   çıkmıyorsa (relegasyon, lig değişikliği, kulüp feshi vb.) o takımın
 *   satırının lastSeenAt'i bu döngüde hiç güncellenmemiştir.
 * - Bir oyuncu artık taranan hiçbir takımın kadrosunda görünmüyorsa
 *   (transfer, emeklilik, sözleşme feshi vb.) aynı şekilde geride kalır.
 *
 * Bu, admin'in manuel onayladığı (manualOverride) satırları da kapsar —
 * eşleşme kilitli olsa da varlığın kendisi artık gerçek değilse ghost kayıt
 * olarak silinir; kilit sadece "hâlâ var olan bir varlığın eşleşmesini
 * yeniden hesaplama" işlemini engeller, "artık var olmayan bir varlığı
 * sonsuza dek DB'de tutma" işlemini değil.
 *
 * hadErrors=true ise hiçbir şey silinmez — bu döngüde bir veya daha fazla
 * lig transient bir hata yüzünden atlanmış olabilir, bu da o ligin
 * takımlarının lastSeenAt'inin yanlışlıkla geride kalmasına (ve gerçek,
 * hâlâ aktif takımların silinmesine) yol açabilir. Bir dahaki hatasız
 * döngüye kadar beklemek daha güvenlidir.
 */
export async function cleanupStaleMarketValueRows(runStartedAt: Date, hadErrors: boolean): Promise<CleanupResult> {
  if (hadErrors) {
    console.log("[v0] Cron döngüsünde hata(lar) oluştu — hayalet kayıt temizliği bu hafta atlanıyor.")
    return { skipped: true, teamsDeleted: 0, playersDeleted: 0, reviewEntriesDeleted: 0 }
  }

  const staleTeams = await db
    .delete(teamMarketValue)
    .where(lt(teamMarketValue.lastSeenAt, runStartedAt))
    .returning({ teamId: teamMarketValue.teamId })

  const stalePlayers = await db
    .delete(playerMarketValue)
    .where(lt(playerMarketValue.lastSeenAt, runStartedAt))
    .returning({ playerId: playerMarketValue.playerId })

  let reviewEntriesDeleted = 0
  const staleTeamIds = staleTeams.map((t) => t.teamId)
  const stalePlayerIds = stalePlayers.map((p) => p.playerId)

  // Silinen varlıklara ait, henüz karar verilmemiş review kuyruğu kayıtlarını
  // da temizle — artık var olmayan bir takım/oyuncu için "onayla/reddet"
  // gösterilmesin.
  if (staleTeamIds.length > 0 || stalePlayerIds.length > 0) {
    const conditions = []
    if (staleTeamIds.length > 0) {
      conditions.push(and(eq(marketValueReviewQueue.entityType, "team"), inArray(marketValueReviewQueue.entityId, staleTeamIds)))
    }
    if (stalePlayerIds.length > 0) {
      conditions.push(and(eq(marketValueReviewQueue.entityType, "player"), inArray(marketValueReviewQueue.entityId, stalePlayerIds)))
    }
    const deleted = await db
      .delete(marketValueReviewQueue)
      .where(or(...conditions))
      .returning({ id: marketValueReviewQueue.id })
    reviewEntriesDeleted = deleted.length
  }

  console.log(
    `[v0] Hayalet kayıt temizliği tamamlandı: ${staleTeams.length} takım, ${stalePlayers.length} oyuncu, ${reviewEntriesDeleted} review kaydı silindi.`,
  )

  return {
    skipped: false,
    teamsDeleted: staleTeams.length,
    playersDeleted: stalePlayers.length,
    reviewEntriesDeleted,
  }
}

export { SCRAPABLE_LEAGUE_IDS }
