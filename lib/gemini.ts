import type { Fixture, GeminiPrediction, LiveMatchData } from "./types"

// Use the REST API directly so we are not tied to the SDK's v1beta default.
const MODEL = "gemini-3.5-flash"
const BASE = "https://generativelanguage.googleapis.com/v1beta"

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error("GEMINI_API_KEY tanımlı değil.")
  return key
}

/**
 * Sends ALL gathered API-Football data to Gemini and asks it to produce the
 * complete match prediction. This is the ONLY predictor in the app — no
 * statistical model is used anywhere.
 */
export async function generateGeminiPrediction(
  fixture: Fixture,
  live: LiveMatchData,
): Promise<GeminiPrediction> {
  const payload = {
    mac: {
      lig: `${fixture.league.name} (${fixture.league.country})`,
      hafta: fixture.league.round,
      tarih: fixture.date,
      stat: fixture.venue,
      durum: fixture.status,
      evSahibi: fixture.home.name,
      deplasman: fixture.away.name,
      anlikSkor: { ev: fixture.goalsHome, deplasman: fixture.goalsAway },
    },
    evSahibiSezonIstatistik: live.homeStats,
    deplasmanSezonIstatistik: live.awayStats,
    puanDurumu: live.standings,
    aralarindakiMaclar: live.h2h,
    sakatCezaliListesi: live.injuries,
    kadrolar: live.lineups,
    canliOlaylar: live.events,
    canliIstatistikler: live.statistics,
  }

  const systemText =
    "Sen dünyanın en iyi futbol analistisin. Sana verilen tüm istatistiksel ve canlı verileri " +
    "derinlemesine analiz ederek profesyonel bir maç tahmini üretiyorsun. Yalnızca verilen verilere " +
    "dayan, veri uydurma. Tüm metinsel çıktıları akıcı ve profesyonel Türkçe ile yaz. " +
    "Yüzde değerlerini tutarlı ver: homeWinPct + drawPct + awayWinPct = 100, over25Pct + under25Pct = 100. " +
    "Yanıtını şu JSON şemasına tam uygun üret ve yalnızca JSON döndür, başka hiçbir şey yazma."

  const schemaDescription = `{
  "score": {"home": integer, "away": integer},
  "halfTimeScore": {"home": integer, "away": integer},
  "winner": "home" | "draw" | "away",
  "homeWinPct": number (0-100),
  "drawPct": number (0-100),
  "awayWinPct": number (0-100),
  "over25Pct": number (0-100),
  "under25Pct": number (0-100),
  "bttsPct": number (0-100),
  "cornersEstimate": string (e.g. "9-11 korner"),
  "cardsEstimate": string (e.g. "4-5 sarı kart"),
  "firstToScore": "home" | "away" | "none",
  "expectedGoalsHome": number,
  "expectedGoalsAway": number,
  "confidence": number (0-100),
  "keyFactors": string[] (3-6 maddde, Türkçe),
  "analysis": string[] (2-5 paragraf, Türkçe)
}`

  const userPrompt =
    "Aşağıdaki maç için kapsamlı bir tahmin üret. " +
    "Skor tahmini, ilk yarı skoru, kazanan, kazanma olasılıkları, gol marketleri, " +
    "korner ve kart beklentisi, beklenen goller, güven yüzdesi, anahtar faktörler ve detaylı teknik analiz ver.\n\n" +
    "Beklenen JSON şeması:\n" +
    schemaDescription +
    "\n\nVERİLER:\n" +
    JSON.stringify(payload)

  const body = {
    system_instruction: { parts: [{ text: systemText }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.4,
    },
  }

  const res = await fetch(`${BASE}/models/${MODEL}:generateContent?key=${apiKey()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Gemini API hatası (${res.status}): ${errText.slice(0, 300)}`)
  }

  const data = await res.json()
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error("Gemini boş yanıt döndürdü.")

  const parsed = JSON.parse(text)

  return {
    score: parsed.score ?? { home: 1, away: 1 },
    halfTimeScore: parsed.halfTimeScore ?? { home: 0, away: 0 },
    winner: parsed.winner ?? "draw",
    homeWinPct: parsed.homeWinPct ?? 33,
    drawPct: parsed.drawPct ?? 34,
    awayWinPct: parsed.awayWinPct ?? 33,
    over25Pct: parsed.over25Pct ?? 50,
    under25Pct: parsed.under25Pct ?? 50,
    bttsPct: parsed.bttsPct ?? 40,
    cornersEstimate: parsed.cornersEstimate ?? "-",
    cardsEstimate: parsed.cardsEstimate ?? "-",
    firstToScore: parsed.firstToScore ?? "none",
    expectedGoalsHome: parsed.expectedGoalsHome ?? 1,
    expectedGoalsAway: parsed.expectedGoalsAway ?? 1,
    confidence: parsed.confidence ?? 50,
    keyFactors: parsed.keyFactors ?? [],
    analysis: parsed.analysis ?? [],
    model: `Gemini ${MODEL}`,
    generatedAt: Date.now(),
  }
}
