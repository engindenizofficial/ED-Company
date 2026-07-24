"use client"

import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Calendar,
  Clock,
  LoaderCircle,
  RefreshCw,
  Shield,
  Trophy,
} from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useState } from "react"
import useSWR from "swr"
import { FormBadge } from "@/components/form-badge"
import { ThemeToggle } from "@/components/theme-toggle"
import { networkFetch } from "@/lib/fetcher"
import type { Fixture, LeaguePageData, StandingRow, TopScorer } from "@/lib/types"

const SWR_OPTIONS = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateIfStale: false,
} as const

async function fetcher(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error((await res.json()).error ?? "Hata")
  return res.json()
}

function kickoff(iso: string): string {
  return new Date(iso).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  })
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Istanbul",
  })
}

function statusLabel(short: string): string {
  const map: Record<string, string> = {
    FT: "MS", AET: "MS (uzatma)", PEN: "MS (pen.)", HT: "İY",
    "1H": "1. Yarı", "2H": "2. Yarı", NS: "Başlamadı",
    PST: "Ertelendi", CANC: "İptal",
  }
  return map[short] ?? short
}

export default function LeaguePage() {
  const params = useParams()
  const leagueId = params.id as string
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<"standings" | "scorers" | "fixtures">("standings")

  const { data, error, isLoading, mutate } = useSWR<LeaguePageData>(
    `/api/league/${leagueId}`,
    fetcher,
    SWR_OPTIONS,
  )

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const fresh = await networkFetch<LeaguePageData>(`/api/league/${leagueId}?refresh=1`)
      await mutate(fresh, { revalidate: false })
    } finally {
      setRefreshing(false)
    }
  }, [leagueId, mutate])

  const tabs = [
    { key: "standings" as const, label: "Puan Durumu", icon: <Shield className="h-3.5 w-3.5" /> },
    { key: "scorers" as const, label: "Gol Krallığı", icon: <Trophy className="h-3.5 w-3.5" /> },
    { key: "fixtures" as const, label: "Maçlar", icon: <Calendar className="h-3.5 w-3.5" /> },
  ]

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              Maçlar
            </Link>
            <span className="text-border">|</span>
            <div className="flex items-center gap-2">
              {data?.league.logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.league.logo} alt="" className="h-5 w-5 object-contain" />
              )}
              <h1 className="text-sm font-semibold text-foreground truncate max-w-[180px]">
                {data?.league.name ?? "Lig"}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-60"
              aria-label="Yenile"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin text-primary" : ""}`} />
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
            <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
            Lig verisi yükleniyor...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="font-semibold text-destructive">Lig bulunamadı</p>
            <p className="text-sm text-muted-foreground">{error.message}</p>
          </div>
        ) : data ? (
          <div className="flex flex-col gap-5">
            {/* League header */}
            <div className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4">
              {data.league.logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.league.logo} alt={data.league.name} className="h-14 w-14 object-contain" />
              )}
              <div>
                <h2 className="text-xl font-extrabold text-foreground">{data.league.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {data.league.country} · {data.league.season}/{data.league.season + 1} Sezonu
                </p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors ${
                    activeTab === tab.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "standings" && <StandingsTable standings={data.standings} />}
            {activeTab === "scorers" && <TopScorersTable scorers={data.topScorers} />}
            {activeTab === "fixtures" && <FixturesTable fixtures={data.fixtures} />}
          </div>
        ) : null}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

function StandingsTable({ standings }: { standings: StandingRow[] }) {
  if (standings.length === 0) {
    return <EmptyState message="Puan durumu verisi bulunamadı." />
  }

  const groups = standings.reduce<Record<string, StandingRow[]>>((acc, row) => {
    if (!acc[row.group]) acc[row.group] = []
    acc[row.group].push(row)
    return acc
  }, {})

  return (
    <div className="flex flex-col gap-5">
      {Object.entries(groups).map(([group, rows]) => (
        <section key={group} className="rounded-xl border border-border bg-card overflow-hidden">
          {Object.keys(groups).length > 1 && (
            <div className="border-b border-border px-5 py-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group}</p>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="px-4 py-3 text-left font-medium w-7">#</th>
                  <th className="px-2 py-3 text-left font-medium">Takım</th>
                  <th className="px-3 py-3 text-center font-medium">O</th>
                  <th className="px-3 py-3 text-center font-medium">G</th>
                  <th className="px-3 py-3 text-center font-medium">B</th>
                  <th className="px-3 py-3 text-center font-medium">M</th>
                  <th className="px-3 py-3 text-center font-medium">AG</th>
                  <th className="px-3 py-3 text-center font-medium">YG</th>
                  <th className="px-3 py-3 text-center font-medium font-bold">P</th>
                  <th className="px-4 py-3 text-left font-medium">Form</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.teamId} className="border-b border-border last:border-0 hover:bg-secondary/50">
                    <td className="px-4 py-2.5 text-muted-foreground">{row.rank}</td>
                    <td className="px-2 py-2.5 font-medium text-foreground max-w-[160px] truncate">{row.team}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">{row.played}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-primary">{row.win}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">{row.draw}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-destructive">{row.lose}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-foreground">{row.goalsFor}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-foreground">{row.goalsAgainst}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums font-bold text-foreground">{row.points}</td>
                    <td className="px-4 py-2.5">
                      {row.form ? <FormBadge form={row.form.slice(-5)} /> : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Top scorers
// ---------------------------------------------------------------------------

function TopScorersTable({ scorers }: { scorers: TopScorer[] }) {
  if (scorers.length === 0) {
    return <EmptyState message="Gol krallığı verisi bulunamadı." />
  }

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[440px] text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-4 py-3 text-left font-medium">#</th>
              <th className="px-2 py-3 text-left font-medium">Oyuncu</th>
              <th className="px-3 py-3 text-center font-medium">Takım</th>
              <th className="px-3 py-3 text-center font-medium">Maç</th>
              <th className="px-3 py-3 text-center font-medium font-bold">Gol</th>
              <th className="px-3 py-3 text-center font-medium">Asist</th>
              <th className="px-3 py-3 text-center font-medium">SK</th>
              <th className="px-3 py-3 text-center font-medium">KK</th>
              <th className="px-3 py-3 text-center font-medium">Puan</th>
            </tr>
          </thead>
          <tbody>
            {scorers.map((s, i) => (
              <tr key={s.player.id} className="border-b border-border last:border-0 hover:bg-secondary/50">
                <td className="px-4 py-2.5 font-bold text-muted-foreground">{i + 1}</td>
                <td className="px-2 py-2.5">
                  <Link href={`/player/${s.player.id}`} className="flex items-center gap-2 group">
                    {s.player.photo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.player.photo} alt="" className="h-6 w-6 rounded-full object-cover" />
                    )}
                    <span className="font-medium text-foreground group-hover:text-primary group-hover:underline">
                      {s.player.name}
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <div className="flex items-center justify-center gap-1">
                    {s.team.logo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.team.logo} alt="" className="h-4 w-4 object-contain" />
                    )}
                    <span className="text-muted-foreground truncate max-w-[80px]">{s.team.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">{s.appearances ?? "—"}</td>
                <td className="px-3 py-2.5 text-center tabular-nums font-bold text-primary text-sm">{s.goals ?? "—"}</td>
                <td className="px-3 py-2.5 text-center tabular-nums text-foreground">{s.assists ?? "—"}</td>
                <td className="px-3 py-2.5 text-center">
                  {s.yellowCards ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block h-3 w-2 rounded-sm bg-yellow-400" />
                      <span className="text-foreground">{s.yellowCards}</span>
                    </span>
                  ) : "—"}
                </td>
                <td className="px-3 py-2.5 text-center">
                  {s.redCards ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block h-3 w-2 rounded-sm bg-red-500" />
                      <span className="text-foreground">{s.redCards}</span>
                    </span>
                  ) : "—"}
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums font-semibold text-primary">
                  {s.rating ? Number.parseFloat(s.rating).toFixed(1) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function FixturesTable({ fixtures }: { fixtures: Fixture[] }) {
  if (fixtures.length === 0) {
    return <EmptyState message="Maç verisi bulunamadı." />
  }

  const finished = fixtures.filter((f) => ["FT", "AET", "PEN"].includes(f.statusShort))
  const upcoming = fixtures.filter((f) => f.statusShort === "NS" || f.statusShort === "TBD")

  return (
    <div className="flex flex-col gap-5">
      {upcoming.length > 0 && (
        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Yaklaşan Maçlar</p>
          </div>
          <ul className="flex flex-col divide-y divide-border">
            {upcoming.slice(0, 10).map((f) => (
              <FixtureRow key={f.id} fixture={f} />
            ))}
          </ul>
        </section>
      )}
      {finished.length > 0 && (
        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Son Maçlar</p>
          </div>
          <ul className="flex flex-col divide-y divide-border">
            {finished.slice(0, 15).map((f) => (
              <FixtureRow key={f.id} fixture={f} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function FixtureRow({ fixture: f }: { fixture: Fixture }) {
  const played = ["FT", "AET", "PEN", "HT", "1H", "2H", "ET", "P"].includes(f.statusShort)
  return (
    <li className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-[70px]">
        <Clock className="h-3 w-3" />
        <div className="flex flex-col">
          <span>{fmtDate(f.date)}</span>
          <span>{kickoff(f.date)}</span>
        </div>
      </div>
      <div className="flex flex-1 items-center gap-2">
        <div className="flex flex-1 flex-col items-end gap-0.5">
          <div className="flex items-center gap-1.5">
            {f.home.logo && <img src={f.home.logo} alt="" className="h-4 w-4 object-contain" />}
            <span className="truncate text-xs font-medium text-foreground max-w-[100px]">{f.home.name}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {f.away.logo && <img src={f.away.logo} alt="" className="h-4 w-4 object-contain" />}
            <span className="truncate text-xs font-medium text-foreground max-w-[100px]">{f.away.name}</span>
          </div>
        </div>
        {played ? (
          <div className="flex flex-col items-center text-sm font-bold tabular-nums text-foreground min-w-[30px]">
            <span>{f.goalsHome ?? "—"}</span>
            <span>{f.goalsAway ?? "—"}</span>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground min-w-[30px] text-center">vs</div>
        )}
      </div>
      <span className="text-[10px] rounded bg-secondary px-1.5 py-0.5 text-muted-foreground min-w-[52px] text-center">
        {statusLabel(f.statusShort)}
      </span>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center rounded-xl border border-border bg-card py-12 text-sm text-muted-foreground">
      {message}
    </div>
  )
}
