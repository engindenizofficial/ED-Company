"use client"

import { useMemo, useState, useTransition } from "react"
import { Check, Loader2, ShieldAlert, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatMarketValueEur } from "@/lib/market-value-format"
import { approveReviewEntry, rejectReviewEntry } from "@/app/actions/market-value-review"

export interface ReviewQueueItem {
  id: string
  entityType: "team" | "player"
  entityId: number
  entityName: string
  entityCountry: string | null
  candidateName: string | null
  candidateCountry: string | null
  candidateValueEur: number | null
  confidence: number
  status: "pending" | "approved" | "rejected"
  createdAt: string
}

type Status = ReviewQueueItem["status"]

const STATUS_LABEL: Record<Status, string> = {
  pending: "Bekleyen",
  approved: "Onaylanan",
  rejected: "Reddedilen",
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

  const grouped = useMemo(() => {
    const result: Record<Status, ReviewQueueItem[]> = { pending: [], approved: [], rejected: [] }
    for (const item of items) {
      result[statusById[item.id] ?? item.status].push(item)
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

  return (
    <div className="flex flex-col gap-6">
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
                      ? "Şu anda gözden geçirilmeyi bekleyen bir eşleşme yok."
                      : `${STATUS_LABEL[status]} durumunda bir kayıt bulunmuyor.`}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Card>
                <CardHeader className="sr-only">
                  <CardTitle>{STATUS_LABEL[status]} eşleşmeler</CardTitle>
                  <CardDescription>Takım ve oyuncu eşleştirme adayları</CardDescription>
                </CardHeader>
                <CardContent className="px-0 sm:px-4">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tür</TableHead>
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
                              <TableCell>
                                <Badge variant="outline">{item.entityType === "team" ? "Takım" : "Oyuncu"}</Badge>
                              </TableCell>
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
                                      onClick={() => resolve(item.id, "rejected")}
                                    >
                                      {busy ? (
                                        <Loader2 className="animate-spin" data-icon="inline-start" />
                                      ) : (
                                        <X data-icon="inline-start" />
                                      )}
                                      Reddet
                                    </Button>
                                    <Button size="sm" disabled={busy} onClick={() => resolve(item.id, "approved")}>
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
    </div>
  )
}
