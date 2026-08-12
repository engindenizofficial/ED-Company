"use client"

import { useMemo, useState, useTransition } from "react"
import { Check, Globe, Loader2, ShieldAlert, User, Users, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatMarketValueEur } from "@/lib/market-value-format"
import {
  approveReviewEntry,
  backfillReviewQueueCountriesBatch,
  rejectReviewEntry,
} from "@/app/actions/market-value-review"

export interface ReviewQueueItem {
  id: string
  entityType: "team" | "player"
  entityId: number
  entityName: string
  entityCountry: string | null
  candidateName: string | null
  candidateCountry: string | null
  countryLookupAttempted: boolean
  candidateValueEur: number | null
  confidence: number
  status: "pending" | "approved" | "rejected"
  createdAt: string
}

type Status = ReviewQueueItem["status"]
type EntityType = ReviewQueueItem["entityType"]

const STATUS_LABEL: Record<Status, string> = {
  pending: "Bekleyen",
  approved: "Onaylanan",
  rejected: "Reddedilen",
}

const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  team: "Takımlar",
  player: "Oyuncular",
}

const ENTITY_TYPE_ICON: Record<EntityType, typeof Users> = {
  team: Users,
  player: User,
}

/** Skor eşiğe (82) ne kadar yakınsa o kadar "iyi" — düşük skor daha riskli. */
function confidenceVariant(score: number): "default" | "secondary" | "destructive" {
  if (score >= 70) return "default"
  if (score >= 50) return "secondary"
  return "destructive"
}

export function MarketValueReviewBoard({ items }: { items: ReviewQueueItem[] }) {
  const [statusById, setStatusById] = useState<Record<string, Status>>(
    () => Object.fromEntries(items.map((item) => [item.id, item.status])),
  )
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [, startBackfillTransition] = useTransition()

  const [isBackfilling, setIsBackfilling] = useState(false)
  const [backfillDone, setBackfillDone] = useState(0)
  const [backfillError, setBackfillError] = useState<string | null>(null)

  // countryLookupAttempted=true olan satırlar için ülke bulunamamış olabilir
  // ama en az bir deneme yapılmıştır — bu satırları "eksik" sayıp butonu
  // sonsuza kadar aktif göstermiyoruz (bkz. backfillReviewQueueCountriesBatch).
  const missingCountryCount = useMemo(() => {
    return items.filter(
      (item) =>
        (statusById[item.id] ?? item.status) === "pending" &&
        !item.countryLookupAttempted &&
        (item.entityCountry === null || item.candidateCountry === null),
    ).length
  }, [items, statusById])

  function runBackfill() {
    setIsBackfilling(true)
    setBackfillError(null)
    setBackfillDone(0)
    startBackfillTransition(async () => {
      try {
        let done = false
        while (!done) {
          const result = await backfillReviewQueueCountriesBatch()
          setBackfillDone((prev) => prev + result.updated)
          done = result.done
        }
      } catch (err) {
        setBackfillError(err instanceof Error ? err.message : "Ülke bilgileri doldurulurken bir hata oluştu.")
      } finally {
        setIsBackfilling(false)
      }
    })
  }

  // Takım ve oyuncu adaylarını admin işini kolaylaştırmak için ayrı ayrı
  // grupluyoruz — önce tür (Takım/Oyuncu), sonra durum (Bekleyen/Onaylanan/
  // Reddedilen).
  const groupedByType = useMemo(() => {
    const result: Record<EntityType, Record<Status, ReviewQueueItem[]>> = {
      team: { pending: [], approved: [], rejected: [] },
      player: { pending: [], approved: [], rejected: [] },
    }
    for (const item of items) {
      result[item.entityType][statusById[item.id] ?? item.status].push(item)
    }
    return result
  }, [items, statusById])

  function resolve(id: string, next: Status) {
    setPendingId(id)
    startTransition(async () => {
      try {
        if (next === "approved") await approveReviewEntry(id)
        else await rejectReviewEntry(id)
        setStatusById((prev) => ({ ...prev, [id]: next }))
      } finally {
        setPendingId(null)
      }
    })
  }

  const teamPendingCount = groupedByType.team.pending.length
  const playerPendingCount = groupedByType.player.pending.length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <ShieldAlert className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-balance">Piyasa Değeri Manuel Kontrolü</h1>
            <p className="text-sm text-muted-foreground text-pretty">
              Otomatik eşleştirmenin güven skoru eşiğin altında kaldığı takım ve oyuncu adayları. Onayladığınızda
              aday, piyasa değeri tablosuna işlenir; reddettiğinizde ilgili kayıt boş bırakılır.
            </p>
          </div>
        </div>

        {missingCountryCount > 0 && (
          <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
            <Button size="sm" variant="outline" disabled={isBackfilling} onClick={runBackfill}>
              {isBackfilling ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Globe data-icon="inline-start" />
              )}
              Ülkeleri Doldur
            </Button>
            <p className="text-xs text-muted-foreground">
              {isBackfilling
                ? `${backfillDone} kayıt dolduruldu, devam ediyor…`
                : `${missingCountryCount} bekleyen kayıtta ülke bilgisi eksik`}
            </p>
            {backfillError && <p className="text-xs text-destructive">{backfillError}</p>}
          </div>
        )}
      </div>

      <Tabs defaultValue="team">
        <TabsList>
          {(["team", "player"] as const).map((entityType) => {
            const Icon = ENTITY_TYPE_ICON[entityType]
            const pendingCount = entityType === "team" ? teamPendingCount : playerPendingCount
            return (
              <TabsTrigger key={entityType} value={entityType}>
                <Icon data-icon="inline-start" />
                {ENTITY_TYPE_LABEL[entityType]}
                {pendingCount > 0 && (
                  <Badge variant="secondary" className="ml-1.5">
                    {pendingCount}
                  </Badge>
                )}
              </TabsTrigger>
            )
          })}
        </TabsList>

        {(["team", "player"] as const).map((entityType) => (
          <TabsContent key={entityType} value={entityType} className="mt-4">
            <StatusTabsPanel
              entityType={entityType}
              grouped={groupedByType[entityType]}
              isPending={isPending}
              pendingId={pendingId}
              onResolve={resolve}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

/**
 * Bir varlık türü (Takım/Oyuncu) için Bekleyen/Onaylanan/Reddedilen alt
 * sekmelerini ve tabloyu render eder. Admin işini kolaylaştırmak için takım
 * ve oyuncu adayları artık MarketValueReviewBoard'da ayrı sekmelerde
 * gösteriliyor; bu bileşen o iki sekmenin içeriğini üretir.
 */
function StatusTabsPanel({
  entityType,
  grouped,
  isPending,
  pendingId,
  onResolve,
}: {
  entityType: EntityType
  grouped: Record<Status, ReviewQueueItem[]>
  isPending: boolean
  pendingId: string | null
  onResolve: (id: string, next: Status) => void
}) {
  return (
    <Tabs defaultValue="pending">
      <TabsList>
        {(["pending", "approved", "rejected"] as const).map((status) => (
          <TabsTrigger key={status} value={status}>
            {STATUS_LABEL[status]}
            <Badge variant="secondary" className="ml-1.5">
              {grouped[status].length}
            </Badge>
          </TabsTrigger>
        ))}
      </TabsList>

      {(["pending", "approved", "rejected"] as const).map((status) => (
        <TabsContent key={status} value={status} className="mt-4">
          {grouped[status].length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ShieldAlert />
                </EmptyMedia>
                <EmptyTitle>Kayıt yok</EmptyTitle>
                <EmptyDescription>
                  {status === "pending"
                    ? `Şu anda gözden geçirilmeyi bekleyen bir ${entityType === "team" ? "takım" : "oyuncu"} eşleşmesi yok.`
                    : `${STATUS_LABEL[status]} durumunda bir kayıt bulunmuyor.`}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Card>
              <CardHeader className="sr-only">
                <CardTitle>
                  {STATUS_LABEL[status]} {ENTITY_TYPE_LABEL[entityType].toLowerCase()}
                </CardTitle>
                <CardDescription>{ENTITY_TYPE_LABEL[entityType]} eşleştirme adayları</CardDescription>
              </CardHeader>
              <CardContent className="px-0 sm:px-4">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>API-Football</TableHead>
                        <TableHead>Transfermarkt adayı</TableHead>
                        <TableHead>Değer</TableHead>
                        <TableHead>Güven</TableHead>
                        {status === "pending" && <TableHead className="text-right">Aksiyon</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {grouped[status].map((item) => {
                        const formattedValue = formatMarketValueEur(item.candidateValueEur)
                        const busy = isPending && pendingId === item.id
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">
                              <div>{item.entityName}</div>
                              {item.entityCountry && (
                                <div className="text-xs font-normal text-muted-foreground">
                                  {item.entityCountry}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              <div className="text-foreground">{item.candidateName ?? "—"}</div>
                              {item.candidateCountry && (
                                <div className="text-xs text-muted-foreground">{item.candidateCountry}</div>
                              )}
                            </TableCell>
                            <TableCell>{formattedValue ?? "—"}</TableCell>
                            <TableCell>
                              <Badge variant={confidenceVariant(item.confidence)}>{item.confidence}</Badge>
                            </TableCell>
                            {status === "pending" && (
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busy}
                                    onClick={() => onResolve(item.id, "rejected")}
                                  >
                                    {busy ? (
                                      <Loader2 className="animate-spin" data-icon="inline-start" />
                                    ) : (
                                      <X data-icon="inline-start" />
                                    )}
                                    Reddet
                                  </Button>
                                  <Button size="sm" disabled={busy} onClick={() => onResolve(item.id, "approved")}>
                                    {busy ? (
                                      <Loader2 className="animate-spin" data-icon="inline-start" />
                                    ) : (
                                      <Check data-icon="inline-start" />
                                    )}
                                    Onayla
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      ))}
    </Tabs>
  )
}
