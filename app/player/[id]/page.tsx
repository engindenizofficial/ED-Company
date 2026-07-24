"use client"

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Award,
  BarChart3,
  LoaderCircle,
  RefreshCw,
  Repeat2,
  User,
} from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useState } from "react"
import useSWR from "swr"
import { ThemeToggle } from "@/components/theme-toggle"
import { networkFetch } from "@/lib/fetcher"
import type { PlayerPageData } from "@/lib/types"

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

export default function PlayerPage() {
  const params = useParams()
  const playerId = params.id as string
  const [refreshing, setRefreshing] = useState(false)

  const { data, error, isLoading, mutate } = useSWR<PlayerPageData>(
    `/api/player/${playerId}`,
    fetcher,
    SWR_OPTIONS,
  )

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const fresh = await networkFetch<PlayerPageData>(`/api/player/${playerId}?refresh=1`)
      await mutate(fresh, { revalidate: false })
    } finally {
      setRefreshing(false)
    }
  }, [playerId, mutate])

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
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
            <h1 className="text-sm font-semibold text-foreground truncate max-w-[200px]">
              {data?.profile.name ?? "Oyuncu Profili"}
            </h1>
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
            Oyuncu verisi yükleniyor...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="font-semibold text-destructive">Oyuncu bulunamadı</p>
            <p className="text-sm text-muted-foreground">{error.message}</p>
          </div>
        ) : data ? (
          <div className="flex flex-col gap-6">
            <PlayerProfileCard data={data} />
            <PlayerSeasonStatsSection stats={data.stats} />
            <TransfersSection transfers={data.transfers} />
            <TrophiesSection trophies={data.trophies} />
          </div>
        ) : null}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Profile card
// ---------------------------------------------------------------------------

function PlayerProfileCard({ data }: { data: PlayerPageData }) {
  const { profile } = data
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
        {/* Photo */}
        <div className="flex shrink-0 flex-col items-center gap-2">
          {profile.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.photo}
              alt={profile.name}
              className="h-24 w-24 rounded-full border border-border object-cover"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full border border-border bg-secondary">
              <User className="h-10 w-10 text-muted-foreground" />
            </div>
          )}
          {profile.injured && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
              Sakatlık
            </span>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-1 flex-col gap-4">
          <div>
            <h2 className="text-2xl font-extrabold text-foreground">{profile.name}</h2>
            {profile.team && (
              <div className="mt-1 flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {profile.team.logo && <img src={profile.team.logo} alt="" className="h-4 w-4 object-contain" />}
                <span className="text-sm text-muted-foreground">{profile.team.name}</span>
                {profile.league && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <Link
                      href={`/league/${profile.league.id}`}
                      className="text-sm text-muted-foreground hover:text-primary hover:underline"
                    >
                      {profile.league.name}
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4 text-sm">
            {profile.nationality && <InfoItem label="Uyruk" value={profile.nationality} />}
            {profile.age && <InfoItem label="Yaş" value={`${profile.age}`} />}
            {profile.height && <InfoItem label="Boy" value={profile.height} />}
            {profile.weight && <InfoItem label="Kilo" value={profile.weight} />}
            {profile.position && <InfoItem label="Mevki" value={translatePos(profile.position)} />}
            {profile.number && <InfoItem label="Forma No" value={`#${profile.number}`} />}
          </dl>
        </div>
      </div>
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

function translatePos(pos: string): string {
  const map: Record<string, string> = {
    Goalkeeper: "Kaleci",
    Defender: "Defans",
    Midfielder: "Orta Saha",
    Attacker: "Forvet",
  }
  return map[pos] ?? pos
}

// ---------------------------------------------------------------------------
// Season stats
// ---------------------------------------------------------------------------

function PlayerSeasonStatsSection({ stats }: { stats: import("@/lib/types").PlayerSeasonStats[] }) {
  if (stats.length === 0) return null
  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Sezon İstatistikleri</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-5 py-3 text-left font-medium">Lig</th>
              <th className="px-3 py-3 text-center font-medium">Sezon</th>
              <th className="px-3 py-3 text-center font-medium">Maç</th>
              <th className="px-3 py-3 text-center font-medium">Dk.</th>
              <th className="px-3 py-3 text-center font-medium">Gol</th>
              <th className="px-3 py-3 text-center font-medium">Asist</th>
              <th className="px-3 py-3 text-center font-medium">SK</th>
              <th className="px-3 py-3 text-center font-medium">KK</th>
              <th className="px-3 py-3 text-center font-medium">Puan</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s, i) => (
              <tr key={i} className="border-b border-border last:border-0 hover:bg-secondary/50">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    {s.league.logo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.league.logo} alt="" className="h-4 w-4 object-contain" />
                    )}
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{s.league.name}</span>
                      <span className="text-[10px] text-muted-foreground">{s.team.name}</span>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-center tabular-nums text-muted-foreground">{s.season}</td>
                <td className="px-3 py-3 text-center tabular-nums text-foreground">{s.appearances ?? "—"}</td>
                <td className="px-3 py-3 text-center tabular-nums text-foreground">{s.minutes ?? "—"}</td>
                <td className="px-3 py-3 text-center tabular-nums font-bold text-foreground">{s.goals ?? "—"}</td>
                <td className="px-3 py-3 text-center tabular-nums text-foreground">{s.assists ?? "—"}</td>
                <td className="px-3 py-3 text-center">
                  {s.yellowCards ? (
                    <span className="inline-block h-3 w-2 rounded-sm bg-yellow-400" title={`${s.yellowCards} sarı kart`} />
                  ) : "—"}
                  {s.yellowCards ? <span className="ml-1 text-foreground">{s.yellowCards}</span> : null}
                </td>
                <td className="px-3 py-3 text-center">
                  {s.redCards ? (
                    <span className="inline-block h-3 w-2 rounded-sm bg-red-500" title={`${s.redCards} kırmızı kart`} />
                  ) : "—"}
                  {s.redCards ? <span className="ml-1 text-foreground">{s.redCards}</span> : null}
                </td>
                <td className="px-3 py-3 text-center tabular-nums font-semibold text-primary">
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
// Transfers
// ---------------------------------------------------------------------------

function TransfersSection({ transfers }: { transfers: import("@/lib/types").Transfer[] }) {
  if (transfers.length === 0) return null
  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <Repeat2 className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Transfer Geçmişi</h3>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {transfers.map((t, i) => (
          <li key={i} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-1.5">
                {t.teamFrom.logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.teamFrom.logo} alt="" className="h-5 w-5 object-contain" />
                )}
                <span className="text-muted-foreground">{t.teamFrom.name}</span>
              </div>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="flex items-center gap-1.5">
                {t.teamTo.logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.teamTo.logo} alt="" className="h-5 w-5 object-contain" />
                )}
                <span className="font-medium text-foreground">{t.teamTo.name}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {t.date && <span>{t.date.slice(0, 10)}</span>}
              <span className="rounded-full border border-border bg-secondary px-2 py-0.5">
                {t.type === "Free" ? "Bedelsiz" : t.type === "Loan" ? "Kiralık" : t.type}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Trophies
// ---------------------------------------------------------------------------

function TrophiesSection({ trophies }: { trophies: import("@/lib/types").Trophy[] }) {
  if (trophies.length === 0) return null

  const won = trophies.filter((t) => t.place === "Winner")
  const runner = trophies.filter((t) => t.place !== "Winner")

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <Award className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Kupalar & Ödüller</h3>
        <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
          {won.length} şampiyonluk
        </span>
      </div>
      <div className="flex flex-col gap-4 p-5">
        {won.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Kazandı</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {won.map((t, i) => (
                <li key={i} className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
                  <Award className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate text-xs font-semibold text-foreground">{t.league}</span>
                    <span className="text-[10px] text-muted-foreground">{t.country} · {t.season}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {runner.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Finalist</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {runner.map((t, i) => (
                <li key={i} className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
                  <Award className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate text-xs font-medium text-foreground">{t.league}</span>
                    <span className="text-[10px] text-muted-foreground">{t.country} · {t.season}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
