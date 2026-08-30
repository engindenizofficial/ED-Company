import { matchPlayers } from '@/lib/player-matching/engine'
import { completePlayerMatchRun, failPlayerMatchRun, initializePlayerMatchRun, loadMatchInputs, saveMatchBatch } from '@/lib/player-matching/repository'

const BATCH_SIZE = 250

async function executePlayerMatching(runId: string) {
  'use step'
  try {
    const inputs = await loadMatchInputs(runId)
    await initializePlayerMatchRun(runId, inputs.transfermarkt.length)
    const decisions = matchPlayers(inputs.transfermarkt, inputs.apiFootball)
    for (let index = 0; index < decisions.length; index += BATCH_SIZE) {
      await saveMatchBatch(runId, decisions.slice(index, index + BATCH_SIZE))
    }
    await completePlayerMatchRun(runId)
    const exactMatches = decisions.filter((decision) => decision.level === 'exact_biographic').length
    const fuzzyMatches = decisions.filter((decision) => decision.level === 'fuzzy_name_birthdate').length
    const unmatched = decisions.filter((decision) => decision.level === 'unmatched').length
    return { processed: decisions.length, matched: exactMatches + fuzzyMatches, exactMatches, fuzzyMatches, unmatched }
  } catch (error) {
    await failPlayerMatchRun(runId, error)
    throw error
  }
}

export async function playerMatchingWorkflow(runId: string) {
  'use workflow'
  return executePlayerMatching(runId)
}
