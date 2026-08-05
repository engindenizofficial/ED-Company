import { NextResponse } from "next/server"
import { generateObject } from "ai"
import { createGateway } from "@ai-sdk/gateway"
import { z } from "zod"
import { getFixtureById, getLiveMatchData } from "@/lib/api-football"
import { getCachedPrediction, setCachedPrediction } from "@/lib/redis"
import type { MatchPrediction } from "@/lib/types"

const ai = createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY })

export const dynamic = "force-dynamic"

// Sadece başlamamış / belirsiz maçlar için tahmin yapılır
const PREDICTABLE_STATUSES = new Set(["NS", "TBD", "PST"])

const PredictionSchema = z.object({
  homeScore: z.number().int().min(0).max(20).describe("Ev sahibi takımın tahmin edilen gol sayısı"),
  awayScore: z.number().int().min(0).max(20).describe("Deplasman takımının tahmin edilen gol sayısı"),
  winner: z.enum(["home", "away", "draw"]).describe("Maçı kimin kazanacağı ya da beraberlik"),
  confidence: z.number().min(0).max(100).describe("0-100 arası güven skoru"),
  summary: z.string().describe("Maç hakkında 2-3 cümlelik Türkçe analiz özeti"),
  keyFactors: z.array(z.string()).min(1).max(5).describe("Tahmine en çok etki eden 1-5 faktör (Türkçe)"),
  btts: z.boolean().describe("İki takım da gol atar mı (Both Teams To Score)"),
  overUnder: z.enum(["over", "under"]).describe("Toplam gol 2.5 üstünde mi yoksa altında mı"),
})

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const fixtureId = Number(body?.fixtureId)

  if (!fixtureId || isNaN(fixtureId)) {
    return NextResponse.json({ error: "fixtureId gerekli." }, { status: 400 })
  }

  // 1. Cache kontrolü — gün sonuna kadar geçerli
  const cached = await getCachedPrediction(fixtureId)
  if (cached) {
    return NextResponse.json(cached)
  }

  // 2. Maç verisini çek
  const fixture = await getFixtureById(fixtureId)
  if (!fixture) {
    return NextResponse.json({ error: "Maç bulunamadı." }, { status: 404 })
  }

  // 3. Sadece başlamamış maçlar için tahmin yap
  if (!PREDICTABLE_STATUSES.has(fixture.statusShort)) {
    return NextResponse.json({ error: "Bu maç zaten oynanıyor veya tamamlandı." }, { status: 422 })
  }

  // 4. Analiz verisini çek (puan durumu, form, H2H, sakatlar dahil)
  let live
  try {
    live = await getLiveMatchData(fixture)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Maç verisi alınamadı." },
      { status: 502 },
    )
  }

  // 5. AI modeline gönderilecek bağlamı oluştur
  const homeName = fixture.home.name
  const awayName = fixture.away.name
  const leagueName = fixture.league.name
  const season = fixture.league.season

  const homeStanding = live.standings.find((s) => s.teamId === fixture.home.id)
  const awayStanding = live.standings.find((s) => s.teamId === fixture.away.id)

  const formatStanding = (s: typeof homeStanding, label: string) => {
    if (!s) return `${label}: Puan durumu verisi yok.`
    const avg = s.goalsFor - s.goalsAgainst
    return `${label} (${s.rank}. sıra): ${s.points} puan, ${s.played}M ${s.win}G ${s.draw}B ${s.lose}M, ${s.goalsFor} attı ${s.goalsAgainst} yedi (averaj ${avg > 0 ? "+" : ""}${avg}), form: ${s.form ?? "?"}`
  }

  const formatRecentForm = (stats: typeof live.homeStats, label: string) => {
    if (!stats) return `${label}: Sezon istatistiği yok.`
    const recentStr = stats.recent
      .slice(0, 5)
      .map((g) => `${g.result}(${g.scored}-${g.conceded})`)
      .join(" ")
    return `${label}: ${stats.played} maç, ${stats.wins}G/${stats.draws}B/${stats.losses}M, maç başı ${stats.goalsForAvg.toFixed(1)} gol attı / ${stats.goalsAgainstAvg.toFixed(1)} yedi, son 5: ${recentStr}`
  }

  const formatH2H = (h2h: typeof live.h2h) => {
    if (!h2h.length) return "Kafa kafaya geçmiş maç verisi yok."
    return h2h
      .slice(0, 5)
      .map(
        (g) =>
          `${g.homeTeam ?? homeName} ${g.scored}-${g.conceded} ${g.awayTeam ?? awayName} (${new Date(g.date).toLocaleDateString("tr-TR")})`,
      )
      .join(", ")
  }

  const formatInjuries = (injuries: typeof live.injuries) => {
    if (!injuries.length) return "Sakatlık/ceza verisi yok."
    return injuries.map((i) => `${i.player} (${i.team}) — ${i.reason}`).join("; ")
  }

  const contextPrompt = `
Sen bir futbol analiz uzmanısın. Aşağıdaki verilere dayanarak ${homeName} - ${awayName} maçı için tahmin yap.

LİG: ${leagueName} (${season} sezonu)
TARIH: ${new Date(fixture.date).toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
${fixture.venue ? `SAHA: ${fixture.venue}` : ""}

PUAN DURUMU:
${formatStanding(homeStanding, homeName)}
${formatStanding(awayStanding, awayName)}

SEZON FORMU:
${formatRecentForm(live.homeStats, homeName)}
${formatRecentForm(live.awayStats, awayName)}

KAFA KAFAYA (son 5):
${formatH2H(live.h2h)}

SAKATLIK / CEZA:
${formatInjuries(live.injuries)}

Türkçe olarak tahmin yap. Kesin cevap ver, çok genel ifadelerden kaçın.
`.trim()

  // 6. AI ile yapılandırılmış tahmin üret
  let result
  try {
    const generated = await generateObject({
      model: ai("openai/gpt-4o-mini"),
      schema: PredictionSchema,
      prompt: contextPrompt,
    })
    result = generated.object
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI tahmin hatası." },
      { status: 502 },
    )
  }

  // 7. Sonucu tiplendir ve Redis'e yaz
  const prediction: MatchPrediction = {
    fixtureId,
    homeScore: result.homeScore,
    awayScore: result.awayScore,
    winner: result.winner,
    confidence: result.confidence,
    summary: result.summary,
    keyFactors: result.keyFactors,
    btts: result.btts,
    overUnder: result.overUnder,
    cachedAt: Date.now(),
  }

  await setCachedPrediction(fixtureId, prediction)

  return NextResponse.json(prediction)
}
