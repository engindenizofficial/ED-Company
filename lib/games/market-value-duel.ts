/* eslint-disable @typescript-eslint/no-explicit-any -- API-Football responses are untyped external payloads. */
import crypto from "crypto"
import { safeApiFootballFetch } from "@/lib/api-football-client"
import { calculateAge } from "@/lib/api-football"
import { toTurkishCountry } from "@/lib/tr-aliases"
import { DUEL_SELECTABLE_LEAGUE_IDS } from "@/lib/leagues"
import { getMatchedPlayerCandidates, getPlayerMarketValueMapByIds } from "@/lib/search/market-index"
import { selectDuelPair } from "@/lib/games/duel-pairing"

// ---------------------------------------------------------------------------
// "Piyasa Değeri Düellosu" oyunu — sunucu tarafı yardımcıları.
//
// Akış:
// 1. DB'den piyasa değeri bulunan 2 rastgele oyuncu seçilir.
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
// Zorluk seviyeleri — SABİT euro eşikleri kullanmak yerine, geçerli oyuncu
// HAVUZU içinde piyasa değerine göre YÜZDELİK DİLİM (percentile) kullanıyoruz:
//
//   - "easy"   → havuzdaki en değerli %20'lik dilim
//   - "normal" → ortadaki %50'lik dilim (üstteki %20 ile alttaki %30 hariç)
//   - "hard"   → en düşük değerli %30'luk dilim
//
// Sabit eşiklerin (örn. "35M€ ve üzeri") sorunu şuydu: kullanıcı büyük 5 lig
// dışında bir lig seçtiğinde (örn. sadece Süper Lig), o eşiği geçen oyuncu
// sayısı 1-2'ye düşebiliyordu — bu da hem "Yeterli oyuncu verisi bulunamadı"
// hatasına hem de sürekli aynı 1-2 oyuncunun gelmesine yol açıyordu.
// Yüzdelik dilim yaklaşımı, hangi lig(ler) seçilirse seçilsin havuzu HER ZAMAN
// oranlı şekilde 3'e böler — böylece havuz küçük de olsa büyük de olsa her
// zaman kabul edilebilir büyüklükte, çeşitliliği olan bir alt küme kalır.
// ---------------------------------------------------------------------------

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
 * ligine ve aynı eşleştirilmiş snapshot kaydındaki piyasa değerine bakar.
 */
interface PickedPlayerRow {
  playerId: number
  playerName: string
  valueEur: number
  teamId: number
}

async function pickRandomMatchedPlayers(
  count: number,
  difficulty: DuelDifficulty,
  leagueFilter: number[] | null,
  excludeIds: number[] = [],
) {
  // Lig filtresi yüzdelik hesaplanmadan önce uygulanır; kaynak yalnızca son
  // tamamlanmış koşunun iki doğru snapshot run'ıyla eşleşmiş pozitif değerleridir.
  const excluded = new Set(excludeIds)
  const allowedLeagues = leagueFilter === null ? null : new Set(leagueFilter)
  const candidates = (await getMatchedPlayerCandidates()).filter(
    (player) => !excluded.has(player.playerId) && (!allowedLeagues || allowedLeagues.has(player.leagueId)),
  )

  // Zorluk artık tek oyuncunun değer diliminden değil, seçilecek çiftin değer
  // yakınlığından hesaplanıyor. Bu nedenle farklı değer seviyelerinden geniş
  // bir örneklem alıyoruz; `difficulty` çift seçilirken uygulanıyor.
  void difficulty
  return [...candidates]
    .sort(() => Math.random() - 0.5)
    .slice(0, count)
    .map((player) => ({
      playerId: player.playerId,
      playerName: player.fullName ?? player.playerName,
      valueEur: player.valueEur,
      teamId: player.teamId,
    })) as PickedPlayerRow[]
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
 *    hiç satılmamış), DB'deki son bilinen bilinen
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
 * `knownTeamId`, oyuncunun DB'deki son bilinen
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
  excludeIds: number[] = [],
): Promise<DuelRound | null> {
  const leagueFilter = normalizeLeagueFilter(leagueIds)
  const valid: { player: DuelPlayer; valueEur: number; playerId: number }[] = []
  const triedIds: number[] = [...excludeIds]

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
      if (player) {
        valid.push({ player, valueEur: Number(candidates[idx].valueEur), playerId: player.id })
      }
    })
  }

  if (valid.length < 2 || !hasDistinctValues(valid)) return null

  const pair = selectDuelPair(valid, difficulty)
  if (!pair) return null

  const [first, second] = Math.random() < 0.5 ? pair : [pair[1], pair[0]]
  const playerA = first.player
  const playerB = second.player

  const token = signRoundToken([playerA.id, playerB.id])
  return { token, players: [playerA, playerB] }
}

/** Bir tahmini değerlendirir: jetonu doğrular, gerçek değerleri DB'den okur. */
export async function resolveDuelRound(token: string): Promise<DuelResult | null> {
  const ids = verifyRoundToken(token)
  if (!ids) return null

  const valueMap = await getPlayerMarketValueMapByIds(ids)
  const values: Record<number, number | null> = {
    [ids[0]]: valueMap.get(ids[0]) ?? null,
    [ids[1]]: valueMap.get(ids[1]) ?? null,
  }
  const [idA, idB] = ids
  const valueA = values[idA]
  const valueB = values[idB]
  if (valueA == null || valueB == null) return null
  const correctId = valueA >= valueB ? idA : idB

  return { correctId, values }
}
