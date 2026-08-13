"use client"

import {
  Activity,
  AlertTriangle,
  Calendar,
  Inbox,
  LoaderCircle,
  RotateCw,
  Shield,
  ShieldOff,
  Square,
  Star,
  Users,
  X,
  Zap,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useLeaguePanel, type LeaguePanelState } from "@/contexts/league-context"
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock"
import { useCloseOnBackButton } from "@/hooks/use-close-on-back-button"
import { PlayerButton } from "@/components/player-panel"
import { TeamButton } from "@/components/team-panel"
import { PanelTabBar, type PanelTabItem } from "@/components/panel-tabs"
import { cn } from "@/lib/utils"
import { toTurkishCountry } from "@/lib/tr-aliases"
import { formatMarketValueEur } from "@/lib/market-value-format"
import type {
  Fixture,
  LeagueSeasonStats,
  LeagueTopAssist,
  LeagueTopCard,
  LeagueTopScorer,
  StandingRow,
} from "@/lib/types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function kickoff(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "Europe/Istanbul",
  })
}

function kickoffFull(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    weekday: "short",
    timeZone: "Europe/Istanbul",
  })
}

function matchTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  })
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function PlayerAvatar({ photo, name }: { photo: string | null; name: string }) {
  return photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo}
      alt=""
      className="h-6 w-6 shrink-0 rounded-full border border-border object-cover"
    />
  ) : (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary">
      <Users className="h-3 w-3 text-muted-foreground" />
    </div>
  )
}

function TeamLogo({ logo, name }: { logo: string; name: string }) {
  return logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logo} alt={name} title={name} className="mx-auto h-5 w-5 object-contain" />
  ) : (
    <span className="text-[10px] text-muted-foreground">{name}</span>
  )
}

// ---------------------------------------------------------------------------
// Sekme verisi çekimi — her sekme yalnızca kendisi açıldığında (open=true)
// kendi endpoint'ini çağırır. Panel açılırken hiçbir sekme verisi çekilmez.
// ---------------------------------------------------------------------------

type SectionStatus = "idle" | "loading" | "success" | "empty" | "error"

interface SectionState<T> {
  status: SectionStatus
  data: T | null
  error: string | null
}

function useLeagueSection<T>(leagueId: number, section: string, open: boolean) {
  const [state, setState] = useState<SectionState<T>>({ status: "idle", data: null, error: null })
  // "hasLoadedRef" isteğin tamamlanıp tamamlanmadığını takip eder. React 18/19
  // geliştirme modunda (Strict Mode) her effect mount->unmount->mount şeklinde
  // iki kez çalışır: ilk çalıştırma başlattığı isteği cleanup'ta iptal eder,
  // ikinci çalıştırma ise gerçek isteği başlatıp tamamlar. Bu yüzden "zaten
  // başladı mı" kontrolünü sonuçlanmamış bir isteğin iptal edilmesine izin
  // verecek şekilde yapıyoruz — aksi halde ikinci (gerçek) mount hiç istek
  // başlatmaz ve arayüz sonsuza kadar "yükleniyor" durumunda kalır.
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (!open || hasLoadedRef.current) return
    let cancelled = false
    setState({ status: "loading", data: null, error: null })
    fetch(`/api/league/section?leagueId=${leagueId}&section=${section}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.error ?? `Sunucu hatası: ${res.status}`)
        }
        return res.json() as Promise<{ data: T | null }>
      })
      .then((json) => {
        if (cancelled) return
        hasLoadedRef.current = true
        setState({ status: json.data === null ? "empty" : "success", data: json.data, error: null })
      })
      .catch((err) => {
        if (cancelled) return
        hasLoadedRef.current = true
        setState({ status: "error", data: null, error: err instanceof Error ? err.message : "Bir hata oluştu" })
      })
    return () => {
      cancelled = true
    }
  }, [open, leagueId, section])

  const retry = useCallback(() => {
    hasLoadedRef.current = false
    setState({ status: "idle", data: null, error: null })
  }, [])
  return { ...state, retry }
}

function SectionLoading({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
      <p className="text-xs font-medium text-muted-foreground">{label} yükleniyor...</p>
    </div>
  )
}

function SectionErrorState({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <AlertTriangle className="h-5 w-5 text-destructive/85" />
      <p className="text-xs font-bold text-destructive">Veri alınamadı</p>
      {error && <p className="text-[11px] text-muted-foreground">{error}</p>}
      <button
        type="button"
        onClick={onRetry}
        className="mt-1 flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary/70"
      >
        <RotateCw className="h-3 w-3" />
        Tekrar dene
      </button>
    </div>
  )
}

function SectionEmptyState({ leagueName, label }: { leagueName: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <Inbox className="h-5 w-5 text-muted-foreground/65" />
      <p className="text-xs text-muted-foreground">
        {leagueName} için {label} bulunamadı.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Season Overview
// ---------------------------------------------------------------------------

function SeasonOverviewSection({ leagueId, leagueName, active }: { leagueId: number; leagueName: string; active: boolean }) {
  const { status, data, error, retry } = useLeagueSection<LeagueSeasonStats>(leagueId, "seasonStats", active)
  return (
    <section className="flex flex-col gap-1">
      {active && (
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          {status === "loading" && <SectionLoading label="Sezon özeti" />}
          {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
          {status === "empty" && <SectionEmptyState leagueName={leagueName} label="sezon özeti verisi" />}
          {status === "success" && data && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Oynanan Maç", value: data.totalMatches.toLocaleString("tr-TR") },
                  { label: "Toplam Gol", value: data.totalGoals.toLocaleString("tr-TR") },
                  { label: "Maç Başı Gol", value: data.avgGoalsPerMatch.toFixed(2) },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="flex flex-col items-center gap-0.5 rounded-xl border border-border/60 bg-secondary/30 px-2 py-3"
                  >
                    <span className="text-xl font-black tabular-nums leading-none text-foreground">{value}</span>
                    <span className="mt-1 text-center text-[10px] leading-tight text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
              {formatMarketValueEur(data.totalMarketValueEur) && (
                <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-primary/90">
                    Toplam Kadro Değeri
                  </span>
                  <span className="text-base font-black tabular-nums text-primary">
                    {formatMarketValueEur(data.totalMarketValueEur)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

function StandingsSection({ leagueId, leagueName, active }: { leagueId: number; leagueName: string; active: boolean }) {
  const { status, data, error, retry } = useLeagueSection<StandingRow[]>(leagueId, "standings", active)

  const groups = (data ?? []).reduce<Record<string, StandingRow[]>>((acc, r) => {
    if (!acc[r.group]) acc[r.group] = []
    acc[r.group].push(r)
    return acc
  }, {})

  return (
    <section className="flex flex-col gap-1">
      {active && (
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          {status === "loading" && <SectionLoading label="Puan durumu" />}
          {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
          {status === "empty" && <SectionEmptyState leagueName={leagueName} label="puan durumu verisi" />}
          {status === "success" && data && (
            <div className="flex flex-col gap-4">
              {Object.entries(groups).map(([group, rows]) => (
                <div key={group}>
                  {Object.keys(groups).length > 1 && (
                    <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/85">
                      {group}
                    </p>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-left text-[10px] text-muted-foreground">
                          <th className="w-6 pb-2 pr-2 font-semibold">#</th>
                          <th className="pb-2 pr-2 font-semibold">Takım</th>
                          <th className="px-1.5 pb-2 text-center font-semibold" title="Oynanan">O</th>
                          <th className="px-1.5 pb-2 text-center font-semibold" title="Galibiyet">G</th>
                          <th className="px-1.5 pb-2 text-center font-semibold" title="Beraberlik">B</th>
                          <th className="px-1.5 pb-2 text-center font-semibold" title="Mağlubiyet">M</th>
                          <th className="px-1.5 pb-2 text-center font-semibold" title="Atılan Gol">A</th>
                          <th className="px-1.5 pb-2 text-center font-semibold" title="Yenilen Gol">Y</th>
                          <th className="px-1.5 pb-2 text-center font-semibold" title="Averaj">AV</th>
                          <th className="px-1.5 pb-2 text-center font-semibold" title="Puan">P</th>
                          <th className="pl-1.5 pb-2 text-right font-semibold" title="Kadro Değeri">Değer</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {rows.map((r) => (
                          <tr key={r.rank} className="transition-colors hover:bg-secondary/40">
                            <td className="py-2 pr-2 tabular-nums text-muted-foreground">{r.rank}</td>
                            <td className="py-2 pr-2">
                              <TeamButton
                                team={{ id: r.teamId, name: r.team, logo: r.teamLogo }}
                                className="flex items-center gap-1.5"
                              >
                                {r.teamLogo ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={r.teamLogo} alt="" className="h-4 w-4 shrink-0 object-contain" />
                                ) : null}
                                <span className="max-w-[90px] truncate font-semibold text-foreground hover:text-primary">
                                  {r.team}
                                </span>
                              </TeamButton>
                            </td>
                            <td className="px-1.5 py-2 text-center tabular-nums text-muted-foreground">{r.played}</td>
                            <td className="px-1.5 py-2 text-center tabular-nums font-semibold text-primary">{r.win}</td>
                            <td className="px-1.5 py-2 text-center tabular-nums text-muted-foreground">{r.draw}</td>
                            <td className="px-1.5 py-2 text-center tabular-nums text-destructive">{r.lose}</td>
                            <td className="px-1.5 py-2 text-center tabular-nums text-muted-foreground">{r.goalsFor}</td>
                            <td className="px-1.5 py-2 text-center tabular-nums text-muted-foreground">{r.goalsAgainst}</td>
                            <td className="px-1.5 py-2 text-center tabular-nums text-muted-foreground">
                              {r.goalsFor - r.goalsAgainst > 0 ? "+" : ""}
                              {r.goalsFor - r.goalsAgainst}
                            </td>
                            <td className="px-1.5 py-2 text-center tabular-nums font-black text-foreground">
                              {r.points}
                            </td>
                            <td className="pl-1.5 py-2 text-right tabular-nums font-bold text-muted-foreground">
                              {formatMarketValueEur(r.marketValueEur) ?? "–"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Top Scorers
// ---------------------------------------------------------------------------

function TopScorersSection({ leagueId, leagueName, active }: { leagueId: number; leagueName: string; active: boolean }) {
  const { status, data, error, retry } = useLeagueSection<LeagueTopScorer[]>(leagueId, "topScorers", active)
  return (
    <section className="flex flex-col gap-1">
      {active && (
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          {status === "loading" && <SectionLoading label="Gol krallığı" />}
          {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
          {status === "empty" && <SectionEmptyState leagueName={leagueName} label="gol krallığı verisi" />}
          {status === "success" && data && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] text-muted-foreground">
                    <th className="w-6 pb-2 pr-2 font-semibold">#</th>
                    <th className="pb-2 pr-3 font-semibold">Oyuncu</th>
                    <th className="px-1.5 pb-2 text-center font-semibold" title="Takım">T</th>
                    <th className="px-1.5 pb-2 text-center font-semibold" title="Gol">G</th>
                    <th className="px-1.5 pb-2 text-center font-semibold" title="Asist">A</th>
                    <th className="px-1.5 pb-2 text-center font-semibold" title="Maç">M</th>
                    <th className="pl-1.5 pb-2 text-center font-semibold" title="Ort.">Ort.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {data.map((s, i) => (
                    <tr key={s.player.id} className="transition-colors hover:bg-secondary/40">
                      <td className="py-2 pr-2 tabular-nums font-bold text-muted-foreground">{i + 1}</td>
                      <td className="py-2 pr-3">
                        <PlayerButton
                          player={{ id: s.player.id, name: s.player.name, photo: s.player.photo ?? null }}
                          className="flex items-center gap-2"
                        >
                          <PlayerAvatar photo={s.player.photo ?? null} name={s.player.name} />
                          <span className="font-semibold text-foreground hover:text-primary">{s.player.name}</span>
                        </PlayerButton>
                      </td>
                      <td className="px-1.5 py-2 text-center">
                        <TeamLogo logo={s.team.logo} name={s.team.name} />
                      </td>
                      <td className="px-1.5 py-2 text-center tabular-nums font-black text-primary">{s.goals}</td>
                      <td className="px-1.5 py-2 text-center tabular-nums text-muted-foreground">{s.assists}</td>
                      <td className="px-1.5 py-2 text-center tabular-nums text-muted-foreground">{s.appearances}</td>
                      <td className="pl-1.5 py-2 text-center tabular-nums text-muted-foreground">
                        {s.rating ? parseFloat(s.rating).toFixed(1) : "–"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Top Assists
// ---------------------------------------------------------------------------

function TopAssistsSection({ leagueId, leagueName, active }: { leagueId: number; leagueName: string; active: boolean }) {
  const { status, data, error, retry } = useLeagueSection<LeagueTopAssist[]>(leagueId, "topAssists", active)
  return (
    <section className="flex flex-col gap-1">
      {active && (
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          {status === "loading" && <SectionLoading label="Asist krallığı" />}
          {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
          {status === "empty" && <SectionEmptyState leagueName={leagueName} label="asist krallığı verisi" />}
          {status === "success" && data && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] text-muted-foreground">
                    <th className="w-6 pb-2 pr-2 font-semibold">#</th>
                    <th className="pb-2 pr-3 font-semibold">Oyuncu</th>
                    <th className="px-1.5 pb-2 text-center font-semibold" title="Takım">T</th>
                    <th className="px-1.5 pb-2 text-center font-semibold" title="Asist">A</th>
                    <th className="px-1.5 pb-2 text-center font-semibold" title="Gol">G</th>
                    <th className="px-1.5 pb-2 text-center font-semibold" title="Maç">M</th>
                    <th className="pl-1.5 pb-2 text-center font-semibold" title="Ort.">Ort.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {data.map((s, i) => (
                    <tr key={s.player.id} className="transition-colors hover:bg-secondary/40">
                      <td className="py-2 pr-2 tabular-nums font-bold text-muted-foreground">{i + 1}</td>
                      <td className="py-2 pr-3">
                        <PlayerButton
                          player={{ id: s.player.id, name: s.player.name, photo: s.player.photo ?? null }}
                          className="flex items-center gap-2"
                        >
                          <PlayerAvatar photo={s.player.photo ?? null} name={s.player.name} />
                          <span className="font-semibold text-foreground hover:text-primary">{s.player.name}</span>
                        </PlayerButton>
                      </td>
                      <td className="px-1.5 py-2 text-center">
                        <TeamLogo logo={s.team.logo} name={s.team.name} />
                      </td>
                      <td className="px-1.5 py-2 text-center tabular-nums font-black text-primary">{s.assists}</td>
                      <td className="px-1.5 py-2 text-center tabular-nums text-muted-foreground">{s.goals}</td>
                      <td className="px-1.5 py-2 text-center tabular-nums text-muted-foreground">{s.appearances}</td>
                      <td className="pl-1.5 py-2 text-center tabular-nums text-muted-foreground">
                        {s.rating ? parseFloat(s.rating).toFixed(1) : "–"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Top Yellow Cards
// ---------------------------------------------------------------------------

function TopYellowCardsSection({ leagueId, leagueName, active }: { leagueId: number; leagueName: string; active: boolean }) {
  const { status, data, error, retry } = useLeagueSection<LeagueTopCard[]>(leagueId, "topYellowCards", active)
  return (
    <section className="flex flex-col gap-1">
      {active && (
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          {status === "loading" && <SectionLoading label="Sarı kart krallığı" />}
          {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
          {status === "empty" && <SectionEmptyState leagueName={leagueName} label="sarı kart krallığı verisi" />}
          {status === "success" && data && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] text-muted-foreground">
                    <th className="w-6 pb-2 pr-2 font-semibold">#</th>
                    <th className="pb-2 pr-3 font-semibold">Oyuncu</th>
                    <th className="px-1.5 pb-2 text-center font-semibold" title="Takım">T</th>
                    <th className="px-1.5 pb-2 text-center font-semibold" title="Sarı Kart">SK</th>
                    <th className="px-1.5 pb-2 text-center font-semibold" title="Kırmızı Kart">KK</th>
                    <th className="pl-1.5 pb-2 text-center font-semibold" title="Maç">M</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {data.map((c, i) => (
                    <tr key={c.player.id} className="transition-colors hover:bg-secondary/40">
                      <td className="py-2 pr-2 tabular-nums font-bold text-muted-foreground">{i + 1}</td>
                      <td className="py-2 pr-3">
                        <PlayerButton
                          player={{ id: c.player.id, name: c.player.name, photo: c.player.photo ?? null }}
                          className="flex items-center gap-2"
                        >
                          <PlayerAvatar photo={c.player.photo ?? null} name={c.player.name} />
                          <span className="font-semibold text-foreground hover:text-primary">{c.player.name}</span>
                        </PlayerButton>
                      </td>
                      <td className="px-1.5 py-2 text-center">
                        <TeamLogo logo={c.team.logo} name={c.team.name} />
                      </td>
                      <td className="px-1.5 py-2 text-center tabular-nums font-black text-yellow-500">{c.yellow}</td>
                      <td className="px-1.5 py-2 text-center tabular-nums text-destructive">{c.red}</td>
                      <td className="pl-1.5 py-2 text-center tabular-nums text-muted-foreground">{c.appearances}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Top Red Cards
// ---------------------------------------------------------------------------

function TopRedCardsSection({ leagueId, leagueName, active }: { leagueId: number; leagueName: string; active: boolean }) {
  const { status, data, error, retry } = useLeagueSection<LeagueTopCard[]>(leagueId, "topRedCards", active)
  return (
    <section className="flex flex-col gap-1">
      {active && (
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          {status === "loading" && <SectionLoading label="Kırmızı kart krallığı" />}
          {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
          {status === "empty" && <SectionEmptyState leagueName={leagueName} label="kırmızı kart krallığı verisi" />}
          {status === "success" && data && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] text-muted-foreground">
                    <th className="w-6 pb-2 pr-2 font-semibold">#</th>
                    <th className="pb-2 pr-3 font-semibold">Oyuncu</th>
                    <th className="px-1.5 pb-2 text-center font-semibold" title="Takım">T</th>
                    <th className="px-1.5 pb-2 text-center font-semibold" title="Kırmızı Kart">KK</th>
                    <th className="px-1.5 pb-2 text-center font-semibold" title="Sarı Kart">SK</th>
                    <th className="pl-1.5 pb-2 text-center font-semibold" title="Maç">M</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {data.map((c, i) => (
                    <tr key={c.player.id} className="transition-colors hover:bg-secondary/40">
                      <td className="py-2 pr-2 tabular-nums font-bold text-muted-foreground">{i + 1}</td>
                      <td className="py-2 pr-3">
                        <PlayerButton
                          player={{ id: c.player.id, name: c.player.name, photo: c.player.photo ?? null }}
                          className="flex items-center gap-2"
                        >
                          <PlayerAvatar photo={c.player.photo ?? null} name={c.player.name} />
                          <span className="font-semibold text-foreground hover:text-primary">{c.player.name}</span>
                        </PlayerButton>
                      </td>
                      <td className="px-1.5 py-2 text-center">
                        <TeamLogo logo={c.team.logo} name={c.team.name} />
                      </td>
                      <td className="px-1.5 py-2 text-center tabular-nums font-black text-destructive">{c.red}</td>
                      <td className="px-1.5 py-2 text-center tabular-nums text-yellow-500">{c.yellow}</td>
                      <td className="pl-1.5 py-2 text-center tabular-nums text-muted-foreground">{c.appearances}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Recent Fixtures
// ---------------------------------------------------------------------------

function RecentFixturesSection({ leagueId, leagueName, active }: { leagueId: number; leagueName: string; active: boolean }) {
  const { status, data, error, retry } = useLeagueSection<Fixture[]>(leagueId, "recentFixtures", active)
  return (
    <section className="flex flex-col gap-1">
      {active && (
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          {status === "loading" && <SectionLoading label="Son maçlar" />}
          {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
          {status === "empty" && <SectionEmptyState leagueName={leagueName} label="son maç verisi" />}
          {status === "success" && data && (
            <div className="flex flex-col gap-1.5">
              {data.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-secondary/30 px-3 py-2.5"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-[10px] text-muted-foreground">
                      {f.league.round} · {kickoff(f.date)}
                    </span>
                    <div className="flex items-center gap-1.5 truncate">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.home.logo} alt="" className="h-4 w-4 shrink-0 object-contain" />
                      <span className="truncate text-xs font-semibold text-foreground">{f.home.name}</span>
                      <span className="shrink-0 font-black tabular-nums text-foreground">
                        {f.goalsHome} – {f.goalsAway}
                      </span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.away.logo} alt="" className="h-4 w-4 shrink-0 object-contain" />
                      <span className="truncate text-xs font-semibold text-foreground">{f.away.name}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Upcoming Fixtures
// ---------------------------------------------------------------------------

function UpcomingFixturesSection({ leagueId, leagueName, active }: { leagueId: number; leagueName: string; active: boolean }) {
  const { status, data, error, retry } = useLeagueSection<Fixture[]>(leagueId, "upcomingFixtures", active)
  return (
    <section className="flex flex-col gap-1">
      {active && (
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          {status === "loading" && <SectionLoading label="Yaklaşan maçlar" />}
          {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
          {status === "empty" && <SectionEmptyState leagueName={leagueName} label="yaklaşan maç verisi" />}
          {status === "success" && data && (
            <div className="flex flex-col gap-1.5">
              {data.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-secondary/30 px-3 py-2.5"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-[10px] text-muted-foreground">{f.league.round}</span>
                    <div className="flex items-center gap-1.5 truncate">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.home.logo} alt="" className="h-4 w-4 shrink-0 object-contain" />
                      <span className="truncate text-xs font-semibold text-foreground">{f.home.name}</span>
                      <span className="shrink-0 text-muted-foreground">–</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.away.logo} alt="" className="h-4 w-4 shrink-0 object-contain" />
                      <span className="truncate text-xs font-semibold text-foreground">{f.away.name}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="font-black tabular-nums text-foreground">{matchTime(f.date)}</span>
                    <span className="text-[10px] text-muted-foreground">{kickoffFull(f.date)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export function LeaguePanel() {
  const { panel, closeLeague } = useLeaguePanel()
  useBodyScrollLock(!!panel)
  useCloseOnBackButton(!!panel, closeLeague)
  if (!panel) return null
  return <LeaguePanelInner key={panel.league.id} closeLeague={closeLeague} panel={panel} />
}

function LeaguePanelInner({
  panel,
  closeLeague,
}: {
  panel: LeaguePanelState
  closeLeague: () => void
}) {
  const { league, basic, loading, error } = panel

  const tabs: PanelTabItem[] = [
    { key: "seasonStats", label: "Sezon Özeti", icon: <Activity className="h-3.5 w-3.5" /> },
    { key: "standings", label: "Puan Durumu", icon: <Shield className="h-3.5 w-3.5" /> },
    { key: "topScorers", label: "Gol Krallığı", icon: <Star className="h-3.5 w-3.5" /> },
    { key: "topAssists", label: "Asist Krallığı", icon: <Zap className="h-3.5 w-3.5" /> },
    { key: "topYellowCards", label: "Sarı Kart Krallığı", icon: <Square className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" /> },
    { key: "topRedCards", label: "Kırmızı Kart Krallığı", icon: <Square className="h-3.5 w-3.5 fill-destructive text-destructive" /> },
    { key: "recentFixtures", label: "Son Maçlar", icon: <Calendar className="h-3.5 w-3.5" /> },
    { key: "upcomingFixtures", label: "Yaklaşan Maçlar", icon: <Calendar className="h-3.5 w-3.5" /> },
  ]
  const [activeTab, setActiveTab] = useState(tabs[0].key)

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label={`${league.name} lig bilgileri`}
    >
      <div className="flex h-full w-full flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-4 shrink-0">
          {league.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={league.logo}
              alt={league.name}
              className="h-12 w-12 shrink-0 object-contain drop-shadow-sm"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-secondary border border-border">
              <Shield className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-black leading-tight text-foreground">{league.name}</h2>
            <div className="mt-0.5 flex items-center gap-1.5">
              {league.flagUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={league.flagUrl} alt="" className="h-3 w-4 rounded-[2px] object-cover" />
              )}
              <p className="text-xs text-muted-foreground">{toTurkishCountry(league.country)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeLeague}
            aria-label="Kapat"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Season badge */}
        {basic && (
          <div className="flex items-center gap-2 border-b border-border bg-secondary/50 px-4 py-2 shrink-0">
            <span className="text-xs text-muted-foreground">Sezon</span>
            <span className="rounded-lg bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
              {basic.season}/{String(basic.season + 1).slice(2)}
            </span>
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Lig verileri yükleniyor...</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 py-12 text-center">
              <ShieldOff className="h-8 w-8 text-destructive/75" />
              <p className="text-sm font-semibold text-destructive">Veri alınamadı</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          )}

          {!loading && !error && basic && (
            <div className="flex flex-col gap-2">
              {/* Yan yana sekmeler — her sekme sadece aktifken kendi verisini çeker */}
              <PanelTabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />
              <SeasonOverviewSection leagueId={league.id} leagueName={league.name} active={activeTab === "seasonStats"} />
              <StandingsSection leagueId={league.id} leagueName={league.name} active={activeTab === "standings"} />
              <TopScorersSection leagueId={league.id} leagueName={league.name} active={activeTab === "topScorers"} />
              <TopAssistsSection leagueId={league.id} leagueName={league.name} active={activeTab === "topAssists"} />
              <TopYellowCardsSection leagueId={league.id} leagueName={league.name} active={activeTab === "topYellowCards"} />
              <TopRedCardsSection leagueId={league.id} leagueName={league.name} active={activeTab === "topRedCards"} />
              <RecentFixturesSection leagueId={league.id} leagueName={league.name} active={activeTab === "recentFixtures"} />
              <UpcomingFixturesSection leagueId={league.id} leagueName={league.name} active={activeTab === "upcomingFixtures"} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reusable clickable league name / button
// ---------------------------------------------------------------------------

export function LeagueButton({
  league,
  children,
  className,
}: {
  league: { id: number; name: string; logo: string; country: string; flagUrl: string | null }
  children: React.ReactNode
  className?: string
}) {
  const { openLeague } = useLeaguePanel()
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        openLeague(league)
      }}
      className={cn(
        "cursor-pointer rounded transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {children}
    </button>
  )
}
