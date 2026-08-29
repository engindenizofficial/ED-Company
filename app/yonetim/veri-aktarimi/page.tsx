import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { DataImportDashboard } from '@/components/data-import-dashboard'
import { requireImportAdmin } from '@/lib/data-import/admin-access'

export const metadata: Metadata = { title: 'Veri Aktarımı | ED Analytics', description: 'Kaynak-özel futbol snapshot aktarım yönetimi.' }
export const dynamic = 'force-dynamic'

export default async function DataImportPage() {
  try { await requireImportAdmin() } catch { redirect('/') }
  return <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><DataImportDashboard /></div></main>
}
