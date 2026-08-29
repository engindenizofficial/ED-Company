import { IMPORT_LEAGUES } from '@/lib/data-import/scope'
import { failImportStep, finishImportStep, importApiFootballLeagueStep, prepareImportStep } from '@/lib/data-import/steps'

export async function apiFootballImportWorkflow(runId: string, season: number) {
  'use workflow'
  try {
    await prepareImportStep(runId, 'api_football')
    for (const league of IMPORT_LEAGUES) await importApiFootballLeagueStep(runId, league, season)
    await finishImportStep(runId, 'api_football')
    return { runId, source: 'api_football', status: 'completed' }
  } catch (error) {
    await failImportStep(runId, error instanceof Error ? error.message : String(error))
    throw error
  }
}
