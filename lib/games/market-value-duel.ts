import crypto from "crypto"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { playerMarketValue, teamMarketValue } from "@/lib/db/schema"
import { safeApiFootballFetch } from "@/lib/api-football-client"
import { toTurkishCountry } from "@/lib/tr-aliases"
import { getPlayerMarketValues } from "@/lib/market-values"

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

function difficultyCondition(difficulty: DuelDifficulty) {
  const eliteLeagues = sql.join(ELITE_LEAGUE_IDS, sql`, `)
  const knownLeagues = sql.join(KNOWN_LEAGUE_IDS, sql`, `)

  switch (difficulty) {
    case "easy":
      // Herkesin bilebileceği: elit liglerde oynayan, süperstar seviyesinde
      // (35M€ ve üzeri) oyuncular.
      return sql`${teamMarketValue.leagueId} in (${eliteLeagues}) and ${playerMarketValue.valueEur} >= 35000000`
    case "normal":
      // Futbolla az çok ilgilenen birinin bilebileceği: bilinen liglerde
      // oynayan, orta-üst düzey değere sahip oyuncular.
      return sql`${teamMarketValue.leagueId} in (${knownLeagues}) and ${playerMarketValue.valueEur} >= 5000000 and ${playerMarketValue.valueEur} < 35000000`
    case "hard":
      // Sadece işin fanatiği olanların bileceği: küçük liglerde oynayan
      // veya düşük piyasa değerine sahip oyuncular.
      return sql`(${teamMarketValue.leagueId} not in (${knownLeagues}) or ${playerMarketValue.valueEur} < 5000000)`
  }
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
async function pickRandomMatchedPlayers(count: number, difficulty: DuelDifficulty, excludeIds: number[] = []) {
  const exclude = excludeIds.length > 0 ? sql`and ${playerMarketValue.playerId} not in (${sql.join(excludeIds, sql`, `)})` : sql``
  const rows = await db
    .select({
      playerId: playerMarketValue.playerId,
      playerName: playerMarketValue.playerName,
      valueEur: playerMarketValue.valueEur,
    })
    .from(playerMarketValue)
    .innerJoin(teamMarketValue, sql`${teamMarketValue.teamId} = ${playerMarketValue.teamId}`)
    .where(
      sql`${playerMarketValue.matchStatus} = 'matched' and ${playerMarketValue.valueEur} is not null and ${playerMarketValue.valueEur} > 0 and ${teamMarketValue.matchStatus} = 'matched' and (${difficultyCondition(difficulty)}) ${exclude}`,
    )
    .orderBy(sql`random()`)
    .limit(count)

  return rows
}

/**
 * API-Football'dan tek bir oyuncunun fotoğraf/takım/uyruk bilgisini çeker.
 * Fotoğraf, takım veya ülke bilgisinden biri eksikse `null` döner — bu
 * oyuncu kart olarak asla gösterilmeyecek (yarım/eksik kart oyunu bozar).
 */
async function enrichPlayer(playerId: number, fallbackName: string): Promise<DuelPlayer | null> {
  const season = currentSeason()
  const raw = await safeApiFootballFetch<any>("/players", { id: playerId, season })
  const entry = raw[0]
  const p = entry?.player ?? {}
  const stats = entry?.statistics?.[0] ?? {}

  const photo: string | null = typeof p.photo === "string" && p.photo.trim().length > 0 ? p.photo : null
  const teamName: string | null =
    stats.team && typeof stats.team.name === "string" && stats.team.name.trim().length > 0 ? stats.team.name : null
  const country: string | null = p.nationality ? toTurkishCountry(p.nationality) : null
  const name: string | null = typeof p.name === "string" && p.name.trim().length > 0 ? p.name : fallbackName || null

  // Kart için gereken 4 alandan biri eksikse bu oyuncuyu tamamen ele.
  if (!photo || !teamName || !country || !name) return null

  return {
    id: playerId,
    name,
    photo,
    team: { name: teamName, logo: stats.team?.logo ?? null },
    country,
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
export async function createDuelRound(difficulty: DuelDifficulty = "normal"): Promise<DuelRound | null> {
  const valid: { player: DuelPlayer; valueEur: number }[] = []
  const triedIds: number[] = []

  // Bilgisi eksik (fotoğraf/takım/ülke yok) oyuncuları eleyip, aynı zamanda
  // en az 2 FARKLI piyasa değeri bulana kadar havuzu kademeli olarak büyütür.
  for (
    let round = 0;
    round < MAX_POOL_ROUNDS && (valid.length < 2 || !hasDistinctValues(valid));
    round++
  ) {
    const candidates = await pickRandomMatchedPlayers(POOL_BATCH_SIZE, difficulty, triedIds)
    if (candidates.length === 0) break
    triedIds.push(...candidates.map((c) => c.playerId))

    const enriched = await Promise.all(candidates.map((c) => enrichPlayer(c.playerId, c.playerName)))
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
