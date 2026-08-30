import { NextResponse } from 'next/server'
import { requireImportAdmin } from '@/lib/data-import/admin-access'
import { launchPlayerMatching } from '@/lib/player-matching/launcher'

export async function POST() {
  try {
    await requireImportAdmin()
    const result = await launchPlayerMatching()
    if (result.alreadyActive) return NextResponse.json(result, { status: 409 })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    const message = error instanceof Error ? error.message : 'Eşleştirme başlatılamadı.'
    const migrationMissing = /player_match_(run|result).*does not exist/i.test(message)
    return NextResponse.json({ error: migrationMissing ? 'migrationRequired' : 'startFailed', message: migrationMissing ? 'Oyuncu eşleştirme migrationı henüz uygulanmadı.' : message }, { status: migrationMissing ? 503 : 400 })
  }
}
