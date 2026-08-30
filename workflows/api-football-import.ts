import { IMPORT_LEAGUES } from '@/lib/data-import/scope'
import { failImportStep, finishImportStep, importApiFootballLeagueStep, prepareImportStep } from '@/lib/data-import/steps'

const COMPLETION_PASSES = 3

export async function apiFootballImportWorkflow(runId: string, season: number) {
  'use workflow'
  try {
    await prepareImportStep(runId, 'api_football')
    let incompleteLeagues = IMPORT_LEAGUES.map((league) => String(league.apiFootballId))

    for (let pass = 1; pass <= COMPLETION_PASSES && incompleteLeagues.length; pass++) {
      const nextIncomplete: string[] = []
      for (const league of IMPORT_LEAGUES) {
        const leagueKey = String(league.apiFootballId)
        if (!incompleteLeagues.includes(leagueKey)) continue
        const complete = await importApiFootballLeagueStep(runId, league, season)
        if (!complete) nextIncomplete.push(leagueKey)
      }
      incompleteLeagues = nextIncomplete
    }

    if (incompleteLeagues.length) {
      throw new Error(`API-Football aktarımı tamamlanmadı. Eksik oyuncu profili içeren ligler: ${incompleteLeagues.join(', ')}`)
    }

    await finishImportStep(runId, 'api_football')
    return { runId, source: 'api_football', status: 'completed' }
  } catch (error) {
    await failImportStep(runId, error instanceof Error ? error.message : String(error))
    throw error
  }
}
