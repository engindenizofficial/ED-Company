import { getGeminiInput } from "./api-football"
import { generateGeminiPrediction } from "./gemini"
import { getLockedPrediction, lockPrediction, forceLockPrediction } from "./redis"
import type { Fixture, GeminiPrediction } from "./types"

/**
 * Returns the LOCKED Gemini prediction for a fixture. If one already exists in
 * Redis it is returned untouched (Gemini is never called again). Otherwise we
 * fetch the full API-Football dataset, ask Gemini once, and lock the result so
 * every future visitor gets the exact same, unchanging prediction.
 */
export async function ensurePrediction(fixture: Fixture): Promise<GeminiPrediction> {
  const existing = await getLockedPrediction(fixture.id)
  if (existing) return existing

  const { live, apiPredictionRaw } = await getGeminiInput(fixture)
  const fresh = await generateGeminiPrediction(fixture, live, apiPredictionRaw)
  return lockPrediction(fixture.id, fresh)
}

/**
 * Always fetches full API-Football data and generates a fresh Gemini prediction,
 * overwriting any previously stored one. Used to upgrade predictions that were
 * generated with incomplete data (e.g. card-level predictions without API detail).
 */
export async function forceEnsurePrediction(fixture: Fixture): Promise<GeminiPrediction> {
  const { live, apiPredictionRaw } = await getGeminiInput(fixture)
  const fresh = await generateGeminiPrediction(fixture, live, apiPredictionRaw)
  return forceLockPrediction(fixture.id, fresh)
}
