import crypto from "crypto"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { playerMarketValue, teamMarketValue } from "@/lib/db/schema"
import { safeApiFootballFetch } from "@/lib/api-football-client"
import { calculateAge } from "@/lib/api-football"
import { toTurkishCountry } from "@/lib/tr-aliases"
import { getPlayerMarketValues } from "@/lib/market-values"
import { DUEL_SELECTABLE_LEAGUE_IDS } from "@/lib/leagues"

// ---------------------------------------------------------------------------
// "Piyasa Değeri Düellosu" oyunu — sunucu tarafı yardımcıları.
//
// Akış:
// 1. DB'den piyasa değeri eşleşmiş (matchStatus="matched") 2 rastgele oyuncu
//    seçilir.
// 2. API-Football'dan fotoğraf/takım/uyruk bilgisi zenginleştirilir.
// 3. İstemciye piyasa değeri GÖNDERİLMEZ — sadece imzalı bir "roundToken"
//    (iki oyuncu id'sini taşır) gönderilir.
// 4. Kullanıcı tahmin yaptığında istemci roundToken'ı geri gönderir, sunucu
//    imzayı doğrular, değerleri DB'den tekrar okur ve sonucu döner. Böylece
//    istemci hiçbir zaman cevabı tahminden önce göremez.
// ---------------------------------------------------------------------------

export interface DuelPlayer {
  id: number
  name: string
  photo: string | null
  team: { name: string; logo: string | null } | null
  country: string | null
  age: number | null
  /** API-Football ham pozisyon değeri: "Goalkeeper" | "Defender" | "Midfielder" | "Attacker" */
  position: string | null
}

export interface DuelRound {
  token: string
  players: [DuelPlayer, DuelPlayer]
}

export interface DuelResult {
  correctId: number
  values: Record<number, number | null>
}

export type DuelDifficulty = "easy" | "normal" | "hard"

// ---------------------------------------------------------------------------
// Zorluk seviyeleri — takımın oynadığı ligin "ünü" ve oyuncunun piyasa
// değeri kombinasyonuna göre "ne kadar tanınır" olduğunu yaklaştırıyoruz.
// Elimizde doğrudan bir popülerlik metriği yok, ama Avrupa'nın en büyük 5
// liginde oynayan + çok yüksek değerli oyuncular herkesin tanıdığı
// süperstarlardır; küçük liglerde oynayan / düşük değerli oyuncular ise
// sadece işin ehli taraftarların bileceği isimlerdir.
// ---------------------------------------------------------------------------

/** İngiltere, İspanya, İtalya, Almanya, Fransa — en yüksek görünürlüklü 5 lig. */
const ELITE_LEAGUE_IDS = [39, 140, 135, 78, 61]
/** Elit ligler + Avrupa'da hâlâ genel bilinirliği olan orta seviye ligler. */
const KNOWN_LEAGUE_IDS = [...ELITE_LEAGUE_IDS, 94, 203, 88, 144, 197, 179]

/**
 * `hasLeagueFilter` true ise (kullanıcı belirli ligler seçtiyse), zorluk
 * koşulundan sabit "elit/bilinen lig" kısıtını ÇIKARIYORUZ ve sadece piyasa
 * değeri eşiğini uyguluyoruz. Aksi halde bu iki koşul AND ile birleşiyor ve
 * kullanıcı elit/bilinen listelerde olmayan bir ligi seçtiğinde (örn. "Kolay"
 * zorluk + Süper Lig) sorgu HER ZAMAN boş dönerdi — "Yeterli oyuncu verisi
 * bulunamadı" hatası sürekli tekrarlanırdı. Lig seçimi olmadığında davranış
 * değişmez: zorluk hâlâ hem lige hem değere bakar.
 */
function difficultyCondition(difficulty: DuelDifficulty, hasLeagueFilter: boolean) {
  const eliteLeagues = sql.join(ELITE_LEAGUE_IDS, sql`, `)
  const knownLeagues = sql.join(KNOWN_LEAGUE_IDS, sql`, `)

  switch (difficulty) {
    case "easy":
      // Herkesin bilebileceği: süperstar seviyesinde (35M€ ve üzeri)
      // oyuncular. Lig filtresi yoksa ayrıca elit liglerle sınırlandırılır.
      return hasLeagueFilter
        ? sql`${playerMarketValue.valueEur} >= 35000000`
        : sql`${teamMarketValue.leagueId} in (${eliteLeagues}) and ${playerMarketValue.valueEur} >= 35000000`
    case "normal":
      // Futbolla az çok ilgilenen birinin bilebileceği: orta-üst düzey
      // değere sahip oyuncular. Lig filtresi yoksa ayrıca bilinen liglerle
      // sınırlandırılır.
      return hasLeagueFilter
        ? sql`${playerMarketValue.valueEur} >= 5000000 and ${playerMarketValue.valueEur} < 35000000`
        : sql`${teamMarketValue.leagueId} in (${knownLeagues}) and ${playerMarketValue.valueEur} >= 5000000 and ${playerMarketValue.valueEur} < 35000000`
    case "hard":
      // Sadece işin fanatiği olanların bileceği: düşük piyasa değerine
      // sahip oyuncular. Lig filtresi yoksa ayrıca küçük ligleri de dahil
      // eder (bilinen liglerde olmayan herkes).
      return hasLeagueFilter
        ? sql`${playerMarketValue.valueEur} < 5000000`
        : sql`(${teamMarketValue.leagueId} not in (${knownLeagues}) or ${playerMarketValue.valueEur} < 5000000)`
  }
}

/**
 * Kullanıcının gönderdiği lig id listesini doğrular: sadece seçilebilir
 * (ulusal) liglere ait, tekrarsız id'leri tutar. Geçersiz/bilinmeyen id'ler
 * sessizce elenir. Sonuç boşsa (hiç geçerli id yoksa) `null` döner — bu,
 * "filtre yok / tüm ligler" anlamına gelir, hatalı bir isteği tur oluşmadan
 * elemek yerine güvenli bir şekilde tüm liglere geri düşürür.
 */
export function normalizeLeagueFilter(leagueIds: number[] | undefined): number[] | null {
  if (!leagueIds || leagueIds.length === 0) return null
  const valid = Array.from(new Set(leagueIds)).filter((id) => DUEL_SELECTABLE_LEAGUE_IDS.includes(id))
  // Kullanıcı fiilen TÜM seçilebilir ligleri seçtiyse, filtre uygulamanın
  // sorgu maliyeti dışında bir anlamı yok — ama zararı da yok, o yüzden
  // sadece boş sonucu "filtre yok" olarak ele alıyoruz.
  return valid.length > 0 ? valid : null
}

function currentSeason(): number {
  const now = new Date()
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
}

function signingSecret(): string {
  return process.env.CRON_SECRET || process.env.BETTER_AUTH_SECRET || "market-value-duel-fallback"
}

/** İki oyuncu id'sini taşıyan imzalı, sahtesi yapılamaz bir tur jetonu üretir. */
function signRoundToken(playerIds: [number, number]): string {
  const payload = JSON.stringify(playerIds)
  const payloadB64 = Buffer.from(payload).toString("base64url")
  const signature = crypto.createHmac("sha256", signingSecret()).update(payloadB64).digest("base64url")
  return `${payloadB64}.${signature}`
}

/** Jetonu doğrular ve içindeki iki oyuncu id'sini döner. Geçersizse null. */
export function verifyRoundToken(token: string): [number, number] | null {
  const [payloadB64, signature] = token.split(".")
  if (!payloadB64 || !signature) return null

  const expected = crypto.createHmac("sha256", signingSecret()).update(payloadB64).digest("base64url")
  const expectedBuf = Buffer.from(expected)
  const signatureBuf = Buffer.from(signature)
  if (expectedBuf.length !== signatureBuf.length || !crypto.timingSafeEqual(expectedBuf, signatureBuf)) {
    return null
  }

  try {
    const ids = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"))
    if (Array.isArray(ids) && ids.length === 2 && ids.every((n) => typeof n === "number")) {
      return [ids[0], ids[1]]
    }
    return null
  } catch {
    return null
  }
}

/**
 * Piyasa değeri eşleşmiş satırlardan, seçilen zorluk seviyesine uyan rastgele
 * `count` adet farklı oyuncu seçer. Zorluk filtresi oyuncunun o anki takımının
 * ligine (team_market_value.leagueId) ve piyasa değerine bakar.
 */
async function pickRandomMatchedPlayers(
  count: number,
  difficulty: DuelDifficulty,
  leagueFilter: number[] | null,
  excludeIds: number[] = [],
) {
  const exclude = excludeIds.length > 0 ? sql`and ${playerMarketValue.playerId} not in (${sql.join(excludeIds, sql`, `)})` : sql``
  // Kullanıcı belirli ligler seçtiyse, oyuncunun o anki takımının ligine
  // (teamMarketValue.leagueId) göre filtrele. Zorluk filtresiyle (elit/bilinen
  // lig listeleri) AYRI ve EK bir koşuldur — "hard" zorluğunda küçük ligleri
  // tercih eden mantık, kullanıcının seçtiği lig havuzunun İÇİNDE uygulanır.
  const leagueCondition =
    leagueFilter !== null ? sql`and ${teamMarketValue.leagueId} in (${sql.join(leagueFilter, sql`, `)})` : sql``
  const rows = await db
    .select({
      playerId: playerMarketValue.playerId,
      playerName: playerMarketValue.playerName,
      valueEur: playerMarketValue.valueEur,
      // Bu oyuncunun eşleştirildiği anda oynadığı GERÇEK kulüp takımı — API-Football'ın
      // /players uç noktasındaki "statistics" dizisinde hangi bloğun kulüp takımına ait
      // olduğunu (millî takım bloklarından ayırt ederek) bulmak için kullanılır.
      teamId: playerMarketValue.teamId,
    })
    .from(playerMarketValue)
    .innerJoin(teamMarketValue, sql`${teamMarketValue.teamId} = ${playerMarketValue.teamId}`)
    .where(
      sql`${playerMarketValue.matchStatus} = 'matched' and ${playerMarketValue.valueEur} is not null and ${playerMarketValue.valueEur} > 0 and ${teamMarketValue.matchStatus} = 'matched' and (${difficultyCondition(difficulty, leagueFilter !== null)}) ${leagueCondition} ${exclude}`,
    )
    .orderBy(sql`random()`)
    .limit(count)

  return rows
}

function mostMinutes(blocks: any[]): any | null {
  if (blocks.length === 0) return null
  return blocks.reduce((best, current) => {
    const bestMinutes = best?.games?.minutes ?? 0
    const currentMinutes = current?.games?.minutes ?? 0
    return currentMinutes > bestMinutes ? current : best
  })
}

/**
 * API-Football'ın /players uç noktası "statistics" dizisinde, oyuncunun o
 * sezon forma giydiği HER turnuva için bir blok döner: kulüp ligi, kulüp
 * kupaları, Şampiyonlar Ligi VE varsa millî takım maçları hepsi ayrı
 * bloklardır ve `team` nesnesinde bunu ayırt edecek bir bayrak YOKTUR (test
 * edildi). Bu yüzden statistics dizisi TEK BAŞINA hangi takımın "gerçek
 * kulüp" olduğunu asla güvenilir belirleyemez — SADECE zaten bildiğimiz bir
 * takım id'sine (actualTeamId, bkz. resolveActualTeam) ait bloğu bulmak
 * için kullanılır; en çok dakika aldığı blok seçilir (lig + kupa gibi
 * birden fazla blok varsa).
 */
function pickClubStatistics(statistics: any[], actualTeamId: number): any | null {
  return mostMinutes(statistics.filter((s) => s?.team?.id === actualTeamId))
}

interface ResolvedTeam {
  id: number
  name: string | null
  logo: string | null
}

/**
 * Bir oyuncunun transfer geçmişinden (yani API-Football'ın /transfers uç
 * noktasından), BUGÜNE kadar gerçekleşmiş en son transferin "in" (giriş)
 * takımını — oyuncunun ŞU ANDA oynadığı gerçek kulübü — bulur.
 *
 * Bu, istatistik bloklarından çok daha güvenilir bir kaynaktır: transfer
 * kaydı, o kulüpte henüz hiç maça çıkmamış olsa (örn. sezon arası yeni
 * transfer) bile doğrudur — istatistik bloğu olmadığı için "veri yok"
 * denip elenmesi gerekmez. Ayrıca "bir önceki sezona bak" gibi bir tahmine
 * de ihtiyaç kalmaz: oyuncu transfer olduysa önceki sezonun takımı ZATEN
 * yanlış olurdu, transfer kaydı ise ne zaman olursa olsun her zaman en
 * güncel gerçek kulübü verir.
 */
function resolveTeamFromTransfers(transfersEntry: any, now: Date): ResolvedTeam | null {
  const transfers: any[] = Array.isArray(transfersEntry?.transfers) ? transfersEntry.transfers : []
  const pastTransfers = transfers.filter((t) => {
    const inTeamId = t?.teams?.in?.id
    if (typeof inTeamId !== "number") return false
    const parsed = t?.date ? new Date(t.date) : null
    return parsed !== null && !Number.isNaN(parsed.getTime()) && parsed.getTime() <= now.getTime()
  })
  if (pastTransfers.length === 0) return null

  const latest = pastTransfers.reduce((best, current) =>
    new Date(current.date).getTime() > new Date(best.date).getTime() ? current : best,
  )
  return {
    id: latest.teams.in.id,
    name: typeof latest.teams.in.name === "string" ? latest.teams.in.name : null,
    logo: typeof latest.teams.in.logo === "string" ? latest.teams.in.logo : null,
  }
}

/**
 * Oyuncunun ŞU ANDA oynadığı gerçek kulübü belirler. Öncelik sırası:
 * 1. Transfer geçmişindeki en son (bugüne kadarki) transfer — en güvenilir,
 *    çünkü transfer olsa da olmasa da her zaman doğrudur.
 * 2. Bulunamazsa (oyuncunun kayıtlı transferi yoksa — örn. altyapıdan çıkıp
 *    hiç satılmamış), DB'deki (Transfermarkt eşleşmesi anındaki) bilinen
 *    takıma geri düşülür; isim/logo bilgisi için istatistik bloklarına
 *    bakılır (bkz. enrichPlayer).
 */
function resolveActualTeam(transfersEntry: any, knownTeamId: number): ResolvedTeam {
  return resolveTeamFromTransfers(transfersEntry, new Date()) ?? { id: knownTeamId, name: null, logo: null }
}

/**
 * API-Football'dan tek bir oyuncunun fotoğraf/takım/uyruk/yaş/mevki bilgisini
 * çeker. Fotoğraf, takım veya ülke bilgisinden biri eksikse `null` döner — bu
 * oyuncu kart olarak asla gösterilmeyecek (yarım/eksik kart oyunu bozar).
 *
 * `knownTeamId`, oyuncunun DB'deki (Transfermarkt eşleşmesi anındaki)
 * takımıdır — sadece transfer geçmişi bulunamazsa yedek olarak kullanılır.
 */
async function enrichPlayer(playerId: number, fallbackName: string, knownTeamId: number): Promise<DuelPlayer | null> {
  const season = currentSeason()
  const [playersRaw, transfersRaw] = await Promise.all([
    safeApiFootballFetch<any>("/players", { id: playerId, season }),
    safeApiFootballFetch<any>("/transfers", { player: playerId }),
  ])
  let entry = playersRaw[0]
  let p = entry?.player ?? {}

  const actualTeam = resolveActualTeam(transfersRaw[0], knownTeamId)

  const currentSeasonStats: any[] = Array.isArray(entry?.statistics) ? entry.statistics : []
  let stats = pickClubStatistics(currentSeasonStats, actualTeam.id)

  if (!stats) {
    // Güncel sezonda bu kulübe ait istatistik bloğu yok (örn. yeni transfer,
    // henüz maça çıkmadı) — bir önceki sezona bak. Takım bilgisi zaten
    // yukarıda transferden geldiği için burada asla eski/yanlış bir kulübe
    // düşme riski yok; sadece pozisyon/isim/logo detaylarını tamamlamaya
    // çalışıyoruz.
    const prevRaw = await safeApiFootballFetch<any>("/players", { id: playerId, season: season - 1 })
    const prevEntry = prevRaw[0]
    if (!entry && prevEntry) {
      entry = prevEntry
      p = prevEntry?.player ?? {}
    }
    const prevSeasonStats: any[] = Array.isArray(prevEntry?.statistics) ? prevEntry.statistics : []
    stats = pickClubStatistics(prevSeasonStats, actualTeam.id) ?? {}
  }

  const photo: string | null = typeof p.photo === "string" && p.photo.trim().length > 0 ? p.photo : null
  const teamName: string | null =
    actualTeam.name ??
    (stats.team && typeof stats.team.name === "string" && stats.team.name.trim().length > 0 ? stats.team.name : null)
  const teamLogo: string | null = actualTeam.logo ?? stats.team?.logo ?? null
  const country: string | null = p.nationality ? toTurkishCountry(p.nationality) : null
  const name: string | null = typeof p.name === "string" && p.name.trim().length > 0 ? p.name : fallbackName || null
  const age: number | null = calculateAge(p.birth?.date, p.age)
  const position: string | null =
    typeof stats.games?.position === "string" && stats.games.position.trim().length > 0 ? stats.games.position : null

  // Kart için gereken 4 alandan biri eksikse bu oyuncuyu tamamen ele.
  if (!photo || !teamName || !country || !name) return null

  return {
    id: playerId,
    name,
    photo,
    team: { name: teamName, logo: teamLogo },
    country,
    age,
    position,
  }
}

const MAX_POOL_ROUNDS = 6
const POOL_BATCH_SIZE = 6

/** Havuzda birbirinden farklı piyasa değerine sahip en az 2 oyuncu var mı? */
function hasDistinctValues(pool: { valueEur: number }[]): boolean {
  const first = pool[0]?.valueEur
  return pool.some((p) => p.valueEur !== first)
}

/**
 * Yeni bir düello turu üretir: 2 rastgele (bilgisi TAM olan) oyuncu + imzalı
 * tur jetonu.
 *
 * Piyasa değeri BİREBİR AYNI olan iki oyuncu asla çift olarak seçilmez —
 * "hangisi daha değerli" sorusunun tek/adil bir doğru cevabı olmadığı bir
 * turu göstermek oyunu bozar (hangi kartı seçse "doğru" sayılabilirdi).
 */
export async function createDuelRound(
  difficulty: DuelDifficulty = "normal",
  leagueIds?: number[],
): Promise<DuelRound | null> {
  const leagueFilter = normalizeLeagueFilter(leagueIds)
  const valid: { player: DuelPlayer; valueEur: number }[] = []
  const triedIds: number[] = []

  // Bilgisi eksik (fotoğraf/takım/ülke yok) oyuncuları eleyip, aynı zamanda
  // en az 2 FARKLI piyasa değeri bulana kadar havuzu kademeli olarak büyütür.
  for (
    let round = 0;
    round < MAX_POOL_ROUNDS && (valid.length < 2 || !hasDistinctValues(valid));
    round++
  ) {
    const candidates = await pickRandomMatchedPlayers(POOL_BATCH_SIZE, difficulty, leagueFilter, triedIds)
    if (candidates.length === 0) break
    triedIds.push(...candidates.map((c) => c.playerId))

    const enriched = await Promise.all(candidates.map((c) => enrichPlayer(c.playerId, c.playerName, c.teamId)))
    enriched.forEach((player, idx) => {
      // valueEur, Drizzle'da numeric kolon olduğu için string olarak gelir
      // (WHERE koşulu zaten null/0 olanları elediği için Number() güvenli).
      if (player) valid.push({ player, valueEur: Number(candidates[idx].valueEur) })
    })
  }

  if (valid.length < 2 || !hasDistinctValues(valid)) return null

  // İlk oyuncuyu rastgele seç, ardından SADECE ondan farklı değere sahip
  // oyuncular arasından ikinciyi seç — bu, berabere (adil olmayan) bir turun
  // hiçbir zaman istemciye gönderilmediğini garanti eder.
  const i = Math.floor(Math.random() * valid.length)
  const differentIndices = valid
    .map((_, idx) => idx)
    .filter((idx) => valid[idx].valueEur !== valid[i].valueEur)
  const j = differentIndices[Math.floor(Math.random() * differentIndices.length)]

  const playerA = valid[i].player
  const playerB = valid[j].player

  const token = signRoundToken([playerA.id, playerB.id])
  return { token, players: [playerA, playerB] }
}

/** Bir tahmini değerlendirir: jetonu doğrular, gerçek değerleri DB'den okur. */
export async function resolveDuelRound(token: string): Promise<DuelResult | null> {
  const ids = verifyRoundToken(token)
  if (!ids) return null

  const valueMap = await getPlayerMarketValues(ids)
  const values: Record<number, number | null> = {}
  for (const id of ids) {
    values[id] = valueMap.get(id)?.valueEur ?? null
  }

  const [idA, idB] = ids
  const valueA = values[idA] ?? 0
  const valueB = values[idB] ?? 0
  const correctId = valueA >= valueB ? idA : idB

  return { correctId, values }
}
