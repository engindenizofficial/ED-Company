import { IMPORT_LEAGUES } from '@/lib/data-import/scope'
import { failImportStep, finishImportStep, importTransfermarktLeagueStep, prepareImportStep } from '@/lib/data-import/steps'

export async function transfermarktImportWorkflow(runId: string) {
  'use workflow'
  try {
    await prepareImportStep(runId, 'transfermarkt')
    for (const league of IMPORT_LEAGUES) await importTransfermarktLeagueStep(runId, league)
    await finishImportStep(runId, 'transfermarkt')
    return { runId, source: 'transfermarkt', status: 'completed' }
  } catch (error) {
    await failImportStep(runId, error instanceof Error ? error.message : String(error))
    throw error
  }
}
