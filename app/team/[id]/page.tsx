"use client"

import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Clock,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Shield,
  Users,
} from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useState } from "react"
import useSWR from "swr"
import { ThemeToggle } from "@/components/theme-toggle"
import { networkFetch } from "@/lib/fetcher"

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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Istanbul",
  })
}

function kickoff(iso: string): string {
  return new Date(iso).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
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

interface TeamData {
  team: {
    id: number
    name: string
    logo: string | null
    country: string | null
    founded: number | null
    national: boolean
    venue: {
      name: string | null
      city: string | null
      capacity: number | null
      image: string | null
    } | null
  }
  fixtures: Array<{
    id: number
    date: string
    statusShort: string
    league: { id: number; name: string; logo: string }
    home: { id: number; name: string; logo: string }
    away: { id: number; name: string; logo: string }
    goalsHome: number | null
    goalsAway: number | null
  }>
}

export default function TeamPage() {
  const params = useParams()
  const teamId = params.id as string
  const [refreshing, setRefreshing] = useState(false)

  const { data, error, isLoading, mutate } = useSWR<TeamData>(
    `/api/team/${teamId}`,
    fetcher,
    SWR_OPTIONS,
  )

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const fresh = await networkFetch<TeamData>(`/api/team/${teamId}?refresh=1`)
      await mutate(fresh, { revalidate: false })
    } finally {
      setRefreshing(false)
    }
  }, [teamId, mutate])

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-[49px] z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Maçlar
            </Link>
            <span className="text-border">|</span>
            <div className="flex items-center gap-2">
              {data?.team.logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.team.logo} alt="" className="h-5 w-5 object-contain" />
              )}
              <h1 className="max-w-[180px] truncate text-sm font-semibold text-foreground">
                {data?.team.name ?? "Takım"}
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
            Takım verisi yükleniyor...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="font-semibold text-destructive">Takım bulunamadı</p>
            <p className="text-sm text-muted-foreground">{error.message}</p>
          </div>
        ) : data ? (
          <div className="flex flex-col gap-5">
            {/* Team header */}
            <div className="flex items-center gap-5 rounded-xl border border-border bg-card px-5 py-5">
              {data.team.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.team.logo}
                  alt={data.team.name}
                  className="h-20 w-20 object-contain"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-border bg-secondary">
                  <Shield className="h-10 w-10 text-muted-foreground" />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-extrabold text-foreground">{data.team.name}</h2>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                  {data.team.country && (
                    <InfoItem label="Ülke" value={data.team.country} />
                  )}
                  {data.team.founded && (
                    <InfoItem label="Kuruluş" value={`${data.team.founded}`} />
                  )}
                  {data.team.national && (
                    <InfoItem label="Tür" value="Milli Takım" />
                  )}
                </dl>
              </div>
            </div>

            {/* Venue */}
            {data.team.venue && (
              <section className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center gap-2 border-b border-border px-5 py-4">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">Stadyum</h3>
                </div>
                <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:gap-8">
                  {data.team.venue.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={data.team.venue.image}
                      alt={data.team.venue.name ?? ""}
                      className="h-28 w-48 rounded-lg object-cover"
                    />
                  )}
                  <dl className="flex flex-col gap-1.5 text-sm">
                    {data.team.venue.name && (
                      <InfoItem label="Stadyum" value={data.team.venue.name} />
                    )}
                    {data.team.venue.city && (
                      <InfoItem label="Şehir" value={data.team.venue.city} />
                    )}
                    {data.team.venue.capacity && (
                      <InfoItem label="Kapasite" value={data.team.venue.capacity.toLocaleString("tr-TR")} />
                    )}
                  </dl>
                </div>
              </section>
            )}

            {/* Recent fixtures */}
            {data.fixtures.length > 0 && (
              <section className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center gap-2 border-b border-border px-5 py-4">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">Son Maçlar</h3>
                </div>
                <ul className="flex flex-col divide-y divide-border">
                  {data.fixtures.map((f) => {
                    const played = ["FT", "AET", "PEN", "HT", "1H", "2H", "ET", "P"].includes(f.statusShort)
                    const isThisTeamHome = f.home.id === Number(teamId)
                    return (
                      <li key={f.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                        <div className="flex min-w-[70px] items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <div className="flex flex-col">
                            <span>{fmtDate(f.date)}</span>
                            <span>{kickoff(f.date)}</span>
                          </div>
                        </div>
                        <div className="flex flex-1 items-center gap-2">
                          <div className="flex flex-1 flex-col items-end gap-0.5">
                            <div className="flex items-center gap-1.5">
                              {f.home.logo && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={f.home.logo} alt="" className="h-4 w-4 object-contain" />
                              )}
                              <Link
                                href={`/team/${f.home.id}`}
                                className={`max-w-[100px] truncate text-xs hover:text-primary hover:underline ${
                                  isThisTeamHome ? "font-bold text-foreground" : "font-medium text-foreground"
                                }`}
                              >
                                {f.home.name}
                              </Link>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {f.away.logo && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={f.away.logo} alt="" className="h-4 w-4 object-contain" />
                              )}
                              <Link
                                href={`/team/${f.away.id}`}
                                className={`max-w-[100px] truncate text-xs hover:text-primary hover:underline ${
                                  !isThisTeamHome ? "font-bold text-foreground" : "font-medium text-foreground"
                                }`}
                              >
                                {f.away.name}
                              </Link>
                            </div>
                          </div>
                          {played ? (
                            <div className="flex min-w-[30px] flex-col items-center text-sm font-bold tabular-nums text-foreground">
                              <span>{f.goalsHome ?? "—"}</span>
                              <span>{f.goalsAway ?? "—"}</span>
                            </div>
                          ) : (
                            <div className="min-w-[30px] text-center text-xs text-muted-foreground">vs</div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Link
                            href={`/league/${f.league.id}`}
                            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary"
                          >
                            {f.league.logo && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={f.league.logo} alt="" className="h-3 w-3 object-contain" />
                            )}
                            <span className="max-w-[80px] truncate">{f.league.name}</span>
                          </Link>
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {statusLabel(f.statusShort)}
                          </span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
          </div>
        ) : null}
      </main>
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-semibold text-foreground">{value}</dd>
    </div>
  )
}
