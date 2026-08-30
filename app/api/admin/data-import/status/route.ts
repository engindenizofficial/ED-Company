import { NextResponse } from 'next/server'
import { requireImportAdmin } from '@/lib/data-import/admin-access'
import { getImportDashboard } from '@/lib/data-import/repository'
import { getLatestPlayerMatchRun } from '@/lib/player-matching/repository'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireImportAdmin()
    const [dashboard, matching] = await Promise.all([
      getImportDashboard(),
      getLatestPlayerMatchRun().catch(() => null),
    ])
    return NextResponse.json({ ...dashboard, matching, serverNow: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
}
