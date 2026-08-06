import { NextResponse } from "next/server"
import { generateObject, gateway } from "ai"
import { z } from "zod/v4"
import { getFixtureById, getLiveMatchData } from "@/lib/api-football"
import { getCachedPrediction, setCachedPrediction } from "@/lib/redis"
import type { MatchPrediction, ModelVote } from "@/lib/types"

export const dynamic = "force-dynamic"

// Sadece başlamamış / belirsiz maçlar için tahmin yapılır
const PREDICTABLE_STATUSES = new Set(["NS", "TBD", "PST"])

// ---------------------------------------------------------------------------
// Ensemble konfigürasyonu
// Her modelin ağırlığı oylama hesaplamasında kullanılır
// ---------------------------------------------------------------------------
const ENSEMBLE_MODELS = [
  { id: "openai/gpt-5",                     weight: 3.0 },
  { id: "openai/gpt-5-pro",                 weight: 2.5 },
  { id: "anthropic/claude-opus-5",          weight: 2.5 },
  { id: "anthropic/claude-sonnet-5",        weight: 2.0 },
  { id: "google/gemini-2.5-pro",            weight: 2.0 },
  { id: "deepseek/deepseek-v3.2-thinking",  weight: 1.5 },
  { id: "openai/gpt-4o",                    weight: 1.5 },
  { id: "anthropic/claude-opus-4.8",        weight: 1.5 },
  { id: "google/gemini-2.5-flash",          weight: 1.0 },
  { id: "deepseek/deepseek-v3.2",           weight: 1.0 },
] as const

const PredictionSchema = z.object({
  homeScore:   z.number().int().min(0).max(20).describe("Ev sahibi takımın tahmin edilen gol sayısı"),
  awayScore:   z.number().int().min(0).max(20).describe("Deplasman takımının tahmin edilen gol sayısı"),
  winner:      z.enum(["home", "away", "draw"]).describe("Maçı kimin kazanacağı ya da beraberlik"),
  confidence:  z.number().min(0).max(100).describe("0-100 arası güven skoru"),
  btts:        z.boolean().describe("İki takım da gol atar mı (Both Teams To Score)"),
  overUnder:   z.enum(["over", "under"]).describe("Toplam gol 2.5 üstünde mi yoksa altında mı"),
  keyFactors:  z.array(z.string()).min(1).max(5).describe("Tahmine en çok etki eden 1-5 faktör (Türkçe)"),
})

const SummarySchema = z.object({
  summary: z.string().describe(
    "Maç hakkında 3-4 cümlelik Türkçe analiz özeti. Tüm modellerin görüşlerini sentezle.",
  ),
})

// ---------------------------------------------------------------------------
// Yardımcı formatlayıcılar
// ---------------------------------------------------------------------------
type LiveData = Awaited<ReturnType<typeof getLiveMatchData>>
type Standing = LiveData["standings"][number]
type Stats    = LiveData["homeStats"]

function formatStanding(s: Standing | undefined, label: string): string {
  if (!s) return `${label}: Puan durumu verisi yok.`
  const avg = s.goalsFor - s.goalsAgainst
  return `${label} (${s.rank}. sıra): ${s.points} puan, ${s.played}M ${s.win}G ${s.draw}B ${s.lose}M, ${s.goalsFor} attı ${s.goalsAgainst} yedi (averaj ${avg > 0 ? "+" : ""}${avg}), form: ${s.form ?? "?"}`
}

function formatRecentForm(stats: Stats, label: string): string {
  if (!stats) return `${label}: Sezon istatistiği yok.`
  const recentStr = stats.recent
    .slice(0, 5)
    .map((g) => `${g.result}(${g.scored}-${g.conceded})`)
    .join(" ")
  return `${label}: ${stats.played} maç, ${stats.wins}G/${stats.draws}B/${stats.losses}M, maç başı ${stats.goalsForAvg.toFixed(1)} gol attı / ${stats.goalsAgainstAvg.toFixed(1)} yedi, son 5: ${recentStr}`
}

function formatH2H(h2h: LiveData["h2h"], homeName: string, awayName: string): string {
  if (!h2h.length) return "Kafa kafaya geçmiş maç verisi yok."
  return h2h
    .slice(0, 5)
    .map(
      (g) =>
        `${g.homeTeam ?? homeName} ${g.scored}-${g.conceded} ${g.awayTeam ?? awayName} (${new Date(g.date).toLocaleDateString("tr-TR")})`,
    )
    .join(", ")
}

function formatInjuries(injuries: LiveData["injuries"]): string {
  if (!injuries.length) return "Sakatlık/ceza verisi yok."
  return injuries.map((i) => `${i.player} (${i.team}) — ${i.reason}`).join("; ")
}

// ---------------------------------------------------------------------------
// Ağırlıklı ensemble oylama
// ---------------------------------------------------------------------------
function weightedVote(
  votes: Array<{ vote: z.infer<typeof PredictionSchema>; weight: number }>,
): {
  winner: "home" | "away" | "draw"
  homeScore: number
  awayScore: number
  confidence: number
  btts: boolean
  overUnder: "over" | "under"
} {
  const totalWeight = votes.reduce((s, v) => s + v.weight, 0)

  // Kazanan: ağırlıklı oy sayısı en yüksek
  const winnerTally: Record<string, number> = { home: 0, away: 0, draw: 0 }
  for (const { vote, weight } of votes) winnerTally[vote.winner] += weight
  const winner = (Object.entries(winnerTally).sort((a, b) => b[1] - a[1])[0][0]) as "home" | "away" | "draw"

  // Skor: ağırlıklı ortalama, tam sayıya yuvarla
  const homeScore = Math.round(votes.reduce((s, v) => s + v.vote.homeScore * v.weight, 0) / totalWeight)
  const awayScore = Math.round(votes.reduce((s, v) => s + v.vote.awayScore * v.weight, 0) / totalWeight)

  // Güven: ağırlıklı ortalama
  const confidence = Math.round(votes.reduce((s, v) => s + v.vote.confidence * v.weight, 0) / totalWeight)

  // BTTS: ağırlıklı çoğunluk
  const bttsScore = votes.reduce((s, v) => s + (v.vote.btts ? v.weight : 0), 0)
  const btts = bttsScore >= totalWeight / 2

  // Over/Under: ağırlıklı çoğunluk
  const overScore = votes.reduce((s, v) => s + (v.vote.overUnder === "over" ? v.weight : 0), 0)
  const overUnder: "over" | "under" = overScore >= totalWeight / 2 ? "over" : "under"

  return { winner, homeScore, awayScore, confidence, btts, overUnder }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const fixtureId = Number(body?.fixtureId)

  if (!fixtureId || isNaN(fixtureId)) {
    return NextResponse.json({ error: "fixtureId gerekli." }, { status: 400 })
  }

  // 1. Cache kontrolü
  const cached = await getCachedPrediction(fixtureId)
  if (cached) return NextResponse.json(cached)

  // 2. Maç verisini çek
  const fixture = await getFixtureById(fixtureId)
  if (!fixture) {
    return NextResponse.json({ error: "Maç bulunamadı." }, { status: 404 })
  }

  // 3. Sadece başlamamış maçlar
  if (!PREDICTABLE_STATUSES.has(fixture.statusShort)) {
    return NextResponse.json({ error: "Bu maç zaten oynanıyor veya tamamlandı." }, { status: 422 })
  }

  // 4. Canlı analiz verisini çek
  let live: LiveData
  try {
    live = await getLiveMatchData(fixture)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Maç verisi alınamadı." },
      { status: 502 },
    )
  }

  const homeName = fixture.home.name
  const awayName = fixture.away.name
  const homeStanding = live.standings.find((s) => s.teamId === fixture.home.id)
  const awayStanding = live.standings.find((s) => s.teamId === fixture.away.id)

  const contextPrompt = `
Sen bir futbol analiz uzmanısın. Aşağıdaki verilere dayanarak ${homeName} - ${awayName} maçı için tahmin yap.

LİG: ${fixture.league.name} (${fixture.league.season} sezonu)
TARİH: ${new Date(fixture.date).toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
${fixture.venue ? `SAHA: ${fixture.venue}` : ""}

PUAN DURUMU:
${formatStanding(homeStanding, homeName)}
${formatStanding(awayStanding, awayName)}

SEZON FORMU:
${formatRecentForm(live.homeStats, homeName)}
${formatRecentForm(live.awayStats, awayName)}

KAFA KAFAYA (son 5):
${formatH2H(live.h2h, homeName, awayName)}

SAKATLIK / CEZA:
${formatInjuries(live.injuries)}

Türkçe olarak tahmin yap. Kesin ve net cevap ver, genel ifadelerden kaçın.
`.trim()

  // 5. Tüm modelleri paralel çalıştır
  const modelResults = await Promise.allSettled(
    ENSEMBLE_MODELS.map(async ({ id, weight }) => {
      const { object } = await generateObject({
        model: gateway(id),
        schema: PredictionSchema,
        prompt: contextPrompt,
      })
      return { id, weight, object }
    }),
  )

  // Başarılı sonuçları filtrele
  type ModelResult = { id: string; weight: number; object: z.infer<typeof PredictionSchema> }
  const successfulVotes = (modelResults as PromiseSettledResult<ModelResult>[])
    .filter((r): r is PromiseFulfilledResult<ModelResult> => r.status === "fulfilled")
    .map((r) => ({ vote: r.value.object, weight: r.value.weight, modelId: r.value.id }))

  if (successfulVotes.length === 0) {
    return NextResponse.json({ error: "Tüm AI modelleri başarısız oldu." }, { status: 502 })
  }

  // 6. Ağırlıklı oylama ile ensemble sonucu hesapla
  const ensemble = weightedVote(successfulVotes.map((v) => ({ vote: v.vote, weight: v.weight })))

  // 7. Anahtar faktörleri tüm modellerden birleştir (tekrar düşür)
  const allFactors = successfulVotes.flatMap((v) => v.vote.keyFactors)
  const uniqueFactors = [...new Set(allFactors)].slice(0, 5)

  // 8. GPT-4o'nun bakış açısını özetleme için kullan (başarılı ise)
  let summary = "Modeller tahminlerini tamamladı."
  try {
    const summaryModelId = successfulVotes.find((v) => v.modelId === "openai/gpt-4o")?.modelId
      ?? successfulVotes[0].modelId

    const voteSummary = successfulVotes.map((v) => (
      `${v.modelId}: ${v.vote.winner === "home" ? homeName : v.vote.winner === "away" ? awayName : "beraberlik"} (${v.vote.homeScore}-${v.vote.awayScore}), güven: %${v.vote.confidence}`
    )).join("\n")

    const { object: summaryObj } = await generateObject({
      model: gateway(summaryModelId),
      schema: SummarySchema,
      prompt: `${contextPrompt}\n\nAI model tahminleri:\n${voteSummary}\n\nBu tahminleri ve maç verisini sentezleyerek 3-4 cümlelik Türkçe bir analiz özeti yaz.`,
    })
    summary = summaryObj.summary
  } catch {
    // Özet oluşturulamazsa default değerle devam et
  }

  // 9. ModelVote dizisini oluştur
  const modelVotes: ModelVote[] = successfulVotes.map((v) => ({
    model:      v.modelId,
    winner:     v.vote.winner,
    homeScore:  v.vote.homeScore,
    awayScore:  v.vote.awayScore,
    confidence: v.vote.confidence,
    btts:       v.vote.btts,
    overUnder:  v.vote.overUnder,
    keyFactors: v.vote.keyFactors,
  }))

  // 10. Nihai tahmini oluştur ve cache'e yaz
  const prediction: MatchPrediction = {
    fixtureId,
    homeScore:   ensemble.homeScore,
    awayScore:   ensemble.awayScore,
    winner:      ensemble.winner,
    confidence:  ensemble.confidence,
    summary,
    keyFactors:  uniqueFactors,
    btts:        ensemble.btts,
    overUnder:   ensemble.overUnder,
    modelVotes,
    cachedAt:    Date.now(),
  }

  await setCachedPrediction(fixtureId, prediction)

  return NextResponse.json(prediction)
}
