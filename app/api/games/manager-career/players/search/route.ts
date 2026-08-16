import { NextRequest, NextResponse } from "next/server"
import { getSquad, getPlayerRoleAndPhoto } from "@/lib/api-football"
import { db } from "@/lib/db"
import { playerMarketValue, teamMarketValue, playerPower, playerPosition } from "@/lib/db/schema"
import { and, eq, gt, inArray } from "drizzle-orm"
import type { PlayerRole } from "@/lib/games/manager-career"
import { PLAYER_ROLES } from "@/lib/games/manager-career"
import { computeLivePowerFromMarketValue } from "@/lib/player-power"
import { profile, type PositionProfile } from "@/lib/player-positions"

export const dynamic = "force-dynamic"

export interface ManagerPlayerSearchResult {
  id: number
  name: string
  photo: string | null
  nationality: string | null
  age: number | null
  teamName: string | null
  teamLogo: string | null
  /** Ham API-Football mevki kategorisi. */
  role: PlayerRole
  /** Piyasa değeri, tam euro — kadroya eklerken bütçeden düşülecek tutar. */
  priceEur: number
  /**
   * Oyuncu güç motorunun ürettiği 1-99 puan (bkz. lib/player-power.ts). DB'de
   * güç satırı olmayan oyuncular için piyasa değerinden anlık hesaplanır
   * (form/rating verisi yansımaz, sadece taban güç).
   */
  power: number | null
  /**
   * Transfermarkt kaynaklı alt mevki profili (bkz. lib/player-positions.ts).
   * Backfill henüz bu oyuncuya ulaşmadıysa null döner — kadro ekranı bu
   * durumda doğrulanmamış (nötr) olarak ele alır, hatalı bir mevki
   * uydurmaz.
   */
  position: PositionProfile | null
}

interface CandidateRow {
  playerId: number
  playerName: string
  /**
   * Transfermarkt kaynaklı TAM ad, örn. "Ousmane Dembélé" — playerName ise
   * API-Football'ın kısaltılmış formatı ("O. Dembélé"). Kullanıcı ismiyle
   * VEYA soyismiyle arayabilsin diye arama bu ikisinin BİRLEŞİMİNE bakar.
   * Eski (backfill'den önce eklenen) satırlarda null olabilir.
   */
  fullName: string | null
  teamId: number
  teamName: string | null
  valueEur: number
}

// ---------------------------------------------------------------------------
// Arama artık API-Football'a canlı bir "search" isteği ATMIYOR. Eski
// yaklaşım her karakter için 20 ligin TAMAMINA paralel istek atıyordu; bu,
// API-Football'ın dakikalık rate limit'ini anında aşıp isteklerin çoğunun
// "Too many requests" ile boş dönmesine (ve dolayısıyla "oyuncuların çoğu
// yokmuş gibi" görünmesine) sebep oluyordu.
//
// Yeni yaklaşım: piyasa değeri DB'sindeki (zaten scrape+eşleştirme ile
// doldurulmuş, ~7-8 bin oyuncu kapsayan) satırlar TEK kaynak olarak
// kullanılır — isim eşleştirmesi tamamen bizim tarafımızda, API çağrısı
// gerektirmeden yapılır. Mevki (role) ve fotoğraf bilgisi için SADECE
// eşleşen adayların takımlarına, takım başına BİR KEZ (ve 1 saat cache'li)
// `/players/squads` isteği atılır — bu, aynı arama string'i için 20 istek
// yerine genelde 1-5 istek anlamına gelir ve API-Football'ın kendi
// response cache'i sayesinde tekrarlanan aramalar hiç dış istek yapmaz.
// ---------------------------------------------------------------------------

let candidateCache: { rows: CandidateRow[]; fetchedAt: number } | null = null
const CANDIDATE_CACHE_TTL_MS = 2 * 60 * 1000

async function getCandidateRows(): Promise<CandidateRow[]> {
  if (candidateCache && Date.now() - candidateCache.fetchedAt < CANDIDATE_CACHE_TTL_MS) {
    return candidateCache.rows
  }

  const rows = await db
    .select({
      playerId: playerMarketValue.playerId,
      playerName: playerMarketValue.playerName,
      fullName: playerMarketValue.fullName,
      teamId: playerMarketValue.teamId,
      teamName: teamMarketValue.teamName,
      valueEur: playerMarketValue.valueEur,
    })
    .from(playerMarketValue)
    .leftJoin(teamMarketValue, eq(teamMarketValue.teamId, playerMarketValue.teamId))
    .where(and(eq(playerMarketValue.matchStatus, "matched"), gt(playerMarketValue.valueEur, "0")))

  const parsed: CandidateRow[] = rows.map((r) => ({
    playerId: r.playerId,
    playerName: r.playerName,
    fullName: r.fullName,
    teamId: r.teamId,
    teamName: r.teamName,
    valueEur: Number(r.valueEur),
  }))

  candidateCache = { rows: parsed, fetchedAt: Date.now() }
  return parsed
}

/** API-Football takım logosu, sabit URL şablonu — ekstra istek gerektirmez. */
function teamLogoUrl(teamId: number): string {
  return `https://media.api-sports.io/football/teams/${teamId}.png`
}

/** Aynı anda en fazla `size` kadar öğeyi işler — API-Football'a ani istek yığını (rate limit riski) göndermemek için. */
async function mapWithConcurrency<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker))
  return results
}

/**
 * Türkçe harfleri (ş,ç,ğ,ü,ö,ı,İ) VE genel Latin aksanlarını (é,í,á,ã,ê,ñ,ç...)
 * sadeleştirir. Oyuncu isimleri Transfermarkt kaynaklı olduğundan çoğu
 * (Mbappé, Vinícius, Müller vb.) aksanlı yazılıyor — kullanıcı aksansız
 * yazdığında (Mbappe, Vinicius) da eşleşmesi için ikisi de gerekli.
 */
function normalizeTR(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

/**
 * Menajer kariyeri kadro kurma ekranı için oyuncu araması.
 *
 * `/api/players/search`'ten iki farkı var:
 * 1. `role` parametresiyle mevkiye göre filtrelenebilir — bir slota tıklayıp
 *    açılan arama sadece o slotun rolüne uyan oyuncuları göstersin diye.
 * 2. Sonuçlar DB'deki piyasa değeri (matched + valueEur > 0) ile eşleştirilir
 *    ve piyasa değeri OLMAYAN oyuncular tamamen elenir — fiyatı bilinmeyen
 *    bir oyuncu kadroya eklenip bütçeden yanlış (veya hiç) tutar düşülemez.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? ""
  const roleParam = req.nextUrl.searchParams.get("role")
  const roleFilter: PlayerRole | null = roleParam && PLAYER_ROLES.includes(roleParam as PlayerRole) ? (roleParam as PlayerRole) : null

  if (q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const qNorm = normalizeTR(q)
  const allCandidates = await getCandidateRows()

  // Kısa ad ("O. Dembélé") VE tam ad ("Ousmane Dembélé") birleştirilip
  // aranır — kullanıcı "Ousmane" yazdığında sadece soyismi tutan playerName
  // eşleşmediği için tam ada da bakılması gerekiyor. Aynı şekilde başlangıç
  // eşleşmesi (isim ya da soyisimle başlama) sıralamada öne alınır.
  const searchableOf = (c: CandidateRow) => normalizeTR(`${c.fullName ?? ""} ${c.playerName}`)

  const matches = allCandidates
    .filter((c) => searchableOf(c).includes(qNorm))
    .sort((a, b) => {
      const aTokens = searchableOf(a).split(" ")
      const bTokens = searchableOf(b).split(" ")
      const aStarts = aTokens.some((t) => t.startsWith(qNorm))
      const bStarts = bTokens.some((t) => t.startsWith(qNorm))
      if (aStarts !== bStarts) return aStarts ? -1 : 1
      return b.valueEur - a.valueEur
    })
    .slice(0, 30)

  if (matches.length === 0) {
    return NextResponse.json({ results: [] })
  }

  // Mevki bilgisi DB'de yok — eşleşen adayların takımlarına, takım başına
  // BİR KEZ /players/squads isteği atılır (1 saat cache'li, düşük eşzamanlılık).
  const uniqueTeamIds = Array.from(new Set(matches.map((m) => m.teamId)))
  const squadEntries = await mapWithConcurrency(uniqueTeamIds, 4, async (teamId) => {
    try {
      return [teamId, await getSquad(teamId)] as const
    } catch {
      return [teamId, []] as const
    }
  })

  const roleByPlayerId = new Map<number, { role: PlayerRole; photo: string | null; age: number | null }>()
  for (const [, squad] of squadEntries) {
    for (const sp of squad) {
      if (sp.pos && PLAYER_ROLES.includes(sp.pos as PlayerRole)) {
        roleByPlayerId.set(sp.id, { role: sp.pos as PlayerRole, photo: sp.photo, age: sp.age })
      }
    }
  }

  // DB'de piyasa değeriyle eşleşmiş ama takımının GÜNCEL kadro listesinde
  // (transfer, kiralık, listeye eklenmemiş vb. nedenlerle) bulunamayan
  // adaylar için oyuncunun kendi profilinden tek-tek fallback sorgusu
  // yapılır — aksi halde bu oyuncular arama sonuçlarından tamamen kaybolur.
  const missingIds = matches.map((m) => m.playerId).filter((id) => !roleByPlayerId.has(id))
  if (missingIds.length > 0) {
    const fallbackEntries = await mapWithConcurrency(missingIds, 4, async (playerId) => {
      try {
        return [playerId, await getPlayerRoleAndPhoto(playerId)] as const
      } catch {
        return [playerId, null] as const
      }
    })
    for (const [playerId, info] of fallbackEntries) {
      if (info?.role && PLAYER_ROLES.includes(info.role as PlayerRole)) {
        roleByPlayerId.set(playerId, { role: info.role as PlayerRole, photo: info.photo, age: info.age })
      }
    }
  }

  // Güç motorunun bu adaylar için üretmiş olduğu satırları toplu oku — satırı
  // olmayan oyuncular için aşağıda piyasa değerinden anlık hesaplanır.
  const powerRows = await db
    .select({ playerId: playerPower.playerId, currentPower: playerPower.currentPower })
    .from(playerPower)
    .where(inArray(playerPower.playerId, matches.map((m) => m.playerId)))
  const powerByPlayerId = new Map(powerRows.map((r) => [r.playerId, r.currentPower]))

  // Mevki backfill'i kademeli çalıştığı için (bkz. lib/player-position-sync.ts)
  // her oyuncu için satır olmayabilir — bu durumda position: null döner ve
  // kadro ekranı doğrulanmamış (nötr) fallback kullanır.
  const positionRows = await db
    .select({
      playerId: playerPosition.playerId,
      mainPosition: playerPosition.mainPosition,
      secondaryPositions: playerPosition.secondaryPositions,
      source: playerPosition.source,
    })
    .from(playerPosition)
    .where(inArray(playerPosition.playerId, matches.map((m) => m.playerId)))
  const positionByPlayerId = new Map(
    positionRows.map((r) => [
      r.playerId,
      profile(r.mainPosition, (r.secondaryPositions as string[]) ?? [], r.source as "transfermarkt" | "unverified"),
    ]),
  )

  const results: ManagerPlayerSearchResult[] = matches
    .map((c) => {
      const info = roleByPlayerId.get(c.playerId)
      if (!info) return null
      if (roleFilter && info.role !== roleFilter) return null
      const result: ManagerPlayerSearchResult = {
        id: c.playerId,
        name: c.playerName,
        photo: info.photo,
        nationality: null,
        age: info.age,
        teamName: c.teamName,
        teamLogo: teamLogoUrl(c.teamId),
        role: info.role,
        priceEur: c.valueEur,
        power: powerByPlayerId.get(c.playerId) ?? computeLivePowerFromMarketValue(c.valueEur),
        position: positionByPlayerId.get(c.playerId) ?? null,
      }
      return result
    })
    .filter((r): r is ManagerPlayerSearchResult => r !== null)
    .slice(0, 20)

  return NextResponse.json({ results })
}
