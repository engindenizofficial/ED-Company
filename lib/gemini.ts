import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai"
import type { Fixture, GeminiPrediction, LiveMatchData } from "./types"

const MODEL = "gemini-2.5-flash"

function getClient() {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error("GEMINI_API_KEY tanımlı değil.")
  return new GoogleGenerativeAI(key)
}

// JSON schema for structured output (Gemini responseSchema)
const predictionResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    score: {
      type: SchemaType.OBJECT,
      properties: {
        home: { type: SchemaType.INTEGER, description: "Ev sahibi tahmini gol" },
        away: { type: SchemaType.INTEGER, description: "Deplasman tahmini gol" },
      },
      required: ["home", "away"],
    },
    halfTimeScore: {
      type: SchemaType.OBJECT,
      properties: {
        home: { type: SchemaType.INTEGER },
        away: { type: SchemaType.INTEGER },
      },
      required: ["home", "away"],
    },
    winner: {
      type: SchemaType.STRING,
      enum: ["home", "draw", "away"],
      description: "En olası sonuç",
    },
    homeWinPct: { type: SchemaType.NUMBER, description: "Ev sahibi kazanma olasılığı (0-100)" },
    drawPct: { type: SchemaType.NUMBER, description: "Beraberlik olasılığı (0-100)" },
    awayWinPct: { type: SchemaType.NUMBER, description: "Deplasman kazanma olasılığı (0-100)" },
    over25Pct: { type: SchemaType.NUMBER, description: "2.5 üst olasılığı (0-100)" },
    under25Pct: { type: SchemaType.NUMBER, description: "2.5 alt olasılığı (0-100)" },
    bttsPct: { type: SchemaType.NUMBER, description: "Karşılıklı gol (KG Var) olasılığı (0-100)" },
    cornersEstimate: { type: SchemaType.STRING, description: "Korner beklentisi, örn '9-11 korner'" },
    cardsEstimate: { type: SchemaType.STRING, description: "Kart beklentisi, örn '4-5 sarı kart'" },
    firstToScore: {
      type: SchemaType.STRING,
      enum: ["home", "away", "none"],
    },
    expectedGoalsHome: { type: SchemaType.NUMBER, description: "Ev sahibi beklenen gol (xG)" },
    expectedGoalsAway: { type: SchemaType.NUMBER, description: "Deplasman beklenen gol (xG)" },
    confidence: { type: SchemaType.NUMBER, description: "Tahmine olan güven yüzdesi (0-100)" },
    keyFactors: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "Tahmini şekillendiren 3-6 anahtar madde (Türkçe)",
    },
    analysis: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "2-5 detaylı teknik analiz paragrafı (Türkçe)",
    },
  },
  required: [
    "score",
    "halfTimeScore",
    "winner",
    "homeWinPct",
    "drawPct",
    "awayWinPct",
    "over25Pct",
    "under25Pct",
    "bttsPct",
    "cornersEstimate",
    "cardsEstimate",
    "firstToScore",
    "expectedGoalsHome",
    "expectedGoalsAway",
    "confidence",
    "keyFactors",
    "analysis",
  ],
}

/**
 * Sends ALL gathered API-Football data to Gemini and asks it to produce the
 * complete match prediction. This is the ONLY predictor in the app — no
 * statistical model is used anywhere.
 */
export async function generateGeminiPrediction(
  fixture: Fixture,
  live: LiveMatchData,
  apiPredictionRaw: unknown,
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
    apiFootballTahminVerisi: apiPredictionRaw,
  }

  const systemInstruction =
    "Sen dünyanın en iyi futbol analistisin. Sana verilen tüm istatistiksel ve canlı verileri " +
    "derinlemesine analiz ederek profesyonel bir maç tahmini üretiyorsun. Yalnızca verilen verilere " +
    "dayan, veri uydurma. Tüm metinsel çıktıları akıcı ve profesyonel Türkçe ile yaz. " +
    "Yüzde değerlerini tutarlı ver: homeWinPct + drawPct + awayWinPct = 100, over25Pct + under25Pct = 100."

  const prompt =
    "Aşağıdaki maç için kapsamlı bir tahmin üret. Skor tahmini, ilk yarı skoru, kazanan, kazanma " +
    "olasılıkları, gol marketleri (2.5 alt/üst, KG Var), korner ve kart beklentisi, beklenen goller, " +
    "güven yüzdesi, anahtar faktörler ve detaylı teknik analiz ver.\n\nVERİLER (JSON):\n" +
    JSON.stringify(payload)

  const client = getClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = client.getGenerativeModel({
    model: MODEL,
    systemInstruction,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: predictionResponseSchema as any,
    },
  })

  const result = await model.generateContent(prompt)
  const text = result.response.text()
  const parsed = JSON.parse(text)

  return {
    score: parsed.score,
    halfTimeScore: parsed.halfTimeScore,
    winner: parsed.winner,
    homeWinPct: parsed.homeWinPct,
    drawPct: parsed.drawPct,
    awayWinPct: parsed.awayWinPct,
    over25Pct: parsed.over25Pct,
    under25Pct: parsed.under25Pct,
    bttsPct: parsed.bttsPct,
    cornersEstimate: parsed.cornersEstimate,
    cardsEstimate: parsed.cardsEstimate,
    firstToScore: parsed.firstToScore,
    expectedGoalsHome: parsed.expectedGoalsHome,
    expectedGoalsAway: parsed.expectedGoalsAway,
    confidence: parsed.confidence,
    keyFactors: parsed.keyFactors ?? [],
    analysis: parsed.analysis ?? [],
    model: "Gemini 2.5 Flash",
    generatedAt: Date.now(),
  }
}
