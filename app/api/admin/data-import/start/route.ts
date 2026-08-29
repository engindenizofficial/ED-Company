import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireImportAdmin } from '@/lib/data-import/admin-access'
import { launchImport } from '@/lib/data-import/launcher'

const inputSchema = z.object({ source: z.enum(['transfermarkt', 'api_football']) })

export async function POST(request: Request) {
  try {
    await requireImportAdmin()
    const input = inputSchema.parse(await request.json())
    const result = await launchImport(input.source, { idempotencyKey: `${input.source}:admin:${new Date().toISOString().slice(0, 16)}` })
    if (!result) return NextResponse.json({ error: 'sourceLocked' }, { status: 409 })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    return NextResponse.json({ error: 'invalidRequest' }, { status: 400 })
  }
}
