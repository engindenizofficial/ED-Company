import crypto from "crypto"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { playerMarketValue } from "@/lib/db/schema"
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

/** Piyasa değeri eşleşmiş satırlardan rastgele `count` adet farklı oyuncu seçer. */
async function pickRandomMatchedPlayers(count: number) {
  const rows = await db
    .select({
      playerId: playerMarketValue.playerId,
      playerName: playerMarketValue.playerName,
      valueEur: playerMarketValue.valueEur,
    })
    .from(playerMarketValue)
    .where(sql`${playerMarketValue.matchStatus} = 'matched' and ${playerMarketValue.valueEur} is not null and ${playerMarketValue.valueEur} > 0`)
    .orderBy(sql`random()`)
    .limit(count)

  return rows
}

/** API-Football'dan tek bir oyuncunun fotoğraf/takım/uyruk bilgisini çeker. */
async function enrichPlayer(playerId: number, fallbackName: string): Promise<DuelPlayer> {
  const season = currentSeason()
  const raw = await safeApiFootballFetch<any>("/players", { id: playerId, season })
  const entry = raw[0]
  const p = entry?.player ?? {}
  const stats = entry?.statistics?.[0] ?? {}

  return {
    id: playerId,
    name: p.name || fallbackName,
    photo: p.photo ?? null,
    team: stats.team ? { name: stats.team.name, logo: stats.team.logo ?? null } : null,
    country: p.nationality ? toTurkishCountry(p.nationality) : null,
  }
}

/** Yeni bir düello turu üretir: 2 rastgele oyuncu + imzalı tur jetonu. Değer içermez. */
export async function createDuelRound(): Promise<DuelRound | null> {
  // Aynı ikilinin tekrar tekrar çıkmasını azaltmak için havuzdan biraz daha
  // fazla satır çekip aralarından 2 farklı oyuncu seçiyoruz.
  const candidates = await pickRandomMatchedPlayers(2)
  if (candidates.length < 2) return null

  const [a, b] = candidates
  const [playerA, playerB] = await Promise.all([
    enrichPlayer(a.playerId, a.playerName),
    enrichPlayer(b.playerId, b.playerName),
  ])

  const token = signRoundToken([a.playerId, b.playerId])
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
