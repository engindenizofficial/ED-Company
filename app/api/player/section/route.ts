import { NextResponse } from "next/server"
import { apiFootballFetch } from "@/lib/api-football-client"
import { toTurkishCountry } from "@/lib/tr-aliases"
import type { PlayerSeasonStats, SidelinedEntry, TeamInfo, Transfer, Trophy } from "@/lib/types"

export const dynamic = "force-dynamic"
export const revalidate = 0

// Oyuncu panelindeki her sekme kendi verisini, sadece o sekmeye tıklandığında
// bu endpoint üzerinden ayrı ayrı çeker. Böylece panel açılışında birden fazla
// endpoint aynı anda çekilmiyor; her sekme yalnızca ihtiyacı olan endpoint(ler)i
// tetikliyor. Alttaki safeApiFootballFetch ayrıca kısa süreli cache içeriyor,
// bu yüzden "Sezon İstatistikleri" ve "Kariyer Özeti" sekmeleri aynı veriyi
// paylaşırken de ekstra istek yaratmıyor.
const VALID_SECTIONS = ["stats", "trophies", "transfers", "sidelined"] as const
type Section = (typeof VALID_SECTIONS)[number]

function apiFetch<T>(path: string, params: Record<string, string | number>): Promise<T[]> {
  return apiFootballFetch<T>(path, params, { cache: "no-store" })
}

function currentSeason(): number {
  const now = new Date()
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
}

// Bir oyuncunun kariyeri boyunca oynadığı tüm sezonları yakalamak için geriye
// dönük olarak bu kadar sezon taranır. API-Football'ın çoğu planında geçmiş
// veriler ~2010'lara kadar uzanabildiğinden, tipik bir profesyonel kariyeri
// kapsayacak şekilde geniş bir aralık seçildi. Her sezon tek bir istektir ve
// api-football-client.ts içindeki eş zamanlılık sınırlaması + cache mekanizması
// sayesinde bu, hız sınırlarını (429) tetiklemeden güvenle yapılabilir.
const SEASON_LOOKBACK_YEARS = 20

async function fetchSeasonStats(playerId: number): Promise<PlayerSeasonStats[]> {
  const season = currentSeason()
  const seasons = Array.from({ length: SEASON_LOOKBACK_YEARS }, (_, i) => season - i)
  // Bir sezon isteği başarısız olursa onu boş dizi gibi kabul etme. Bu,
  // oyuncunun o sezondaki takımını sessizce kaybettiriyordu. İstemci zaten
  // 429/5xx için retry uyguluyor; son hata burada route'a taşınır ve kullanıcı
  // eksik veri yerine tekrar deneyebileceği bir hata görür.
  const allSeasonRaw = await Promise.all(
    seasons.map((s) => apiFootballFetch<any>("/players", { id: playerId, season: s }, { cache: "no-store" })),
  )

  // Aynı sezon içindeki tüm turnuva/takım kayıtlarını (lig, kupa, Şampiyonlar
  // Ligi, transfer sonrası ikinci takım vb.) tek bir "sezon toplamı" altında
  // birleştiriyoruz — kullanıcı arayüzünde lig lig değil, sezon sezon
  // (22-23, 23-24, ...) gösterim istendiği için.
  const bySeason = new Map<number, any[]>()
  for (const seasonData of allSeasonRaw) {
    for (const se of seasonData) {
      for (const stat of se.statistics ?? []) {
        if (!stat.team?.id) continue
        const seasonNum = stat.league?.season
        if (seasonNum == null) continue
        if (!bySeason.has(seasonNum)) bySeason.set(seasonNum, [])
        bySeason.get(seasonNum)!.push(stat)
      }
    }
  }

  const results: PlayerSeasonStats[] = []

  for (const [seasonNum, rawStats] of bySeason.entries()) {
    // Aynı takım+turnuva kombinasyonu birden fazla kez gelmişse (API bazen
    // tekrar edebiliyor) tekilleştir.
    const seenKeys = new Set<string>()
    const uniqueRaw = rawStats.filter((stat) => {
      const key = `${stat.team.id}-${stat.league?.id ?? 0}`
      if (seenKeys.has(key)) return false
      seenKeys.add(key)
      return true
    })

    const teamsMap = new Map<number, TeamInfo>()
    const leagueNamesSet = new Set<string>()
    // Birincil takım/turnuva belirlemek için dakika bazlı takip.
    const teamMinutes = new Map<number, number>()
    const leagueMinutes = new Map<number, { id: number; name: string; country: string; logo: string; minutes: number }>()

    let appearances = 0
    let lineups = 0
    let minutes = 0
    let goals = 0
    let assists = 0
    let yellowCards = 0
    let redCards = 0
    let yellowRedCards = 0
    let shotsTotal = 0
    let shotsOn = 0
    let passesTotal = 0
    let passesKey = 0
    let tacklesTotal = 0
    let interceptions = 0
    let blockedShots = 0
    let duelsTotal = 0
    let duelsWon = 0
    let dribblesAttempted = 0
    let dribblesSuccess = 0
    let foulsDrawn = 0
    let foulsCommitted = 0
    let offsides = 0
    let penaltyWon = 0
    let penaltyScored = 0
    let penaltyMissed = 0
    let penaltySaved = 0

    let ratingWeightedSum = 0
    let ratingWeight = 0
    let passAccuracyWeightedSum = 0
    let passAccuracyWeight = 0

    for (const stat of uniqueRaw) {
      const teamId = stat.team.id
      teamsMap.set(teamId, { id: teamId, name: stat.team.name, logo: stat.team.logo ?? "" })
      if (stat.league?.name) leagueNamesSet.add(stat.league.name)

      const statMinutes = stat.games?.minutes ?? 0
      const statAppearances = stat.games?.appearences ?? 0

      teamMinutes.set(teamId, (teamMinutes.get(teamId) ?? 0) + statMinutes)
      if (stat.league?.id) {
        const existing = leagueMinutes.get(stat.league.id)
        leagueMinutes.set(stat.league.id, {
          id: stat.league.id,
          name: stat.league.name ?? "",
          country: toTurkishCountry(stat.league.country ?? ""),
          logo: stat.league.logo ?? "",
          minutes: (existing?.minutes ?? 0) + statMinutes,
        })
      }

      appearances += statAppearances
      lineups += stat.games?.lineups ?? 0
      minutes += statMinutes
      goals += stat.goals?.total ?? 0
      assists += stat.goals?.assists ?? 0
      yellowCards += stat.cards?.yellow ?? 0
      redCards += stat.cards?.red ?? 0
      yellowRedCards += stat.cards?.yellowred ?? 0
      shotsTotal += stat.shots?.total ?? 0
      shotsOn += stat.shots?.on ?? 0
      passesTotal += stat.passes?.total ?? 0
      passesKey += stat.passes?.key ?? 0
      tacklesTotal += stat.tackles?.total ?? 0
      interceptions += stat.tackles?.interceptions ?? 0
      blockedShots += stat.tackles?.blocks ?? 0
      duelsTotal += stat.duels?.total ?? 0
      duelsWon += stat.duels?.won ?? 0
      dribblesAttempted += stat.dribbles?.attempts ?? 0
      dribblesSuccess += stat.dribbles?.success ?? 0
      foulsDrawn += stat.fouls?.drawn ?? 0
      foulsCommitted += stat.fouls?.committed ?? 0
      offsides += stat.offsides ?? 0
      penaltyWon += stat.penalty?.won ?? 0
      penaltyScored += stat.penalty?.scored ?? 0
      penaltyMissed += stat.penalty?.missed ?? 0
      penaltySaved += stat.penalty?.saved ?? 0

      const rating = stat.games?.rating ? Number.parseFloat(stat.games.rating) : null
      if (rating != null && !Number.isNaN(rating) && statAppearances > 0) {
        ratingWeightedSum += rating * statAppearances
        ratingWeight += statAppearances
      }
      const passAccuracy = stat.passes?.accuracy != null ? Number(stat.passes.accuracy) : null
      if (passAccuracy != null && !Number.isNaN(passAccuracy) && statAppearances > 0) {
        passAccuracyWeightedSum += passAccuracy * statAppearances
        passAccuracyWeight += statAppearances
      }
    }

    // Birincil takım: o sezon en çok dakika aldığı takım.
    let primaryTeamId: number | null = null
    let maxTeamMinutes = -1
    for (const [id, m] of teamMinutes.entries()) {
      if (m > maxTeamMinutes) {
        maxTeamMinutes = m
        primaryTeamId = id
      }
    }
    const primaryTeam = primaryTeamId != null ? teamsMap.get(primaryTeamId)! : Array.from(teamsMap.values())[0]

    // Birincil turnuva: o sezon en çok dakika aldığı turnuva (logo gösterimi için).
    let primaryLeague = { id: 0, name: "", country: "", logo: "" }
    let maxLeagueMinutes = -1
    for (const l of leagueMinutes.values()) {
      if (l.minutes > maxLeagueMinutes) {
        maxLeagueMinutes = l.minutes
        primaryLeague = { id: l.id, name: l.name, country: l.country, logo: l.logo }
      }
    }

    results.push({
      season: seasonNum,
      team: primaryTeam,
      teams: Array.from(teamsMap.values()),
      league: primaryLeague,
      leagueNames: Array.from(leagueNamesSet),
      appearances,
      lineups,
      minutes,
      goals,
      assists,
      yellowCards,
      redCards,
      yellowRedCards,
      rating: ratingWeight > 0 ? (ratingWeightedSum / ratingWeight).toFixed(2) : null,
      shotsTotal,
      shotsOn,
      passesTotal,
      passesKey,
      passesAccuracy: passAccuracyWeight > 0 ? (passAccuracyWeightedSum / passAccuracyWeight).toFixed(0) : null,
      tacklesTotal,
      interceptions,
      blockedShots,
      duelsTotal,
      duelsWon,
      dribblesAttempted,
      dribblesSuccess,
      foulsDrawn,
      foulsCommitted,
      offsides,
      penaltyWon,
      penaltyScored,
      penaltyMissed,
      penaltySaved,
    })
  }

  results.sort((a, b) => b.season - a.season)
  return results
}

function noStoreJson<T>(body: T, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init?.headers,
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  })
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const playerId = Number(searchParams.get("playerId"))
  const section = searchParams.get("section") as Section | null

  if (!playerId || isNaN(playerId)) {
    return noStoreJson({ error: "missingPlayerId" }, { status: 400 })
  }
  if (!section || !VALID_SECTIONS.includes(section)) {
    return noStoreJson({ error: "invalidSection" }, { status: 400 })
  }

  try {
    switch (section) {
      case "stats": {
        const data = await fetchSeasonStats(playerId)
        if (data.length === 0) return noStoreJson({ data: null })
        return noStoreJson({ data })
      }

      case "trophies": {
        const trophiesRaw = await apiFetch<any>("/trophies", { player: playerId })
        // ÖNEMLİ — API-Football'ın "/trophies" endpoint'i aynı kupayı (aynı
        // lig + ülke + sezon + sıralama) bazen birden fazla kez döndürüyor.
        // Hiçbir dedup yapılmadan doğrudan map'lendiği için ekranda "Süper Lig
        // 2024/2025" gibi kayıtlar iki kez görünüyordu. Burada lig+ülke+sezon+
        // sıralama kombinasyonuna göre dedup yapılıyor.
        const seenTrophyKeys = new Set<string>()
        const data: Trophy[] = []
        for (const t of trophiesRaw ?? []) {
          const trophy: Trophy = {
            league: t.league ?? "",
            country: toTurkishCountry(t.country ?? ""),
            season: t.season ?? "",
            place: t.place ?? "",
          }
          const key = `${trophy.league}-${trophy.country}-${trophy.season}-${trophy.place}`
          if (seenTrophyKeys.has(key)) continue
          seenTrophyKeys.add(key)
          data.push(trophy)
        }
        if (data.length === 0) return noStoreJson({ data: null })
        return noStoreJson({ data })
      }

      case "transfers": {
        const transfersRaw = await apiFetch<any>("/transfers", { player: playerId })
        const allTransfers: Transfer[] = (transfersRaw ?? []).flatMap((entry: any) =>
          (entry.transfers ?? []).map((tx: any) => ({
            date: tx.date ?? null,
            type: tx.type ?? "",
            teamFrom: { id: tx.teams?.out?.id ?? 0, name: tx.teams?.out?.name ?? "", logo: tx.teams?.out?.logo ?? "" },
            teamTo: { id: tx.teams?.in?.id ?? 0, name: tx.teams?.in?.name ?? "", logo: tx.teams?.in?.logo ?? "" },
          })),
        )
        // ÖNEMLİ — arayüzde (components/player-panel.tsx) tarih t.date.slice(0, 7)
        // ile sadece "YYYY-MM" olarak gösteriliyor, tıpkı takım panelindeki
        // transfer listesinde olduğu gibi (bkz. app/api/team/section/route.ts).
        // API-Football aynı transferi aynı ay içinde birkaç gün farklı tarihle
        // iki kez döndürebildiğinden, dedup anahtarı da tam tarih değil ay
        // bazında olmalı — aksi halde ekranda birebir aynı satır iki kez
        // görünür.
        const seenTransferKeys = new Set<string>()
        const data: Transfer[] = []
        for (const tx of allTransfers.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))) {
          const monthKey = (tx.date ?? "").slice(0, 7)
          const key = `${monthKey}-${tx.teamFrom.id}-${tx.teamTo.id}`
          if (seenTransferKeys.has(key)) continue
          seenTransferKeys.add(key)
          data.push(tx)
          if (data.length >= 20) break
        }
        if (data.length === 0) return noStoreJson({ data: null })
        return noStoreJson({ data })
      }

      case "sidelined": {
        const sidelinedRaw = await apiFetch<any>("/sidelined", { player: playerId })
        // ÖNEMLİ — API-Football'ın "/sidelined" endpoint'i aynı sakatlık/ceza
        // kaydını (aynı tip + başlangıç + bitiş tarihi) bazen birden fazla kez
        // döndürüyor, bu da oyuncu panelindeki "raporlanamayan süre" listesinde
        // aynı satırın iki kez görünmesine yol açıyordu. Tip+başlangıç+bitişe
        // göre dedup yapılıyor.
        const seenSidelinedKeys = new Set<string>()
        const data: SidelinedEntry[] = []
        const mapped: SidelinedEntry[] = (sidelinedRaw ?? []).map((s: any) => ({
          type: s.player?.reason ?? s.type ?? s.reason ?? "Bilinmiyor",
          start: s.start ?? null,
          end: s.end ?? null,
        }))
        for (const entry of mapped.sort((a, b) => (b.start ?? "").localeCompare(a.start ?? ""))) {
          const key = `${entry.type}-${entry.start}-${entry.end}`
          if (seenSidelinedKeys.has(key)) continue
          seenSidelinedKeys.add(key)
          data.push(entry)
        }
        if (data.length === 0) return noStoreJson({ data: null })
        return noStoreJson({ data })
      }
    }
  } catch {
    return noStoreJson({ error: "internalError" }, { status: 500 })
  }
}
