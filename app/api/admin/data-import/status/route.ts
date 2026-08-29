import { NextResponse } from 'next/server'
import { requireImportAdmin } from '@/lib/data-import/admin-access'
import { getImportDashboard } from '@/lib/data-import/repository'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireImportAdmin()
    return NextResponse.json({ ...(await getImportDashboard()), serverNow: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
}
