"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Loader2, ShieldCheck } from "lucide-react"
import { approveReviewEntry } from "@/app/actions/market-value-review"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatMarketValueEur } from "@/lib/market-value-format"

export interface ReviewQueueItem {
  id: string
  entityType: "league" | "team" | "player"
  afName: string
  afCountry: string | null
  tmName: string | null
  tmCountry: string | null
  tmValueEur: number | null
  confidence: number
  status: "pending" | "approved"
}

const TYPES = ["league", "team", "player"] as const
const LABELS = { league: "Ligler", team: "Takımlar", player: "Oyuncular" }
type SortKey = "value" | "confidence"
type SortDirection = "desc" | "asc"
type SortState = { key: SortKey; direction: SortDirection } | null

function SortIcon({ active, direction }: { active: boolean; direction?: SortDirection }) {
  if (!active) return <ArrowUpDown data-icon="inline-end" />
  return direction === "desc" ? <ArrowDown data-icon="inline-end" /> : <ArrowUp data-icon="inline-end" />
}

export function MarketValueReviewBoard({ items }: { items: ReviewQueueItem[] }) {
  const [approved, setApproved] = useState(() => new Set(items.filter((item) => item.status === "approved").map((item) => item.id)))
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [sort, setSort] = useState<SortState>(null)
  const [isPending, startTransition] = useTransition()
  const grouped = useMemo(() => Object.fromEntries(TYPES.map((type) => {
    const rows = items.filter((item) => item.entityType === type)
    if (!sort) return [type, rows]

    return [type, [...rows].sort((a, b) => {
      const aValue = sort.key === "value" ? a.tmValueEur : a.confidence
      const bValue = sort.key === "value" ? b.tmValueEur : b.confidence
      if (aValue == null && bValue == null) return 0
      if (aValue == null) return 1
      if (bValue == null) return -1
      return sort.direction === "desc" ? bValue - aValue : aValue - bValue
    })]
  })) as Record<(typeof TYPES)[number], ReviewQueueItem[]>, [items, sort])

  function toggleSort(key: SortKey) {
    setSort((current) => current?.key === key
      ? { key, direction: current.direction === "desc" ? "asc" : "desc" }
      : { key, direction: "desc" })
  }

  useEffect(() => {
    setApproved(new Set(items.filter((item) => item.status === "approved").map((item) => item.id)))
  }, [items])

  function approve(id: string) {
    setPendingId(id)
    startTransition(async () => {
      try {
        await approveReviewEntry(id)
        setApproved((current) => new Set(current).add(id))
      } finally {
        setPendingId(null)
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5" />
        <div>
          <h1 className="text-lg font-semibold text-balance">Manuel eşleştirme onayları</h1>
          <p className="text-sm text-muted-foreground text-pretty">75 puanın altında kalan adayları inceleyin. Bu akışta yalnızca onay işlemi vardır.</p>
        </div>
      </div>
      <Tabs defaultValue="league">
        <TabsList>
          {TYPES.map((type) => <TabsTrigger key={type} value={type}>{LABELS[type]}<Badge variant="secondary">{grouped[type].filter((item) => !approved.has(item.id)).length}</Badge></TabsTrigger>)}
        </TabsList>
        {TYPES.map((type) => (
          <TabsContent key={type} value={type} className="mt-4">
            {grouped[type].length === 0 ? (
              <Empty><EmptyHeader><EmptyMedia variant="icon"><ShieldCheck /></EmptyMedia><EmptyTitle>İncelenecek kayıt yok</EmptyTitle><EmptyDescription>Bu tür için düşük güvenli bir eşleşme bulunmadı.</EmptyDescription></EmptyHeader></Empty>
            ) : (
              <Card>
                <CardHeader><CardTitle>{LABELS[type]}</CardTitle><CardDescription>API-Football ve Transfermarkt adayları yan yana gösterilir.</CardDescription></CardHeader>
                <CardContent className="overflow-x-auto px-0 sm:px-6">
                  <Table>
                    <TableHeader><TableRow><TableHead>API-Football</TableHead><TableHead>Transfermarkt</TableHead><TableHead aria-sort={sort?.key === "value" ? (sort.direction === "desc" ? "descending" : "ascending") : "none"}><Button variant="ghost" size="sm" aria-label={`Piyasa değerine göre ${sort?.key === "value" && sort.direction === "desc" ? "düşükten yükseğe" : "yüksekten düşüğe"} sırala`} onClick={() => toggleSort("value")}>Piyasa Değeri<SortIcon active={sort?.key === "value"} direction={sort?.direction} /></Button></TableHead><TableHead aria-sort={sort?.key === "confidence" ? (sort.direction === "desc" ? "descending" : "ascending") : "none"}><Button variant="ghost" size="sm" aria-label={`Güven skoruna göre ${sort?.key === "confidence" && sort.direction === "desc" ? "düşükten yükseğe" : "yüksekten düşüğe"} sırala`} onClick={() => toggleSort("confidence")}>Güven Skoru<SortIcon active={sort?.key === "confidence"} direction={sort?.direction} /></Button></TableHead><TableHead className="text-right">İşlem</TableHead></TableRow></TableHeader>
                    <TableBody>{grouped[type].map((item) => {
                      const done = approved.has(item.id)
                      const busy = isPending && pendingId === item.id
                      return <TableRow key={item.id}><TableCell><strong>{item.afName}</strong><div className="text-xs text-muted-foreground">{item.afCountry ?? "—"}</div></TableCell><TableCell><strong>{item.tmName ?? "Aday yok"}</strong><div className="text-xs text-muted-foreground">{item.tmCountry ?? "—"}</div></TableCell><TableCell>{formatMarketValueEur(item.tmValueEur) ?? "—"}</TableCell><TableCell><Badge variant={item.confidence >= 60 ? "secondary" : "destructive"}>{item.confidence}/100</Badge></TableCell><TableCell className="text-right"><Button size="sm" disabled={busy || done || !item.tmName} onClick={() => approve(item.id)}>{busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Check data-icon="inline-start" />}{done ? "Onaylandı" : "Onayla"}</Button></TableCell></TableRow>
                    })}</TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
