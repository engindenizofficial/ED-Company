import { start } from 'workflow/api'
import { playerMatchingWorkflow } from '@/workflows/player-matching'
import { bindPlayerMatchWorkflow, createPlayerMatchRun } from './repository'

export async function launchPlayerMatching() {
  const result = await createPlayerMatchRun()
  if (!result.created) return { matchRunId: result.run.id, alreadyActive: true }
  const workflowRun = await start(playerMatchingWorkflow, [result.run.id])
  await bindPlayerMatchWorkflow(result.run.id, workflowRun.runId)
  return { matchRunId: result.run.id, workflowRunId: workflowRun.runId, alreadyActive: false }
}
