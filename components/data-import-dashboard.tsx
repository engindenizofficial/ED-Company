'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Activity, AlertTriangle, Database, Play, RefreshCw, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { RESET_PHRASES, type ImportSource } from '@/lib/data-import/scope'

const fetcher = (url: string) => fetch(url).then(async (response) => { if (!response.ok) throw new Error('Durum alınamadı'); return response.json() })

type Run = { id: string; source: ImportSource; status: string; stage: string; totalLeagues: number; processedLeagues: number; totalTeams: number; processedTeams: number; successfulTeams: number; failedTeams: number; totalPlayers: number; processedPlayers: number; successfulPlayers: number; failedPlayers: number; missingPlayers: number; activeLeague?: string | null; activeTeam?: string | null; activeUrl?: string | null; heartbeatAt: string; startedAt: string; finishedAt?: string | null; restartCount: number; errorType?: string | null; errorMessage?: string | null }
type Checkpoint = { id: string; runId: string; kind: string; itemKey: string; parentKey?: string | null; status: string; updatedAt: string; metadata?: Record<string, unknown> }
type ImportError = { id: string; runId: string; source: ImportSource; kind: string; itemKey?: string | null; errorType: string; message: string; retryable: boolean; occurrences: number; createdAt: string }
type RunSummary = { runId: string; completedLeagues: number; latestCompletedAt?: string | null; discoveredTeams: number; successfulTeams: number; discoveredPlayers: number; successfulPlayers: number; failedTeams: number; failedPlayers: number; failedLeagues: number; uniqueErrors: number; repeatedErrors: number }
type DashboardData = { available: boolean; message?: string; serverNow: string; runs: Partial<Record<ImportSource, Run>>; checkpoints: Checkpoint[]; errors: ImportError[]; summaries: Record<string, RunSummary> }

const sourceLabels: Record<ImportSource, string> = { transfermarkt: 'Transfermarkt', api_football: 'API-Football' }
const statusLabels: Record<string, string> = { queued: 'Sırada', running: 'Çalışıyor', completed: 'Tamamlandı', failed: 'Başarısız', stale: 'Yanıt vermiyor', stopped: 'Durduruldu' }
const stageLabels: Record<string, string> = { queued: 'Başlatılıyor', leagues: 'Ligler hazırlanıyor', 'league-teams': 'Lig takımları', 'team-squad': 'Takım kadrosu', 'player-detail': 'Oyuncu ayrıntısı', completed: 'Tamamlandı', 'restart-queued': 'Yeniden başlatılıyor', 'watchdog-restart': 'Yeniden başlatma bekleniyor' }
const statusVariant = (status?: string) => status === 'completed' ? 'default' : status === 'failed' || status === 'stale' ? 'destructive' : 'secondary'
const date = (value?: string | null) => value ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value)) : '—'

function SourceCard({ source, run, summary, onStart, busy, serverNow }: { source: ImportSource; run?: Run; summary?: RunSummary; onStart: (source: ImportSource) => void; busy: boolean; serverNow?: string }) {
  const [phrase, setPhrase] = useState('')
  const completedLeagues = summary?.completedLeagues ?? 0
  const progress = run ? Math.min(100, Math.round((completedLeagues / Math.max(1, run.totalLeagues)) * 100)) : 0
  const unresolvedTeams = Math.max(0, (summary?.discoveredTeams ?? 0) - (summary?.successfulTeams ?? 0))
  const unresolvedPlayers = Math.max(0, (summary?.discoveredPlayers ?? 0) - (summary?.successfulPlayers ?? 0))
  const uniqueFailures = unresolvedTeams + unresolvedPlayers
  const retries = Math.max(0, (summary?.repeatedErrors ?? 0) - (summary?.uniqueErrors ?? 0))
  const stale = Boolean(run?.status === 'running' && serverNow && new Date(serverNow).getTime() - new Date(run.heartbeatAt).getTime() > 180_000)
  const displayStatus = stale ? 'stale' : run?.status
  const statusText = displayStatus === 'completed' && uniqueFailures > 0 ? `Tamamlandı · ${uniqueFailures} hatalı` : statusLabels[displayStatus ?? ''] ?? 'Henüz yok'
  async function reset() {
    const response = await fetch('/api/admin/data-import/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source, phrase }) })
    if (!response.ok) throw new Error('Sıfırlama başarısız')
    setPhrase(''); toast.success(`${sourceLabels[source]} sıfırlandı ve yeni koşu başlatıldı.`)
  }
  return <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><Database aria-hidden="true" />{sourceLabels[source]}</CardTitle>
      <CardDescription>{source === 'transfermarkt' ? 'Piyasa değeri ve ayrıntılı mevki snapshotı' : 'Bağımsız takım ve oyuncu snapshotı'}</CardDescription>
      <CardAction><Badge variant={statusVariant(displayStatus)}>{statusText}</Badge></CardAction>
    </CardHeader>
    <CardContent className="flex flex-col gap-5">
      <div className="flex flex-col gap-2"><div className="flex items-center justify-between gap-3 text-sm"><span className="truncate">{stageLabels[run?.stage ?? ''] ?? run?.stage ?? 'Henüz başlatılmadı'}</span><strong className="shrink-0">{completedLeagues}/{run?.totalLeagues ?? 0} tamamlandı</strong></div><Progress value={progress} aria-label={`${sourceLabels[source]} lig ilerlemesi`} /></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Başarılı takımlar', `${summary?.successfulTeams ?? 0}/${summary?.discoveredTeams ?? 0}`], ['Aktarılan oyuncular', String(summary?.successfulPlayers ?? 0)], ['Benzersiz hatalı öğe', String(uniqueFailures)], ['Yeniden deneme', String(retries)]].map(([label, value]) => <div key={label} className="rounded-lg bg-muted p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-mono text-lg font-semibold">{value}</p></div>)}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">Takımlar başarılı / keşfedilen benzersiz kayıtları, oyuncular başarıyla kaydedilen benzersiz profilleri gösterir.</p>
      <dl className="grid gap-2 text-sm">
        <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Son sistem sinyali</dt><dd>{date(run?.heartbeatAt)}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{stale || run?.status === 'completed' ? 'Son işlenen öğe' : 'İşlenen öğe'}</dt><dd className="max-w-52 truncate text-right">{run?.activeTeam ?? run?.activeLeague ?? '—'}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Son başarılı kayıt</dt><dd>{date(summary?.latestCompletedAt)}</dd></div>
      </dl>
      {run?.errorMessage ? <div className="flex gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"><AlertTriangle aria-hidden="true" /><span><strong>Son hata:</strong> {run.errorMessage}</span></div> : null}
    </CardContent>
    <CardFooter className="justify-between gap-2">
      <Button onClick={() => onStart(source)} disabled={busy || ['queued','running'].includes(run?.status ?? '')}><Play data-icon="inline-start" />{run ? 'Devam et' : 'Başlat'}</Button>
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}><RotateCcw data-icon="inline-start" />Sıfırla</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{sourceLabels[source]} verilerini sıfırla</AlertDialogTitle><AlertDialogDescription>Bu işlem yalnız seçilen kaynağın snapshot ve çalışma kayıtlarını siler. Onaylamak için <strong>{RESET_PHRASES[source]}</strong> yazın.</AlertDialogDescription></AlertDialogHeader>
          <Input value={phrase} onChange={(event) => setPhrase(event.target.value)} aria-label="Sıfırlama doğrulama ifadesi" placeholder={RESET_PHRASES[source]} />
          <AlertDialogFooter><AlertDialogCancel>Vazgeç</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={phrase !== RESET_PHRASES[source]} onClick={() => void reset().catch(() => toast.error('Sıfırlama başarısız.'))}>İkinci onay: sil ve başlat</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CardFooter>
  </Card>
}

export function DataImportDashboard() {
  const { data, error, isLoading, mutate } = useSWR<DashboardData>('/api/admin/data-import/status', fetcher, { refreshInterval: 5000, refreshWhenHidden: false })
  const [busy, setBusy] = useState(false)
  async function start(source: ImportSource) {
    setBusy(true)
    try { const response = await fetch('/api/admin/data-import/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source }) }); if (!response.ok) throw new Error(); toast.success(`${sourceLabels[source]} koşusu başlatıldı.`); await mutate() } catch { toast.error('Koşu başlatılamadı.') } finally { setBusy(false) }
  }
  if (error) return <div className="rounded-xl bg-destructive/10 p-5 text-destructive">Yönetim verileri alınamadı.</div>
  return <div className="flex flex-col gap-6">
    <div className="flex items-start justify-between gap-4"><div><p className="flex items-center gap-2 text-sm font-medium text-primary"><Activity aria-hidden="true" />Canlı operasyon görünümü</p><h1 className="mt-2 text-balance text-3xl font-bold tracking-tight">Veri aktarımı</h1><p className="mt-2 max-w-2xl text-pretty text-muted-foreground">23 ulusal ligin iki bağımsız kaynaktaki snapshotlarını, checkpointlerini ve hatalarını yönetin.</p></div><Button variant="outline" size="sm" onClick={() => void mutate()} disabled={isLoading}><RefreshCw data-icon="inline-start" />Yenile</Button></div>
    {!data?.available ? <div className="rounded-xl bg-muted p-5 text-sm text-muted-foreground">{data?.message ?? 'Migration bekleniyor. Panel şema uygulanınca canlı veriyi gösterecek.'}</div> : null}
    <div className="grid gap-4 xl:grid-cols-2"><SourceCard source="transfermarkt" run={data?.runs.transfermarkt} summary={data?.runs.transfermarkt ? data.summaries[data.runs.transfermarkt.id] : undefined} onStart={start} busy={busy} serverNow={data?.serverNow} /><SourceCard source="api_football" run={data?.runs.api_football} summary={data?.runs.api_football ? data.summaries[data.runs.api_football.id] : undefined} onStart={start} busy={busy} serverNow={data?.serverNow} /></div>
    <Tabs defaultValue="progress"><TabsList><TabsTrigger value="progress">Lig ve takım ilerlemesi</TabsTrigger><TabsTrigger value="errors">Hata günlüğü</TabsTrigger></TabsList>
      <TabsContent value="progress"><Card><CardHeader><CardTitle>Checkpoint ayrıntıları</CardTitle><CardDescription>Tamamlanan sayfa ve öğeler tekrar başlatmada atlanır.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Kaynak</TableHead><TableHead>Tür</TableHead><TableHead>Öğe</TableHead><TableHead>Durum</TableHead><TableHead>Güncelleme</TableHead></TableRow></TableHeader><TableBody>{(data?.checkpoints ?? []).map((item) => <TableRow key={item.id}><TableCell>{item.runId === data?.runs.transfermarkt?.id ? 'Transfermarkt' : 'API-Football'}</TableCell><TableCell>{item.kind}</TableCell><TableCell className="max-w-52 truncate">{item.itemKey}</TableCell><TableCell><Badge variant="secondary">{item.status}</Badge></TableCell><TableCell>{date(item.updatedAt)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card></TabsContent>
      <TabsContent value="errors"><Card><CardHeader><CardTitle>Hata günlüğü</CardTitle><CardDescription>Aynı öğenin tekrar eden hataları tek satırda gruplanır.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Kaynak</TableHead><TableHead>Öğe</TableHead><TableHead>Tür</TableHead><TableHead>Son hata</TableHead><TableHead className="text-right">Tekrar</TableHead><TableHead>Son görülme</TableHead></TableRow></TableHeader><TableBody>{(data?.errors ?? []).map((item) => <TableRow key={item.id}><TableCell>{sourceLabels[item.source]}</TableCell><TableCell><div className="flex flex-col gap-1"><span>{item.kind}</span><span className="max-w-40 truncate font-mono text-xs text-muted-foreground">{item.itemKey ?? '—'}</span></div></TableCell><TableCell><Badge variant="destructive">{item.errorType}</Badge></TableCell><TableCell className="min-w-64 max-w-md whitespace-normal">{item.message}</TableCell><TableCell className="text-right font-mono">{item.occurrences}</TableCell><TableCell className="whitespace-nowrap">{date(item.createdAt)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card></TabsContent>
    </Tabs>
  </div>
}
