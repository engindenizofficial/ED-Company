import { generateObject } from "ai"
import { z } from "zod"
import type { Fixture, GeminiPrediction, LiveMatchData } from "./types"

// Fast, economical Flash tier (successor to Gemini 2.0 Flash) via AI Gateway.
const MODEL = "google/gemini-2.5-flash"

const predictionSchema = z.object({
  score: z.object({
    home: z.number().int().min(0).max(12).describe("Ev sahibi tahmini gol"),
    away: z.number().int().min(0).max(12).describe("Deplasman tahmini gol"),
  }),
  halfTimeScore: z.object({
    home: z.number().int().min(0).max(8),
    away: z.number().int().min(0).max(8),
  }),
  winner: z.enum(["home", "draw", "away"]).describe("En olası sonuç"),
  homeWinPct: z.number().min(0).max(100),
  drawPct: z.number().min(0).max(100),
  awayWinPct: z.number().min(0).max(100),
  over25Pct: z.number().min(0).max(100).describe("2.5 üst olasılığı"),
  under25Pct: z.number().min(0).max(100),
  bttsPct: z.number().min(0).max(100).describe("Karşılıklı gol (KG Var) olasılığı"),
  cornersEstimate: z.string().describe("Korner beklentisi, örn '9-11 korner'"),
  cardsEstimate: z.string().describe("Kart beklentisi, örn '4-5 sarı kart'"),
  firstToScore: z.enum(["home", "away", "none"]),
  expectedGoalsHome: z.number().min(0).max(8),
  expectedGoalsAway: z.number().min(0).max(8),
  confidence: z.number().min(0).max(100).describe("Tahmine olan güven yüzdesi"),
  keyFactors: z.array(z.string()).min(3).max(6).describe("Tahmini şekillendiren anahtar maddeler (Türkçe)"),
  analysis: z.array(z.string()).min(2).max(5).describe("Detaylı teknik analiz paragrafları (Türkçe)"),
})

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

  const system =
    "Sen dünyanın en iyi futbol analistisin. Sana verilen tüm istatistiksel ve canlı verileri " +
    "derinlemesine analiz ederek profesyonel bir maç tahmini üretiyorsun. Yalnızca verilen verilere " +
    "dayan, veri uydurma. Tüm metinsel çıktıları akıcı ve profesyonel Türkçe ile yaz. " +
    "Yüzde değerlerini tutarlı ver: homeWinPct + drawPct + awayWinPct = 100, over25Pct + under25Pct = 100."

  const prompt =
    "Aşağıdaki maç için kapsamlı bir tahmin üret. Skor tahmini, ilk yarı skoru, kazanan, kazanma " +
    "olasılıkları, gol marketleri (2.5 alt/üst, KG Var), korner ve kart beklentisi, beklenen goller, " +
    "güven yüzdesi, anahtar faktörler ve detaylı teknik analiz ver.\n\nVERİLER (JSON):\n" +
    JSON.stringify(payload)

  const { object } = await generateObject({
    model: MODEL,
    schema: predictionSchema,
    system,
    prompt,
  })

  return {
    ...object,
    model: "Gemini 2.5 Flash",
    generatedAt: Date.now(),
  }
}
