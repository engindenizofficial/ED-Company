import { NextResponse, after } from "next/server"
import { headers } from "next/headers"
import { generateObject } from "ai"
import { openai } from "@ai-sdk/openai"
import { google } from "@ai-sdk/google"
import { xai } from "@ai-sdk/xai"
import { z } from "zod/v4"
import type { Fixture } from "@/lib/types"
import { getFixtureById, getLiveMatchData } from "@/lib/api-football"
import {
  getCachedPrediction,
  setCachedPrediction,
  deleteAllPredictions,
  deletePredictionCompletely,
  addPendingPrediction,
  markPredictionInProgress,
  clearPredictionInProgress,
} from "@/lib/redis"
import { auth } from "@/lib/auth"
import { isAdminEmail } from "@/lib/admin"
import { getAdaptiveWeights, getAdaptiveScoreWeights, STATIC_WEIGHTS } from "@/lib/model-weights"
import { getConfidenceCalibrationCurve, calibrateConfidence } from "@/lib/confidence-calibration"
import {
  computeExpectedGoals,
  predictFromExpectedGoals,
  blendWithH2H,
  calibrateExpectedGoalsToOdds,
  recentFormRate,
  applyInjuryImpact,
} from "@/lib/poisson"
import {
  resolveLegInfo,
  reorientFirstLeg,
  resolveKnockoutTie,
} from "@/lib/knockout"
import type { MatchPrediction, ModelVote } from "@/lib/types"

export const dynamic = "force-dynamic"
// `after()` ile tetiklenen arka plan işi (canlı veri + ~11 LLM çağrısı, 1-3 dk)
// da bu invocation'ın toplam süre bütçesine dahildir — bu satır olmadan
// platform varsayılan süresi dolduğunda iş yarıda kesilir, tahmin Redis'e
// hiç yazılmaz ve istemci 5 dakikalık polling limitine çarpıp sessizce
// vazgeçer. Diğer after()/arka plan route'larıyla (update-player-power,
// update-market-values, backfill-*) aynı desen.
export const maxDuration = 300

// Sadece başlamamış / belirsiz maçlar için tahmin yapılır
const PREDICTABLE_STATUSES = new Set(["NS", "TBD", "PST"])

// ---------------------------------------------------------------------------
// Ensemble konfigürasyonu — 3 farklı provider, f/p en iyi modeller
// ---------------------------------------------------------------------------
const ENSEMBLE_MODELS = [
  { provider: "openai",  model: openai("gpt-5.6-terra"),         label: "GPT-5.6 Terra"  },
  { provider: "google",  model: google("gemini-3.7-flash"),      label: "Gemini 3.7 Flash" },
  { provider: "xai",     model: xai("grok-4.6"),                 label: "Grok 4.6"       },
] as const

// Self-consistency: her model için tek atım yerine N örnekleme alıp kendi
// içinde çoğunluk oylaması yapıyoruz. Bu, tek bir generateObject çağrısının
// şans faktöründen kaynaklanan gürültüyü azaltır. Maliyet N katına çıkar
// (3 model x 3 örnek = 9 çağrı/maç).
const SELF_CONSISTENCY_SAMPLES = 3

const PredictionSchema = z.object({
  homeScore:  z.number().int().min(0).max(20).describe("Ev sahibi takımın tahmin edilen gol sayısı (90 dakika, normal süre)"),
  awayScore:  z.number().int().min(0).max(20).describe("Deplasman takımının tahmin edilen gol sayısı (90 dakika, normal süre)"),
  winner:     z.enum(["home", "away", "draw"]).describe("Maçı kimin kazanacağı ya da beraberlik (90 dakika, normal süre)"),
  confidence: z.number().min(0).max(100).describe("0-100 arası güven skoru"),
  btts:       z.boolean().describe("İki takım da gol atar mı (Both Teams To Score)"),
  overUnder:  z.enum(["over", "under"]).describe("Toplam gol 2.5 üstünde mi yoksa altında mı"),
  keyFactors: z.array(z.string()).min(1).max(5).describe("Tahmine en çok etki eden 1-5 faktör (Türkçe)"),
  // --- Eleme turu için uzatma/penaltı tahmini ---------------------------------
  // Bu alanlar SADECE prompt'ta "bu maç (veya toplam skor) 90 dakika sonunda
  // berabere kalırsa" bağlamı verildiğinde anlamlıdır. Bu maç eleme turu
  // değilse veya berabere kalma ihtimali düşükse hepsini 0/false bırak.
  extraTimeHomeGoals: z.number().int().min(0).max(3).describe(
    "SADECE bu maç/toplam skor 90 dakika sonunda berabere kalırsa: 30 dakikalık uzatmada ev sahibinin atacağı gol tahmini. Eleme turu değilse veya berabere ihtimali yoksa 0.",
  ),
  extraTimeAwayGoals: z.number().int().min(0).max(3).describe(
    "SADECE bu maç/toplam skor 90 dakika sonunda berabere kalırsa: 30 dakikalık uzatmada deplasmanın atacağı gol tahmini. Eleme turu değilse veya berabere ihtimali yoksa 0.",
  ),
  wentToPenalties: z.boolean().describe(
    "SADECE eleme turu ise: uzatmalar sonunda da berabere kalırsa penaltılara gidileceğini düşünüyorsan true. Eleme turu değilse veya berabere ihtimali yoksa false.",
  ),
  penaltyWinner: z.enum(["home", "away", "none"]).describe(
    "SADECE penaltılara gidilirse: penaltı atışlarını kimin kazanıp turu geçeceği. Penaltı ihtimali yoksa 'none'.",
  ),
  penaltyHomeGoals: z.number().int().min(0).max(10).describe(
    "SADECE penaltılara gidilirse: ev sahibinin penaltı atışlarındaki gol sayısı (örn. 5). Gerçek penaltılarda beraberlik OLMAZ, kazanan taraf her zaman en az 1 fazla gol atar. Penaltı ihtimali yoksa 0.",
  ),
  penaltyAwayGoals: z.number().int().min(0).max(10).describe(
    "SADECE penaltılara gidilirse: deplasman takımının penaltı atışlarındaki gol sayısı (örn. 4). Gerçek penaltılarda beraberlik OLMAZ. Penaltı ihtimali yoksa 0.",
  ),
})

const SummarySchema = z.object({
  summary: z.string().describe(
    "Maç hakkında 3-4 cümlelik Türkçe analiz özeti. Tüm modellerin görüşlerini sentezle.",
  ),
})

// İngilizce kullanıcılar için: nihai Türkçe özet + anahtar faktörler tek bir
// ek çağrıyla İngilizce'ye çevrilir. Ensemble'ın tamamı (3 model x N örnek)
// tekrar çalıştırılmaz — sadece bu tek, ucuz çeviri çağrısı eklenir ve sonuç
// diğer alanlarla birlikte cache'lenir (fikstür başına tek seferlik maliyet).
const TranslationSchema = z.object({
  summary: z.string().describe("The Turkish summary translated into natural, fluent English."),
  keyFactors: z.array(z.string()).describe("The Turkish key factors translated into natural, fluent English, same order and count as the input."),
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

/**
 * `venue` verilirse ("home" | "away"), o sahaya özel ayrı bir satır ekler.
 * Genel ortalama ev sahibi avantajını sulandırabilir — ev sahibi takım için
 * evindeki performansı, deplasman takımı için deplasmandaki performansı
 * ayrıca göstermek modele daha isabetli bir sinyal verir.
 */
function formatRecentForm(stats: Stats, label: string, venue?: "home" | "away"): string {
  if (!stats) return `${label}: Sezon istatistiği yok.`
  const recentStr = stats.recent
    .slice(0, 5)
    .map((g) => `${g.result}(${g.scored}-${g.conceded})`)
    .join(" ")
  const base = `${label}: ${stats.played} maç, ${stats.wins}G/${stats.draws}B/${stats.losses}M, maç başı ${stats.goalsForAvg.toFixed(1)} gol attı / ${stats.goalsAgainstAvg.toFixed(1)} yedi, son 5: ${recentStr}`

  const split = venue === "home" ? stats.home : venue === "away" ? stats.away : null
  if (!split) return base

  const venueLabel = venue === "home" ? "evinde" : "deplasmanda"
  const splitStr = `${label} ${venueLabel}: ${split.played} maç, ${split.wins}G/${split.draws}B/${split.losses}M, maç başı ${split.goalsForAvg.toFixed(1)} gol attı / ${split.goalsAgainstAvg.toFixed(1)} yedi`
  return `${base}\n${splitStr}`
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
  votes: Array<{ vote: z.infer<typeof PredictionSchema>; weight: number; scoreWeight?: number }>,
): {
  winner: "home" | "away" | "draw"
  homeScore: number
  awayScore: number
  confidence: number
  btts: boolean
  overUnder: "over" | "under"
  extraTimeHomeGoals: number
  extraTimeAwayGoals: number
  wentToPenalties: boolean
  penaltyWinner: "home" | "away" | "none"
  penaltyHomeGoals: number
  penaltyAwayGoals: number
} {
  const totalWeight = votes.reduce((s, v) => s + v.weight, 0)

  const winnerTally: Record<string, number> = { home: 0, away: 0, draw: 0 }
  for (const { vote, weight } of votes) winnerTally[vote.winner] += weight
  const winner = (Object.entries(winnerTally).sort((a, b) => b[1] - a[1])[0][0]) as "home" | "away" | "draw"

  // Skor için ayrı ağırlık kullan (scoreWeight verilmemişse weight'e düşer) —
  // bir modelin kazananı bilmesi skorunu isabetli tahmin ettiği anlamına
  // gelmez, bu yüzden skor geçmişine göre ayrı bir ölçüt kullanıyoruz.
  //
  // Skor için AĞIRLIKLI ÇOĞUNLUK OYU (plurality) kullanılır, basit ortalama
  // DEĞİL: (2,1) ve (0,3) skorlarının ortalaması (1,2) olur — bu, hiçbir
  // modelin seçmediği ve muhtemelen ikisinden de daha isabetsiz bir skordur.
  // En yüksek ağırlığı toplayan TAM skor eşleşmesi seçilir; ağırlıklı
  // ortalama+yuvarlama sadece hiçbir skor net bir öne çıkış (plurality)
  // sağlamadığında (yani her oy farklıysa) yedek olarak kullanılır.
  const totalScoreWeight = votes.reduce((s, v) => s + (v.scoreWeight ?? v.weight), 0)
  const scoreTally = new Map<string, { weight: number; homeScore: number; awayScore: number }>()
  for (const v of votes) {
    const w = v.scoreWeight ?? v.weight
    const key = `${v.vote.homeScore}-${v.vote.awayScore}`
    const entry = scoreTally.get(key)
    if (entry) entry.weight += w
    else scoreTally.set(key, { weight: w, homeScore: v.vote.homeScore, awayScore: v.vote.awayScore })
  }
  const rankedScores = [...scoreTally.values()].sort((a, b) => b.weight - a.weight)
  const topScore = rankedScores[0]
  const hasPlurality = rankedScores.length > 0 && (rankedScores.length === 1 || topScore.weight > rankedScores[1].weight)

  let homeScore: number
  let awayScore: number
  if (hasPlurality) {
    homeScore = topScore.homeScore
    awayScore = topScore.awayScore
  } else {
    homeScore = Math.round(
      votes.reduce((s, v) => s + v.vote.homeScore * (v.scoreWeight ?? v.weight), 0) / totalScoreWeight,
    )
    awayScore = Math.round(
      votes.reduce((s, v) => s + v.vote.awayScore * (v.scoreWeight ?? v.weight), 0) / totalScoreWeight,
    )
  }
  const confidence = Math.round(votes.reduce((s, v) => s + v.vote.confidence * v.weight, 0) / totalWeight)

  const bttsScore = votes.reduce((s, v) => s + (v.vote.btts ? v.weight : 0), 0)
  const btts = bttsScore >= totalWeight / 2

  const overScore = votes.reduce((s, v) => s + (v.vote.overUnder === "over" ? v.weight : 0), 0)
  const overUnder: "over" | "under" = overScore >= totalWeight / 2 ? "over" : "under"

  // --- Uzatma golleri — ağırlıklı ortalama, en yakın tam sayıya yuvarlanır ---
  const extraTimeHomeGoals = Math.round(
    votes.reduce((s, v) => s + v.vote.extraTimeHomeGoals * v.weight, 0) / totalWeight,
  )
  const extraTimeAwayGoals = Math.round(
    votes.reduce((s, v) => s + v.vote.extraTimeAwayGoals * v.weight, 0) / totalWeight,
  )

  // --- Penaltılara gidip gitmeyeceği — ağırlıklı çoğunluk ---
  const penaltiesScore = votes.reduce((s, v) => s + (v.vote.wentToPenalties ? v.weight : 0), 0)
  const wentToPenalties = penaltiesScore >= totalWeight / 2

  // --- Penaltı skoru — sadece "penaltılara gidiyor" diyen oyları say. Kazanan
  // tarafı ağırlıklı çoğunlukla belirle, skoru da o tarafı seçen oyların
  // ağırlıklı ortalamasından al (gerçek penaltı kuralına uygun: beraberlik yok,
  // kazanan en az 1 gol öndedir — eşitlik durumu resolveKnockoutTie'da giderilir).
  const penaltyVoters = votes.filter((v) => v.vote.wentToPenalties && v.vote.penaltyWinner !== "none")
  let penaltyHomeGoals = 0
  let penaltyAwayGoals = 0
  let penaltyWinner: "home" | "away" | "none" = "none"
  if (penaltyVoters.length > 0) {
    const penaltyTotalWeight = penaltyVoters.reduce((s, v) => s + v.weight, 0)
    const homePenaltyWeight = penaltyVoters.reduce((s, v) => s + (v.vote.penaltyWinner === "home" ? v.weight : 0), 0)
    penaltyWinner = homePenaltyWeight >= penaltyTotalWeight / 2 ? "home" : "away"
    const winnerVoters = penaltyVoters.filter((v) => v.vote.penaltyWinner === penaltyWinner)
    const winnerVotersWeight = winnerVoters.reduce((s, v) => s + v.weight, 0)
    const avgWinnerGoals = Math.round(
      winnerVoters.reduce(
        (s, v) => s + (penaltyWinner === "home" ? v.vote.penaltyHomeGoals : v.vote.penaltyAwayGoals) * v.weight,
        0,
      ) / winnerVotersWeight,
    )
    const avgLoserGoals = Math.round(
      winnerVoters.reduce(
        (s, v) => s + (penaltyWinner === "home" ? v.vote.penaltyAwayGoals : v.vote.penaltyHomeGoals) * v.weight,
        0,
      ) / winnerVotersWeight,
    )
    if (penaltyWinner === "home") {
      penaltyHomeGoals = avgWinnerGoals
      penaltyAwayGoals = avgLoserGoals
    } else {
      penaltyAwayGoals = avgWinnerGoals
      penaltyHomeGoals = avgLoserGoals
    }
  }

  return {
    winner,
    homeScore,
    awayScore,
    confidence,
    btts,
    overUnder,
    extraTimeHomeGoals,
    extraTimeAwayGoals,
    wentToPenalties,
    penaltyWinner,
    penaltyHomeGoals,
    penaltyAwayGoals,
  }
}

// ---------------------------------------------------------------------------
// Self-consistency: bir modelden N örnekleme al, kendi içinde eşit ağırlıklı
// oylama yaparak tek bir birleşik tahmine indir. Örnekler arasındaki anlaşma
// oranı ("agreement") teşhis amaçlı loglanır; düşük anlaşma o model için
// tahminin belirsiz olduğunu gösterir.
// ---------------------------------------------------------------------------
async function sampleWithSelfConsistency(
  model: Parameters<typeof generateObject>[0]["model"],
  prompt: string,
  label: string,
): Promise<{ object: z.infer<typeof PredictionSchema>; agreement: number; sampleCount: number }> {
  const results = await Promise.allSettled(
    Array.from({ length: SELF_CONSISTENCY_SAMPLES }, () =>
      generateObject({ model, schema: PredictionSchema, prompt }),
    ),
  )

  const samples: z.infer<typeof PredictionSchema>[] = []
  for (const r of results) {
    if (r.status === "fulfilled") samples.push(r.value.object)
  }

  if (samples.length === 0) {
    throw new Error(`${label}: tüm örneklemeler başarısız oldu.`)
  }

  // Örneklerin kendi içindeki eşit ağırlıklı çoğunluk oylaması
  const agg = weightedVote(samples.map((s) => ({ vote: s, weight: 1 })))

  // Örnekler arası anlaşma oranı — kaç örnek çoğunluk kazananıyla hemfikir
  const agreeing = samples.filter((s) => s.winner === agg.winner).length
  const agreement = agreeing / samples.length

  const allFactors = samples.flatMap((s) => s.keyFactors)
  const keyFactors = [...new Set(allFactors)].slice(0, 5)

  console.log(`[v0] ${label} self-consistency: ${samples.length}/${SELF_CONSISTENCY_SAMPLES} örnek, anlaşma %${Math.round(agreement * 100)}, sonuç: ${agg.winner} ${agg.homeScore}-${agg.awayScore}`)

  return {
    object: { ...agg, keyFactors },
    agreement,
    sampleCount: samples.length,
  }
}

// ---------------------------------------------------------------------------
// Arka plan işi — canlı veri çekme + 3 model x 3 örnek ensemble + özet +
// çeviri (toplam ~11 LLM çağrısı, 1-3 dakika sürebilir). `after()` içinden
// çağrılır: HTTP yanıtı çok önce (202 "processing") döndükten sonra bile bu
// fonksiyon çalışmaya devam eder — istemci paneli kapatıp bağlantıyı kesse
// bile iş kesintiye uğramaz ve sonuç normal şekilde cache'e yazılır. Böylece
// kullanıcı aynı maça geri döndüğünde süreç sıfırdan tekrar başlamaz, sadece
// hazır olan (veya hâlâ hazırlanan) sonucu /api/predict/cached ile bekler.
// ---------------------------------------------------------------------------
async function runPredictionInBackground(fixtureId: number, fixture: Fixture): Promise<void> {
  try {
    // Canlı analiz verisini çek
    let live: LiveData
    try {
      live = await getLiveMatchData(fixture)
    } catch (err) {
      console.log("[v0] predict (bg) canlı veri alınamadı:", err instanceof Error ? err.message : err)
      return
    }

    const homeName = fixture.home.name
  const awayName = fixture.away.name
  const homeStanding = live.standings.find((s) => s.teamId === fixture.home.id)
  const awayStanding = live.standings.find((s) => s.teamId === fixture.away.id)

  // ---------------------------------------------------------------------------
  // Eleme usulü tur tespiti — bkz. lib/knockout.ts `resolveLegInfo`. Round
  // metnindeki ("Play-offs - 2nd Leg" vb.) "Leg" kelimesine GÜVENİLMİYOR;
  // birçok turnuva (örn. UEFA play-off turları) çift ayaklı olduğu halde
  // round metninde bunu belirtmez. Asıl kaynak H2H verisidir: aynı iki takım
  // aynı turnuvada son 60 gün içinde karşılaşmışsa bu maç round metni ne
  // derse desin bir rövanştır. İlk ayak sonucu bulunduysa hem LLM
  // prompt'larına bağlam olarak verilir hem de aşağıda toplam skor (agregat)
  // ve uzatma/penaltı çözümlemesi için kullanılır.
  // ---------------------------------------------------------------------------
  const roundInfo = resolveLegInfo(fixture.league.round, live.h2h, fixture)
  const firstLeg = roundInfo.firstLeg

  // ---------------------------------------------------------------------------
  // Poisson istatistik modeli — gol ortalamalarından beklenen gol (xG benzeri)
  // hesapla, kafa-kafaya geçmişle hafifçe harmanla, piyasa oranlarına göre
  // kalibre et ve Dixon-Coles düzeltmesiyle en olası skoru üret. Bu hem LLM
  // prompt'larına somut bir sayısal referans verir hem de aşağıda LLM'lerden
  // bağımsız 4. bir ensemble oyu olarak kullanılır.
  // ---------------------------------------------------------------------------
  // Son 6 maçlık form oranı — sezon ortalamasını güncel duruma (sakatlık
  // dönüşü, seri galibiyet/mağlubiyet, teknik direktör değişikliği) doğru
  // çeker. `recent` her zaman genel (ev+deplasman karışık) son maçlardır.
  const homeRecentForm = recentFormRate(live.homeStats?.recent)
  const awayRecentForm = recentFormRate(live.awayStats?.recent)

  const statsXG = computeExpectedGoals(
    live.homeStats ?? null,
    live.awayStats ?? null,
    live.homeStats?.home ?? null,
    live.awayStats?.away ?? null,
    homeRecentForm,
    awayRecentForm,
  )
  // h2h her zaman GÜNCEL fikstürün ev sahibi takımının bakış açısından
  // raporlanır (getHeadToHead(home.id, away.id) — bkz. lib/api-football.ts),
  // yani g.scored = ev sahibinin o geçmiş maçtaki golü, g.conceded = deplasmanın.
  const h2hXG = blendWithH2H(
    statsXG.homeXG,
    statsXG.awayXG,
    live.h2h.map((g) => ({ homeTeamGoals: g.scored, awayTeamGoals: g.conceded })),
  )

  // Sakatlık/eksik oyuncu etkisi — /injuries listesindeki oyuncuları squad'daki
  // mevkiye göre eşleştirip forvet/kaleci gibi kilit rolleri hücum/savunma
  // oranına yansıtır. Takım adına göre ev/deplasman ayrımı yapılır.
  const matchTeamInjuries = (teamName: string, squad: typeof live.homeSquad) =>
    live.injuries
      .filter((inj) => inj.team === teamName)
      .map((inj) => ({
        type: inj.type,
        position: squad.find((p) => p.id === inj.playerId)?.pos ?? null,
      }))
  const homeInjuryImpact = matchTeamInjuries(homeName, live.homeSquad)
  const awayInjuryImpact = matchTeamInjuries(awayName, live.awaySquad)
  const injuryAdjustedXG = applyInjuryImpact(h2hXG.homeXG, h2hXG.awayXG, homeInjuryImpact, awayInjuryImpact)

  const { homeXG, awayXG } = calibrateExpectedGoalsToOdds(injuryAdjustedXG.homeXG, injuryAdjustedXG.awayXG, live.odds)
  const poissonPrediction = predictFromExpectedGoals(homeXG, awayXG)

  // ---------------------------------------------------------------------------
  // Eleme turu bağlam bloğu — modele bu maçın beraberlikle bitemeyeceğini
  // (illa bir taraf turu geçecek) ve varsa ilk ayak skorunu bildirir. Modelin
  // asıl işi hâlâ SADECE bu maçın 90 dakikalık skorunu tahmin etmektir —
  // toplam skor (agregat) ve uzatma/penaltı çözümlemesi kodda ayrıca yapılır.
  // ---------------------------------------------------------------------------
  const tieContextBlock = (() => {
    if (!roundInfo.isKnockoutStage) return ""

    const legLabel = roundInfo.leg ? `${roundInfo.leg}. ayak` : "tek maçlık eleme turu"
    const lines: string[] = [
      "",
      `TUR BİLGİSİ: Bu maç "${fixture.league.round}" turunun ${legLabel}. Bu bir ELEME maçıdır — sıradan bir lig maçından farklı olarak burada beraberlik NİHAİ SONUÇ OLAMAZ, illa bir taraf turu geçecek.`,
    ]

    if (roundInfo.leg === 1) {
      lines.push("Bu ilk ayak — tur henüz bitmeyecek, rövanş oynanacak. Takımların rövanşı gözeterek (örn. deplasmanda farklı yenilmemeye çalışma, evde büyük fark açma isteği) oynayabileceğini göz önünde bulundur.")
    } else if (firstLeg) {
      lines.push(
        `İLK AYAK SONUCU: ${firstLeg.homeTeam} ${firstLeg.homeScore}-${firstLeg.awayScore} ${firstLeg.awayTeam} (${new Date(firstLeg.date).toLocaleDateString("tr-TR")}).`,
        `Bu maçın (${homeName} - ${awayName}) skorun, ilk ayakla toplandığında TOPLAM SKORU (agregatı) oluşturacak. Buna göre: geride kalan takım risk alıp açık oynayabilir, önde olan takım kontrollü/defansif oynayabilir. Deplasman golü kuralı artık YOK — sadece toplam gol sayısı belirleyicidir.`,
      )
    } else if (roundInfo.leg && roundInfo.leg >= 2) {
      lines.push("Bu son ayak ama ilk ayağın sonucu sistemde bulunamadı — sadece bu maçın skorunu tahmin et, toplam skor ayrıca hesaplanacak.")
    } else {
      lines.push("Bu tek maçlık bir eleme turu (final veya tek maçlık play-off) — 90 dakika sonunda berabere kalırsa uzatma, sonra gerekirse penaltılar oynanır.")
    }

    if (roundInfo.isDecidingMatch) {
      lines.push(
        "Bu maç (veya toplam skor) 90 dakika sonunda berabere kalırsa uzatma ve gerekirse penaltı oynanacak. homeScore/awayScore alanlarını YİNE DE sadece normal 90 dakikalık skor için doldur.",
        "AYRICA şu senaryoyu düşün: eğer 90 dakika (veya toplam skor) berabere kalırsa, 30 dakikalık uzatmada her takım kaç gol atar? Bunu extraTimeHomeGoals/extraTimeAwayGoals alanlarına yaz (takım formu, yorgunluk, kadro derinliği, uzatmada risk alma eğilimini göz önünde bulundur).",
        "Uzatma sonunda da berabere kalırsa penaltılara gidilir: wentToPenalties'i true yap, penaltyWinner'ı (kadro derinliği, kalecinin penaltı performansı, deneyim, baskı altında soğukkanlılık gibi faktörlere göre) seç, ve gerçekçi bir penaltı skoru (örn. 5-4, 4-3, 5-3) yazarak penaltyHomeGoals/penaltyAwayGoals'u doldur — gerçek penaltılarda beraberlik OLMAZ.",
        "Bu maç eleme turu değilse veya berabere kalma ihtimalini çok düşük görüyorsan extraTimeHomeGoals/extraTimeAwayGoals=0, wentToPenalties=false, penaltyWinner='none', penaltyHomeGoals/penaltyAwayGoals=0 yaz.",
      )
    }

    return lines.join("\n")
  })()

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
${formatRecentForm(live.homeStats, homeName, "home")}
${formatRecentForm(live.awayStats, awayName, "away")}

KAFA KAFAYA (son 5):
${formatH2H(live.h2h, homeName, awayName)}

SAKATLIK / CEZA:
${formatInjuries(live.injuries)}

BAHİS ORANLARI (piyasa beklentisi — düşük oran = güçlü favori):
${formatOdds(live.odds, homeName, awayName)}

İSTATİSTİKSEL MODEL (Poisson dağılımı, gol ortalamalarından hesaplandı):
Beklenen gol: ${homeName} ${homeXG.toFixed(2)} — ${awayName} ${awayXG.toFixed(2)}
En olası skor: ${poissonPrediction.homeScore}-${poissonPrediction.awayScore}
Skor tahminini yaparken bu istatistiksel referansı bir çıpa olarak kullan; ondan büyük şekilde
saparsan (yaralanma, motivasyon, form gibi) gerekçeni keyFactors'ta belirt.
${tieContextBlock}
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
  // Gemini 3.7 Flash — İstatistik & Gol Beklentisi Uzmanı
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
  // Grok 4.6 — Bağlam & Motivasyon Analisti
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
  // İki ayrı ağırlık seti: taraf (winner) isabetine göre ve skor hatasına göre —
  // bir modelin kazananı bilmesi skorunu isabetli tahmin ettiği anlamına gelmez.
  const [adaptiveWeights, adaptiveScoreWeights] = await Promise.all([
    getAdaptiveWeights(),
    getAdaptiveScoreWeights(),
  ])

  // 6. 3 modeli paralel çalıştır — her biri kendi rolüne ait prompt'u N kez
  // örnekleyip (self-consistency) kendi içinde çoğunluk oylaması yapar.
  const modelResults = await Promise.allSettled(
    ENSEMBLE_MODELS.map(async ({ provider, model, label }) => {
      const { object, agreement, sampleCount } = await sampleWithSelfConsistency(
        model,
        modelPrompts[provider] ?? contextPrompt,
        label,
      )
      const weight = adaptiveWeights[provider]?.weight ?? STATIC_WEIGHTS[provider] ?? 1.0
      const scoreWeight = adaptiveScoreWeights[provider]?.weight ?? weight
      return { provider, label, weight, scoreWeight, object, agreement, sampleCount }
    }),
  )

  type ModelResult = {
    provider: string
    label: string
    weight: number
    scoreWeight: number
    object: z.infer<typeof PredictionSchema>
    agreement: number
    sampleCount: number
  }
  const llmVotes = (modelResults as PromiseSettledResult<ModelResult>[])
    .filter((r): r is PromiseFulfilledResult<ModelResult> => r.status === "fulfilled")
    .map((r) => ({ ...r.value, vote: r.value.object }))

  if (llmVotes.length === 0) {
    console.log("[v0] predict (bg) tüm AI modelleri başarısız oldu, fixtureId:", fixtureId)
    return
  }

  // 6b. Poisson istatistik modelini 4. ensemble oyu olarak ekle — LLM'lerden
  // bağımsız, tamamen veri odaklı. Kendi geçmiş performansına göre de adaptif
  // ağırlık alır (provider adı "poisson").
  const poissonWeight = adaptiveWeights.poisson?.weight ?? STATIC_WEIGHTS.poisson
  const poissonScoreWeight = adaptiveScoreWeights.poisson?.weight ?? poissonWeight

  // İstatistik modelinin kendi uzatma/penaltı oyu — diğer 3 AI modeliyle
  // birlikte AYNI ağırlıklı oylamaya (weightedVote) girer, ayrı bir
  // deterministik "override" sistemi olarak DEĞİL, ensemble'ın 4. bir üyesi
  // olarak katkı verir. 30 dakikalık uzatmada beklenen gol, 90 dakikalık
  // xG'nin 1/3'ü kadar ölçeklenir; belirgin bir güç farkı (>= 0.35 xG) varsa
  // güçlü tarafa 1 gol yazılır.
  const etHomeXG = homeXG * (30 / 90)
  const etAwayXG = awayXG * (30 / 90)
  const etXgDiff = etHomeXG - etAwayXG
  const ET_GOAL_THRESHOLD = 0.35
  const poissonExtraTimeHomeGoals = etXgDiff >= ET_GOAL_THRESHOLD ? 1 : 0
  const poissonExtraTimeAwayGoals = etXgDiff <= -ET_GOAL_THRESHOLD ? 1 : 0
  const poissonPenaltyWinner: "home" | "away" =
    Math.abs(etXgDiff) > 0.05 ? (etXgDiff > 0 ? "home" : "away") : "home"

  const poissonVoteEntry = {
    provider: "poisson",
    label: "İstatistik Modeli",
    weight: poissonWeight,
    scoreWeight: poissonScoreWeight,
    agreement: 1,
    sampleCount: 0,
    vote: {
      homeScore:  poissonPrediction.homeScore,
      awayScore:  poissonPrediction.awayScore,
      winner:     poissonPrediction.winner,
      confidence: poissonPrediction.confidence,
      btts:       poissonPrediction.btts,
      overUnder:  poissonPrediction.overUnder,
      keyFactors: poissonPrediction.keyFactors,
      extraTimeHomeGoals: poissonExtraTimeHomeGoals,
      extraTimeAwayGoals: poissonExtraTimeAwayGoals,
      wentToPenalties: roundInfo.isDecidingMatch,
      penaltyWinner: roundInfo.isDecidingMatch ? poissonPenaltyWinner : "none",
      penaltyHomeGoals: roundInfo.isDecidingMatch ? (poissonPenaltyWinner === "home" ? 5 : 4) : 0,
      penaltyAwayGoals: roundInfo.isDecidingMatch ? (poissonPenaltyWinner === "away" ? 5 : 4) : 0,
    } satisfies z.infer<typeof PredictionSchema>,
  }

  const successfulVotes = [...llmVotes, poissonVoteEntry]

  // 7. Ağırlıklı oylama — kazanan/BTTS/üst-alt için `weight`, skor ortalaması
  // için `scoreWeight` kullanılır.
  const ensemble = weightedVote(
    successfulVotes.map((v) => ({ vote: v.vote, weight: v.weight, scoreWeight: v.scoreWeight })),
  )

  // 7a. Eleme turu çözümlemesi — toplam skor (agregat) + gerekirse uzatma/
  // penaltı. Ensemble'ın ürettiği (homeScore, awayScore) bu maçın normal 90
  // dakikalık tahminidir. Uzatma golleri ve penaltı skoru da AYNI ensemble'ın
  // (3 AI modeli + istatistik modeli) kendi tahminidir — bkz. PredictionSchema
  // extraTimeHomeGoals/extraTimeAwayGoals/wentToPenalties/penaltyWinner/
  // penaltyHomeGoals/penaltyAwayGoals ve yukarıdaki weightedVote. Burada kod
  // SADECE agregat aritmetiğini (ilk ayak + bu maç + uzatma golleri) uygular
  // ve gerçek penaltı kuralına (beraberlik olmaz) uyumu garanti eder —
  // ayrı bir xG/oran formülü kullanılmaz.
  const ensembleTieVote = {
    extraTimeHomeGoals: ensemble.extraTimeHomeGoals,
    extraTimeAwayGoals: ensemble.extraTimeAwayGoals,
    wentToPenalties: ensemble.wentToPenalties,
    penaltyHomeGoals: ensemble.penaltyHomeGoals,
    penaltyAwayGoals: ensemble.penaltyAwayGoals,
  }

  let tie: MatchPrediction["tie"] | undefined
  if (roundInfo.isKnockoutStage) {
    if (roundInfo.leg && roundInfo.leg >= 2 && firstLeg) {
      const { firstLegGoalsForCurrentHome, firstLegGoalsForCurrentAway } = reorientFirstLeg(firstLeg, homeName)
      const aggregateHomeBefore = firstLegGoalsForCurrentHome + ensemble.homeScore
      const aggregateAwayBefore = firstLegGoalsForCurrentAway + ensemble.awayScore

      const resolution = roundInfo.isDecidingMatch
        ? resolveKnockoutTie(aggregateHomeBefore, aggregateAwayBefore, ensembleTieVote)
        : null

      tie = {
        leg: roundInfo.leg,
        isKnockout: true,
        isDeciding: roundInfo.isDecidingMatch,
        firstLeg: { ...firstLeg },
        aggregateHome: resolution ? resolution.aggregateHome : aggregateHomeBefore,
        aggregateAway: resolution ? resolution.aggregateAway : aggregateAwayBefore,
        wentToExtraTime: resolution?.wentToExtraTime ?? false,
        wentToPenalties: resolution?.wentToPenalties ?? false,
        advancing: resolution?.advancing,
        penaltyHome: resolution?.penaltyHomeGoals,
        penaltyAway: resolution?.penaltyAwayGoals,
      }
    } else if (roundInfo.isDecidingMatch) {
      // Tek ayaklı eleme turu (final, tek maçlık play-off vb.) — agregat bu maçın skorudur.
      const resolution = resolveKnockoutTie(ensemble.homeScore, ensemble.awayScore, ensembleTieVote)
      tie = {
        leg: roundInfo.leg,
        isKnockout: true,
        isDeciding: true,
        aggregateHome: resolution.aggregateHome,
        aggregateAway: resolution.aggregateAway,
        wentToExtraTime: resolution.wentToExtraTime,
        wentToPenalties: resolution.wentToPenalties,
        advancing: resolution.advancing,
        penaltyHome: resolution.penaltyHomeGoals,
        penaltyAway: resolution.penaltyAwayGoals,
      }
    } else if (roundInfo.leg === 1) {
      // İlk ayak — tur henüz bitmiyor, sadece bilgi amaçlı işaretle.
      tie = { leg: 1, isKnockout: true, isDeciding: false }
    }
  }

  // 7b. Confidence kalibrasyonu — LLM'ler doğası gereği overconfident olma
  // eğilimindedir (örn. "%85 güven" dediklerinde ger��ekte %60 tutması gibi).
  // Ensemble'ın ham güven skorunu, geçmiş çözümlenmiş tahminlerin o güven
  // aralığında GERÇEKTE ne oranda tuttuğuna göre düzeltiyoruz (bkz.
  // lib/confidence-calibration.ts). Yeterli geçmiş veri yoksa (cold start)
  // ham skor değişmeden kalır.
  const calibrationCurve = await getConfidenceCalibrationCurve()
  const calibratedConfidence = calibrateConfidence(ensemble.confidence, calibrationCurve)

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

  // 9b. İngilizce çeviri — tek ek çağrı, ensemble tekrar çalıştırılmaz.
  // Sonuç summaryEn/keyFactorsEn olarak cache'e yazılır; başarısız olursa
  // İngilizce alanlar boş kalır ve UI Türkçe metne geri döner (fallback).
  let summaryEn: string | undefined
  let keyFactorsEn: string[] | undefined
  try {
    const { object: translationObj } = await generateObject({
      model: openai("gpt-5.6-terra"),
      schema: TranslationSchema,
      prompt: `Translate the following Turkish football match analysis into natural, fluent English. Keep team names and numbers unchanged.\n\nSummary:\n${summary}\n\nKey factors:\n${uniqueFactors.map((f, i) => `${i + 1}. ${f}`).join("\n")}`,
    })
    summaryEn = translationObj.summary
    keyFactorsEn = translationObj.keyFactors.length === uniqueFactors.length ? translationObj.keyFactors : undefined
  } catch {
    // Çeviri başarısız olursa İngilizce alanlar boş kalır, UI Türkçe'ye döner
  }

  // 10. ModelVote dizisi — model alanı "provider/model-id" formatında olmalı (UI etiket eşleşmesi için)
  const PROVIDER_MODEL_ID: Record<string, string> = {
    openai:  "openai/gpt-5.6-terra",
    google:  "google/gemini-3.7-flash",
    xai:     "xai/grok-4.6",
    poisson: "poisson/expected-goals",
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
    agreement:  v.agreement,
  }))

  // 11. Nihai tahmin — cache'e yaz
  const prediction: MatchPrediction = {
    fixtureId,
    homeScore:   ensemble.homeScore,
    awayScore:   ensemble.awayScore,
    winner:      ensemble.winner,
    confidence:  calibratedConfidence,
    rawConfidence: ensemble.confidence,
    summary,
    keyFactors:  uniqueFactors,
    summaryEn,
    keyFactorsEn,
    btts:        ensemble.btts,
    overUnder:   ensemble.overUnder,
    modelVotes,
    cachedAt:    Date.now(),
    homeName,
    awayName,
    // AI modellerine prompt'ta gönderilen bahis oranları — panelde de gösterilir
    odds:        live.odds,
    // Eleme turu bilgisi (agregat, uzatma/penaltı) — sadece knockout turlarda dolu
    tie,
  }

  await setCachedPrediction(fixtureId, prediction)

  // Bekleyen tahminler listesine ekle — yenile butonunda gerçek skorla karşılaştırılacak
  const fixtureDate = fixture.date.slice(0, 10) // YYYY-MM-DD
  await addPendingPrediction({ fixtureId, date: fixtureDate, homeName, awayName })
  } catch (err) {
    console.log("[v0] predict (bg) beklenmeyen hata, fixtureId:", fixtureId, err instanceof Error ? err.message : err)
  } finally {
    // İşlem başarılı da olsa başarısız da olsa marker'ı kaldır — aksi halde
    // TTL dolana kadar (5 dk) kullanıcı hiçbir yeniden deneme yapamaz.
    await clearPredictionInProgress(fixtureId)
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  // Güvenlik: bu endpoint gerçek para maliyeti doğuran 11 LLM çağrısı
  // tetikler (3 model x 3 örnek + özet + çeviri). UI'da butonun sadece
  // admin'e gösterilmesi yeterli değil — istemci tarafı gizleme, endpoint'in
  // kendisini korumaz. DELETE /api/predict ile aynı desen: oturumdaki
  // e-postayı kontrol et.
  const session = await auth.api.getSession({ headers: await headers() })
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const fixtureId = Number(body?.fixtureId)

  if (!fixtureId || isNaN(fixtureId)) {
    return NextResponse.json({ error: "fixtureId gerekli." }, { status: 400 })
  }

  // 1. Cache kontrolü — daha önce yapılmış tahmin varsa direkt döndür
  const cached = await getCachedPrediction(fixtureId)
  if (cached) return NextResponse.json(cached)

  // 2. Maç verisini çek (hızlı — senkron kontrol edip anlık 404/422 dönebiliriz)
  const fixture = await getFixtureById(fixtureId)
  if (!fixture) {
    return NextResponse.json({ error: "Maç bulunamadı." }, { status: 404 })
  }

  // 3. Sadece başlamamış maçlar
  if (!PREDICTABLE_STATUSES.has(fixture.statusShort)) {
    return NextResponse.json({ error: "Bu maç zaten oynanıyor veya tamamlandı." }, { status: 422 })
  }

  // 4. Zaten arka planda işleniyor mu? (aynı maça tekrar girip tekrar "tahmin
  // al" denilmesi, ya da çift tıklama) — atomik NX set: aynı anda sadece bir
  // istek işlemi başlatabilir, diğerleri "processing" ile geri döner.
  const started = await markPredictionInProgress(fixtureId)
  if (!started) {
    return NextResponse.json({ status: "processing", fixtureId }, { status: 202 })
  }

  // 5. Ağır kısmı (canlı veri + ~11 LLM çağrısı, 1-3 dk) arka planda çalıştır.
  // `after()` sayesinde bu HTTP isteğine verilen yanıt (202) döndükten sonra
  // da iş sürer — istemci paneli kapatıp bağlantıyı kesse bile kesilmez ve
  // sonuç normal şekilde cache'e yazılır. Kullanıcı aynı maça geri döndüğünde
  // /api/predict/cached ile sonucu bekler, süreç sıfırdan tekrar başlamaz.
  after(() => runPredictionInBackground(fixtureId, fixture))

  return NextResponse.json({ status: "processing", fixtureId }, { status: 202 })
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
