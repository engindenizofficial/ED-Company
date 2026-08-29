import { start } from 'workflow/api'
import { apiFootballImportWorkflow } from '@/workflows/api-football-import'
import { transfermarktImportWorkflow } from '@/workflows/transfermarkt-import'
import { bindWorkflowRun, createImportRun, withSourceLock } from './repository'
import type { ImportSource } from './scope'

function currentSeason() {
  const now = new Date()
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1
}

export async function launchImport(source: ImportSource, options: { runId?: string; restart?: boolean; idempotencyKey?: string } = {}) {
  return withSourceLock(source, async () => {
    const result = options.runId
      ? { run: { id: options.runId }, created: false }
      : await createImportRun(source, options.idempotencyKey)
    if (!result.created && !options.restart && !options.runId) return { importRunId: result.run.id, alreadyActive: true }
    const workflowRun = source === 'transfermarkt'
      ? await start(transfermarktImportWorkflow, [result.run.id])
      : await start(apiFootballImportWorkflow, [result.run.id, currentSeason()])
    await bindWorkflowRun(result.run.id, workflowRun.runId, Boolean(options.restart))
    return { importRunId: result.run.id, workflowRunId: workflowRun.runId, alreadyActive: false }
  })
}
