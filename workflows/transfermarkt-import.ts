import { IMPORT_LEAGUES } from '@/lib/data-import/scope'
import { failImportStep, finishImportStep, importTransfermarktLeagueStep, prepareImportStep } from '@/lib/data-import/steps'

const COMPLETION_PASSES = 3

export async function transfermarktImportWorkflow(runId: string) {
  'use workflow'
  try {
    await prepareImportStep(runId, 'transfermarkt')
    let incompleteLeagues = IMPORT_LEAGUES.map((league) => league.transfermarktId)

    for (let pass = 1; pass <= COMPLETION_PASSES && incompleteLeagues.length; pass++) {
      const nextIncomplete: string[] = []
      for (const league of IMPORT_LEAGUES) {
        if (!incompleteLeagues.includes(league.transfermarktId)) continue
        const complete = await importTransfermarktLeagueStep(runId, league)
        if (!complete) nextIncomplete.push(league.transfermarktId)
      }
      incompleteLeagues = nextIncomplete
    }

    if (incompleteLeagues.length) {
      throw new Error(`Transfermarkt aktarımı tamamlanmadı. Eksik detay içeren ligler: ${incompleteLeagues.join(', ')}`)
    }

    await finishImportStep(runId, 'transfermarkt')
    return { runId, source: 'transfermarkt', status: 'completed' }
  } catch (error) {
    await failImportStep(runId, error instanceof Error ? error.message : String(error))
    throw error
  }
}
