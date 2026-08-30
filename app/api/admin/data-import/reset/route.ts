import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getWorld } from 'workflow/runtime'
import { requireImportAdmin } from '@/lib/data-import/admin-access'
import { getActiveWorkflowRunIds, resetSource, withSourceLock } from '@/lib/data-import/repository'
import { RESET_PHRASES } from '@/lib/data-import/scope'

const inputSchema = z.object({ source: z.enum(['transfermarkt', 'api_football']), phrase: z.string() })

export async function POST(request: Request) {
  try {
    await requireImportAdmin()
    const input = inputSchema.parse(await request.json())
    if (input.phrase !== RESET_PHRASES[input.source]) return NextResponse.json({ error: 'confirmationMismatch' }, { status: 400 })

    const workflowRunIds = await getActiveWorkflowRunIds(input.source)
    if (workflowRunIds.length) {
      const world = await getWorld()
      for (const runId of workflowRunIds) {
        const run = await world.runs.get(runId, { resolveData: 'none' })
        if (!['completed', 'failed', 'cancelled'].includes(run.status)) {
          await world.events.create(runId, { eventType: 'run_cancelled' })
        }
      }
    }

    const reset = await withSourceLock(input.source, () => resetSource(input.source))
    if (reset === null) return NextResponse.json({ error: 'sourceLocked' }, { status: 409 })
    return NextResponse.json({ reset: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    return NextResponse.json(
      { error: 'resetFailed', message: error instanceof Error ? error.message : 'Sıfırlama tamamlanamadı.' },
      { status: 500 },
    )
  }
}
