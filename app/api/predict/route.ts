import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { generateObject } from "ai"
import { openai } from "@ai-sdk/openai"
import { google } from "@ai-sdk/google"
import { xai } from "@ai-sdk/xai"
import { z } from "zod/v4"
import { getFixtureById, getLiveMatchData } from "@/lib/api-football"
import {
  getCachedPrediction,
  setCachedPrediction,
  deleteAllPredictions,
  deletePredictionCompletely,
  addPendingPrediction,
} from "@/lib/redis"
import { auth } from "@/lib/auth"
import { isAdminEmail } from "@/lib/admin"
import { getAdaptiveWeights, STATIC_WEIGHTS } from "@/lib/model-weights"
import type { MatchPrediction, ModelVote } from "@/lib/types"

export const dynamic = "force-dynamic"

// Sadece başlamamış / belirsiz maçlar için tahmin yapılır
const PREDICTABLE_STATUSES = new Set(["NS", "TBD", "PST"])

// ---------------------------------------------------------------------------
// Ensemble konfigürasyonu — 3 farklı provider, f/p en iyi modeller
// ---------------------------------------------------------------------------
const ENSEMBLE_MODELS = [
  { provider: "openai",  model: openai("gpt-5.6-terra"),         label: "GPT-5.6 Terra"  },
  { provider: "google",  model: google("gemini-3.6-flash"),      label: "Gemini 3.6 Flash" },
  { provider: "xai",     model: xai("grok-4.5"),                 label: "Grok 4.5"       },
] as const

const PredictionSchema = z.object({
  homeScore:  z.number().int().min(0).max(20).describe("Ev sahibi takımın tahmin edilen gol sayısı"),
  awayScore:  z.number().int().min(0).max(20).describe("Deplasman takımının tahmin edilen gol sayısı"),
  winner:     z.enum(["home", "away", "draw"]).describe("Maçı kimin kazanacağı ya da beraberlik"),
  confidence: z.number().min(0).max(100).describe("0-100 arası güven skoru"),
  btts:       z.boolean().describe("İki takım da gol atar mı (Both Teams To Score)"),
  overUnder:  z.enum(["over", "under"]).describe("Toplam gol 2.5 üstünde mi yoksa altında mı"),
  keyFactors: z.array(z.string()).min(1).max(5).describe("Tahmine en çok etki eden 1-5 faktör (Türkçe)"),
})

const SummarySchema = z.object({
  summary: z.string().describe(
    "Maç hakkında 3-4 cümlelik Türkçe analiz özeti. Tüm modellerin görüşlerini sentezle.",
  ),
})

// ---------------------------------------------------------------------------
// Formatlayıcılar
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
    .map((g) => {
      // `scored`/`conceded` her zaman güncel fikstürün ev sahibi takımının (homeName)
      // bakış açısından raporlanır — o geçmiş maçta hangi tarafın evinde oynadığından
      // bağımsız. `g.home` o geçmiş maçta homeName'in evinde oynayıp oynamadığını
      // belirtir, dolayısıyla skorları gerçek ev sahibi/deplasman etiketine göre
      // doğru sıraya koymak için bunu kontrol etmemiz gerekir.
      const homeGoals = g.home ? g.scored : g.conceded
      const awayGoals = g.home ? g.conceded : g.scored
      return `${g.homeTeam ?? homeName} ${homeGoals}-${awayGoals} ${g.awayTeam ?? awayName} (${new Date(g.date).toLocaleDateString("tr-TR")})`
    })
    .join(", ")
}

function formatInjuries(injuries: LiveData["injuries"]): string {
  if (!injuries.length) return "Sakatlık/ceza verisi yok."
  return injuries.map((i) => `${i.player} (${i.team}) — ${i.reason}`).join("; ")
}

const POS_LABEL: Record<string, string> = {
  Goalkeeper: "Kaleci",
  Defender: "Defans",
  Midfielder: "Orta Saha",
  Attacker: "Forvet",
}

function formatSquad(squad: LiveData["homeSquad"], teamName: string): string {
  if (!squad.length) return ""
  const grouped: Record<string, string[]> = {}
  for (const p of squad) {
    const label = POS_LABEL[p.pos ?? ""] ?? "Diğer"
    if (!grouped[label]) grouped[label] = []
    grouped[label].push(p.name)
  }
  const order = ["Kaleci", "Defans", "Orta Saha", "Forvet", "Diğer"]
  const lines = order
    .filter((k) => grouped[k]?.length)
    .map((k) => `  ${k}: ${grouped[k].join(", ")}`)
  return `${teamName}:\n${lines.join("\n")}`
}

function formatLineups(lineups: LiveData["lineups"]): string {
  if (!lineups.length) return null as unknown as string
  return lineups
    .map((l) => {
      const xi = l.startXI.map((p) => p.name).join(", ")
      const subs = l.substitutes.map((p) => p.name).join(", ")
      const parts: string[] = [`${l.team}`]
      if (l.formation) parts.push(`Diziliş: ${l.formation}`)
      if (l.coach) parts.push(`Teknik Direktör: ${l.coach}`)
      if (xi) parts.push(`İlk 11: ${xi}`)
      if (subs) parts.push(`Yedekler: ${subs}`)
      return parts.join(" | ")
    })
    .join("\n")
}

function formatOdds(odds: LiveData["odds"], homeName: string, awayName: string): string {
  const { home, draw, away } = odds
  if (!home && !draw && !away) return "Bahis oranı verisi yok."

  const parts: string[] = []
  if (home !== null) parts.push(`${homeName} kazanır: ${home.toFixed(2)}`)
  if (draw !== null) parts.push(`Beraberlik: ${draw.toFixed(2)}`)
  if (away !== null) parts.push(`${awayName} kazanır: ${away.toFixed(2)}`)

  // Favorisini de belirt — oranı en düşük olan favori
  const entries = [
    { label: homeName, odd: home },
    { label: "Beraberlik", odd: draw },
    { label: awayName, odd: away },
  ].filter((e): e is { label: string; odd: number } => e.odd !== null)

  if (entries.length > 0) {
    const favorite = entries.reduce((a, b) => (a.odd < b.odd ? a : b))
    parts.push(`(Piyasa favorisi: ${favorite.label} @ ${favorite.odd.toFixed(2)})`)
  }

  return parts.join(" | ")
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

  const winnerTally: Record<string, number> = { home: 0, away: 0, draw: 0 }
  for (const { vote, weight } of votes) winnerTally[vote.winner] += weight
  const winner = (Object.entries(winnerTally).sort((a, b) => b[1] - a[1])[0][0]) as "home" | "away" | "draw"

  const homeScore = Math.round(votes.reduce((s, v) => s + v.vote.homeScore * v.weight, 0) / totalWeight)
  const awayScore = Math.round(votes.reduce((s, v) => s + v.vote.awayScore * v.weight, 0) / totalWeight)
  const confidence = Math.round(votes.reduce((s, v) => s + v.vote.confidence * v.weight, 0) / totalWeight)

  const bttsScore = votes.reduce((s, v) => s + (v.vote.btts ? v.weight : 0), 0)
  const btts = bttsScore >= totalWeight / 2

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

  // 1. Cache kontrolü — daha önce yapılmış tahmin varsa direkt döndür
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

  // ---------------------------------------------------------------------------
  // Ortak veri bloğu — her prompt'ta tekrar eden bağlam
  // ---------------------------------------------------------------------------
  const sharedContext = `
MAÇ: ${homeName} - ${awayName}
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

BAHİS ORANLARI (piyasa beklentisi — düşük oran = güçlü favori):
${formatOdds(live.odds, homeName, awayName)}
${(() => {
  const lineup = formatLineups(live.lineups)
  if (lineup) return `\nRESMİ 11 (açıklandı):\n${lineup}`
  // Resmi 11 yoksa geniş kadroyu göster
  const homeSquadStr = formatSquad(live.homeSquad, homeName)
  const awaySquadStr = formatSquad(live.awaySquad, awayName)
  if (homeSquadStr || awaySquadStr) {
    return `\nKAYITLI KADRO (resmi 11 henüz açıklanmadı):\n${[homeSquadStr, awaySquadStr].filter(Boolean).join("\n")}`
  }
  return ""
})()}
`.trim()

  // ---------------------------------------------------------------------------
  // GPT-5.6 Terra — Taktik & Form Analisti
  // Son form, puan durumu, ev/deplasman momentum odaklı
  // ---------------------------------------------------------------------------
  const promptGPT = `
Sen deneyimli bir futbol taktik analistsin. Görevin ${homeName} - ${awayName} maçında
her iki takımın güncel form, puan durumu ve ev/deplasman performansını değerlendirerek
"şu an hangi takım daha iyi durumda?" sorusuna yanıt vermek ve maç sonucunu tahmin etmektir.

Odaklan:
- Son 5 maç formu ve momentum (üst üste galibiyet/mağlubiyet serileri)
- Ev sahibi avantajı / deplasman zafiyeti
- Puan sıralaması ve hedefler (şampiyonluk yarışı mı, düşme hattı mı?)
- Bahis oranlarıyla form verilerini karşılaştır; tutarsızlık varsa belirt

${sharedContext}

Türkçe olarak kesin ve net tahmin yap.
`.trim()

  // ---------------------------------------------------------------------------
  // Gemini 3.6 Flash — İstatistik & Gol Beklentisi Uzmanı
  // Gol ortalamaları, BTTS, over/under, H2H sayısal analiz odaklı
  // ---------------------------------------------------------------------------
  const promptGemini = `
Sen istatistik odaklı bir futbol analistsin. Görevin ${homeName} - ${awayName} maçında
sayısal verileri kullanarak gol beklentisini ve maç skorunu tahmin etmektir.

Odaklan:
- Maç başı atılan/yenilen gol ortalamaları ve BTTS oranları
- Kafa kafaya geçmiş skorlar (toplam gol eğilimi)
- Her iki takımın defans/hücum dengesi
- Bahis oranlarını istatistiksel bir kılavuz olarak kullan; 2.5 üst/alt için özellikle önemli
- Over/under ve BTTS kararlarını somut istatistiklerle gerekçelendir

${sharedContext}

Türkçe olarak kesin ve net tahmin yap.
`.trim()

  // ---------------------------------------------------------------------------
  // Grok 4.5 — Bağlam & Motivasyon Analisti
  // Sakatlıklar, maçın önemi, sürpriz faktörü odaklı
  // ---------------------------------------------------------------------------
  const promptGrok = `
Sen futbolda bağlamsal faktörlere odaklanan bir analistsin. Görevin ${homeName} - ${awayName} maçında
sahada görünmeyen ama sonucu etkileyebilecek faktörleri değerlendirerek sürpriz potansiyelini tespit etmektir.

Odaklan:
- Kritik sakatlıklar ve cezalar (yıldız oyuncular yok mu?)
- Maçın iki takım için önemi (biri şampiyonluğa mı koşuyor, diğeri elenmiş mi?)
- Deplasman takımının seyahat/fikstür yoğunluğu
- Bahis oranları ile form verileri arasındaki tutarsızlıklar (sürpriz işareti olabilir)
- Psikolojik avantaj/dezavantaj (büyük galibiyet sonrası özgüven, üst üste mağlubiyet baskısı)

${sharedContext}

Türkçe olarak kesin ve net tahmin yap. Eğer sürpriz olasılığı yüksekse güven skorunu düşür ve bunu keyFactors'ta belirt.
`.trim()

  // Her modele ait prompt'u map'le
  const modelPrompts: Record<string, string> = {
    openai: promptGPT,
    google: promptGemini,
    xai:    promptGrok,
  }

  // Özet çağrısında kullanmak için ortak bağlamı sakla
  const contextPrompt = sharedContext

  // 5. Ağırlıkları geçmiş isabet oranına göre hesapla (statik WEIGHTS yerine).
  // Yeterli çözümlenmiş tahmin yoksa statik varsayılana yakın kalır (cold start).
  const adaptiveWeights = await getAdaptiveWeights()

  // 6. 3 modeli paralel çalıştır — her biri kendi rolüne ait prompt'u alır
  const modelResults = await Promise.allSettled(
    ENSEMBLE_MODELS.map(async ({ provider, model, label }) => {
      const { object } = await generateObject({
        model,
        schema: PredictionSchema,
        prompt: modelPrompts[provider] ?? contextPrompt,
      })
      const weight = adaptiveWeights[provider]?.weight ?? STATIC_WEIGHTS[provider] ?? 1.0
      return { provider, label, weight, object }
    }),
  )

  type ModelResult = { provider: string; label: string; weight: number; object: z.infer<typeof PredictionSchema> }
  const successfulVotes = (modelResults as PromiseSettledResult<ModelResult>[])
    .filter((r): r is PromiseFulfilledResult<ModelResult> => r.status === "fulfilled")
    .map((r) => ({ ...r.value, vote: r.value.object }))

  if (successfulVotes.length === 0) {
    return NextResponse.json({ error: "Tüm AI modelleri başarısız oldu." }, { status: 502 })
  }

  // 7. Ağırlıklı oylama
  const ensemble = weightedVote(successfulVotes.map((v) => ({ vote: v.vote, weight: v.weight })))

  // 8. Anahtar faktörler — tüm modellerden birleştir
  const allFactors = successfulVotes.flatMap((v) => v.vote.keyFactors)
  const uniqueFactors = [...new Set(allFactors)].slice(0, 5)

    // 9. GPT-5.6 Terra ile özet oluştur
  let summary = "Modeller tahminlerini tamamladı."
  try {
    const voteSummary = successfulVotes.map((v) => (
      `${v.label}: ${v.vote.winner === "home" ? homeName : v.vote.winner === "away" ? awayName : "beraberlik"} (${v.vote.homeScore}-${v.vote.awayScore}), güven: %${v.vote.confidence}`
    )).join("\n")

    const { object: summaryObj } = await generateObject({
      model: openai("gpt-5.6-terra"),
      schema: SummarySchema,
      prompt: `${contextPrompt}\n\nAI model tahminleri:\n${voteSummary}\n\nBu tahminleri ve maç verisini sentezleyerek 3-4 cümlelik Türkçe bir analiz özeti yaz.`,
    })
    summary = summaryObj.summary
  } catch {
    // Özet oluşturulamazsa devam et
  }

  // 10. ModelVote dizisi — model alanı "provider/model-id" formatında olmalı (UI etiket eşleşmesi için)
  const PROVIDER_MODEL_ID: Record<string, string> = {
    openai: "openai/gpt-5.6-terra",
    google: "google/gemini-3.6-flash",
    xai:    "xai/grok-4.5",
  }
  const modelVotes: ModelVote[] = successfulVotes.map((v) => ({
    model:      PROVIDER_MODEL_ID[v.provider] ?? `${v.provider}/${v.label}`,
    winner:     v.vote.winner,
    homeScore:  v.vote.homeScore,
    awayScore:  v.vote.awayScore,
    confidence: v.vote.confidence,
    btts:       v.vote.btts,
    overUnder:  v.vote.overUnder,
    keyFactors: v.vote.keyFactors,
  }))

  // 11. Nihai tahmin — cache'e yaz
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
    homeName,
    awayName,
    // AI modellerine prompt'ta gönderilen bahis oranları — panelde de gösterilir
    odds:        live.odds,
  }

  await setCachedPrediction(fixtureId, prediction)

  // Bekleyen tahminler listesine ekle — yenile butonunda gerçek skorla karşılaştırılacak
  const fixtureDate = fixture.date.slice(0, 10) // YYYY-MM-DD
  await addPendingPrediction({ fixtureId, date: fixtureDate, homeName, awayName })

  return NextResponse.json(prediction)
}

// ---------------------------------------------------------------------------
// DELETE /api/predict           — tüm tahmin cache'ini temizler (admin)
// DELETE /api/predict?fixtureId=... — sadece o maçın tahminini, her yerden
// (cache, bekleyen liste, günlük ve tüm zamanlar başarı paneli) siler.
// Sadece admin e-postasıyla giriş yapmış kullanıcı çağırabilir.
// ---------------------------------------------------------------------------
export async function DELETE(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const fixtureIdParam = searchParams.get("fixtureId")

  if (fixtureIdParam) {
    const fixtureId = Number(fixtureIdParam)
    if (!fixtureId || isNaN(fixtureId)) {
      return NextResponse.json({ error: "Geçersiz fixtureId." }, { status: 400 })
    }
    const ok = await deletePredictionCompletely(fixtureId)
    return NextResponse.json({ ok })
  }

  const deleted = await deleteAllPredictions()
  return NextResponse.json({ ok: true, deleted })
}
