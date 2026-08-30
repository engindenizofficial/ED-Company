import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { launchImport } from '@/lib/data-import/launcher'
import { findRestartCandidates, markStale, recordImportError } from '@/lib/data-import/repository'
import type { ImportSource } from '@/lib/data-import/scope'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const candidates = await findRestartCandidates()
    const restarted: string[] = []
    for (const run of candidates) {
      const source = run.source as ImportSource
      try {
        await markStale(run.id)
        const result = await launchImport(source, { runId: run.id, restart: true })
        if (result && !result.alreadyActive) restarted.push(run.id)
      } catch (error) {
        await recordImportError({ runId: run.id, source, kind: 'watchdog', errorType: 'restart_failed', message: error instanceof Error ? error.message : 'Yeniden başlatma başarısız', retryable: true, attempt: run.restartCount + 1 })
      }
    }
    return NextResponse.json({ checked: candidates.length, restarted })
  } catch {
    return NextResponse.json({ error: 'watchdogUnavailable' }, { status: 503 })
  }
}
