"use client"

import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Calendar,
  Inbox,
  LoaderCircle,
  MapPin,
  RotateCw,
  Shield,
  ShieldOff,
  Star,
  UserCheck,
  Users,
  X,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTeamPanel } from "@/contexts/team-context"
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock"
import { useCloseOnBackButton } from "@/hooks/use-close-on-back-button"
import { PlayerButton } from "@/components/player-panel"
import { PanelTabBar, type PanelTabItem } from "@/components/panel-tabs"
import { cn } from "@/lib/utils"
import { formatMarketValueEur } from "@/lib/market-value-format"
import { useLanguage } from "@/contexts/language-context"
import type {
  Fixture,
  SquadPlayer,
  StandingRow,
  TeamBasicInfo,
  TeamCoach,
  TeamFormData,
  TeamStatsSummary,
  TeamTopScorer,
  TeamTransfer,
} from "@/lib/types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function kickoff(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === "en" ? "en-US" : "tr-TR", {
    day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Europe/Istanbul",
  })
}

function FormDot({ result }: { result: "W" | "D" | "L" }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black",
        result === "W" && "bg-primary/15 text-primary",
        result === "D" && "bg-secondary text-muted-foreground border border-border",
        result === "L" && "bg-destructive/15 text-destructive",
      )}
    >
      {result}
    </span>
  )
}

// Stat bar for season stats
function StatBar({ label, value, max, accent = false }: {
  label: string; value: number; max: number; accent?: boolean
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-bold tabular-nums text-foreground">{value}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn("h-full rounded-full transition-all", accent ? "bg-accent" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
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

function useTeamSection<T>(teamId: number, section: string, open: boolean) {
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
    fetch(`/api/team/section?teamId=${teamId}&section=${section}`, { cache: "no-store" })
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
  }, [open, teamId, section])

  const retry = useCallback(() => {
    hasLoadedRef.current = false
    setState({ status: "idle", data: null, error: null })
  }, [])
  return { ...state, retry }
}

function SectionLoading({ label }: { label: string }) {
  const { t } = useLanguage()
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
      <p className="text-xs font-medium text-muted-foreground">{label} {t("league.loadingSuffix")}</p>
    </div>
  )
}

function SectionErrorState({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  const { t } = useLanguage()
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <AlertTriangle className="h-5 w-5 text-destructive/85" />
      <p className="text-xs font-bold text-destructive">{t("league.dataFetchFailed")}</p>
      {error && <p className="text-[11px] text-muted-foreground">{error}</p>}
      <button
        type="button"
        onClick={onRetry}
        className="mt-1 flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary/70"
      >
        <RotateCw className="h-3 w-3" />
        {t("league.retry")}
      </button>
    </div>
  )
}

function SectionEmptyState({ teamName, label }: { teamName: string; label: string }) {
  const { t } = useLanguage()
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <Inbox className="h-5 w-5 text-muted-foreground/65" />
      <p className="text-xs text-muted-foreground">
        {t("league.noDataFor", { league: teamName, label })}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Season Stats
// ---------------------------------------------------------------------------

function SeasonStatsSection({ teamId, teamName, active }: { teamId: number; teamName: string; active: boolean }) {
  const { t } = useLanguage()
  const { status, data, error, retry } = useTeamSection<TeamStatsSummary>(teamId, "stats", active)
  return (
    <section className="flex flex-col gap-1">
      {active && (
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          {status === "loading" && <SectionLoading label={t("team.seasonStats")} />}
          {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
          {status === "empty" && <SectionEmptyState teamName={teamName} label={t("team.seasonStatsData")} />}
          {status === "success" && data && (
            <div className="flex flex-col gap-4">
              {/* W/D/L big numbers */}
              <div className="grid grid-cols-3 divide-x divide-border rounded-xl border border-border overflow-hidden">
                {[
                  { label: t("team.win"), value: data.wins, cls: "text-primary" },
                  { label: t("team.draw"), value: data.draws, cls: "text-muted-foreground" },
                  { label: t("team.lose"), value: data.losses, cls: "text-destructive" },
                ].map(({ label, value, cls }) => (
                  <div key={label} className="flex flex-col items-center gap-0.5 py-3 bg-secondary/30">
                    <span className={cn("text-3xl font-black tabular-nums leading-none", cls)}>{value}</span>
                    <span className="text-[10px] tracking-wide uppercase text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>

              {/* Bars */}
              <div className="flex flex-col gap-3">
                <StatBar label={t("team.playedMatches")} value={data.played} max={38} />
                <StatBar label={t("team.goalsForAvg")} value={parseFloat(data.goalsForAvg.toFixed(2))} max={4} accent />
                <StatBar label={t("team.goalsAgainstAvg")} value={parseFloat(data.goalsAgainstAvg.toFixed(2))} max={4} />
                <StatBar label={t("team.cleanSheets")} value={data.cleanSheets} max={data.played} />
                <StatBar label={t("team.failedToScore")} value={data.failedToScore} max={data.played} accent />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

function FormSection({ teamId, teamName, active }: { teamId: number; teamName: string; active: boolean }) {
  const { t, locale } = useLanguage()
  const { status, data, error, retry } = useTeamSection<TeamFormData>(teamId, "form", active)
  return (
    <section className="flex flex-col gap-1">
      {active && (
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          {status === "loading" && <SectionLoading label={t("team.recentForm")} />}
          {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
          {status === "empty" && <SectionEmptyState teamName={teamName} label={t("team.formData")} />}
          {status === "success" && data && (() => {
            const recent = data.recent
            const formCharsFromString = recent.length === 0 && data.formString ? data.formString.split("") : []
            return (
              <div className="flex flex-col gap-3">
                {/* Form dots row — maç detayı yoksa sadece formString'den göster */}
                <div className="flex items-center gap-1.5">
                  {recent.length > 0
                    ? recent.map((g, i) => <FormDot key={i} result={g.result} />)
                    : formCharsFromString.map((ch, i) => (
                        <FormDot key={i} result={ch as "W" | "D" | "L"} />
                      ))
                  }
                </div>
                {/* Match rows */}
                <div className="flex flex-col gap-1">
                  {recent.map((g, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/30 px-3 py-2 text-xs"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <FormDot result={g.result} />
                        <span className="truncate font-semibold text-foreground">{g.opponent}</span>
                        <span className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {g.home ? t("team.home") : t("team.away")}
                        </span>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5">
                        <span className="font-black tabular-nums text-foreground">{g.scored}–{g.conceded}</span>
                        <span className="text-[10px] text-muted-foreground">{kickoff(g.date, locale)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Recent Fixtures
// ---------------------------------------------------------------------------

function RecentFixturesSection({ teamId, teamName, active }: { teamId: number; teamName: string; active: boolean }) {
  const { t, locale } = useLanguage()
  const { status, data, error, retry } = useTeamSection<Fixture[]>(teamId, "fixtures", active)
  return (
    <section className="flex flex-col gap-1">
      {active && (
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          {status === "loading" && <SectionLoading label={t("team.recentFixtures")} />}
          {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
          {status === "empty" && <SectionEmptyState teamName={teamName} label={t("team.recentFixturesData")} />}
          {status === "success" && data && (
            <div className="flex flex-col gap-1.5">
              {data.map(f => (
                <div
                  key={f.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-secondary/30 px-3 py-2.5"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.league.logo} alt="" className="h-3.5 w-3.5 object-contain opacity-80" width={14} height={14} loading="lazy" decoding="async" />
                      <span className="text-[10px] text-muted-foreground truncate">{f.league.name}</span>
                      {f.league.round && (
                        <span className="shrink-0 text-[10px] text-muted-foreground/65">· {f.league.round}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.home.logo} alt="" className="h-4 w-4 object-contain" width={16} height={16} loading="lazy" decoding="async" />
                      <span className="text-xs font-semibold text-foreground truncate">{f.home.name}</span>
                      <span className="shrink-0 text-muted-foreground/65">–</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.away.logo} alt="" className="h-4 w-4 object-contain" width={16} height={16} loading="lazy" decoding="async" />
                      <span className="text-xs font-semibold text-foreground truncate">{f.away.name}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="text-sm font-black tabular-nums text-foreground">{f.goalsHome} – {f.goalsAway}</span>
                    <span className="text-[10px] text-muted-foreground">{kickoff(f.date, locale)}</span>
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
// Coach
// ---------------------------------------------------------------------------

function CoachSection({ teamId, teamName, active }: { teamId: number; teamName: string; active: boolean }) {
  const { t } = useLanguage()
  const { status, data, error, retry } = useTeamSection<TeamCoach>(teamId, "coach", active)
  return (
    <section className="flex flex-col gap-1">
      {active && (
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          {status === "loading" && <SectionLoading label={t("team.coach")} />}
          {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
          {status === "empty" && <SectionEmptyState teamName={teamName} label={t("team.coachData")} />}
          {status === "success" && data && (
            <div className="flex flex-col gap-4">
              {/* Coach identity */}
              <div className="flex items-center gap-3">
                {data.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={data.photo}
                    alt={data.name}
                    className="h-16 w-16 rounded-2xl object-cover border border-border shrink-0"
              width={64} height={64} loading="lazy" decoding="async" />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-secondary border border-border">
                    <UserCheck className="h-7 w-7 text-muted-foreground" />
                  </div>
                )}
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-base font-black text-foreground leading-tight">{data.name}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {data.nationality && (
                      <span className="rounded-lg bg-secondary border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {data.nationality}
                      </span>
                    )}
                    {data.age != null && (
                      <span className="rounded-lg bg-secondary border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {data.age} {t("team.age")}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Career */}
              {data.career.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/85 px-1">{t("team.career")}</p>
                  {data.career.map((c, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/30 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        {c.team.logo && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.team.logo} alt="" className="h-5 w-5 object-contain" width={20} height={20} loading="lazy" decoding="async" />
                        )}
                        <span className="text-xs font-semibold text-foreground">{c.team.name}</span>
                      </div>
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {c.start ? c.start.slice(0, 4) : "?"} – {c.end ? c.end.slice(0, 4) : t("team.present")}
                      </span>
                    </div>
                  ))}
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
// Squad
// ---------------------------------------------------------------------------

const POS_ORDER: Record<string, number> = { Goalkeeper: 0, Defender: 1, Midfielder: 2, Attacker: 3 }

function SquadSection({ teamId, teamName, active }: { teamId: number; teamName: string; active: boolean }) {
  const { t } = useLanguage()
  const POS_LABEL: Record<string, string> = {
    Goalkeeper: t("team.goalkeeper"), Defender: t("team.defender"), Midfielder: t("team.midfielder"), Attacker: t("team.attacker"),
  }
  const { status, data, error, retry } = useTeamSection<SquadPlayer[]>(teamId, "squad", active)

  const grouped = (data ?? []).reduce<Record<string, SquadPlayer[]>>((acc, p) => {
    const pos = p.pos ?? t("team.other")
    if (!acc[pos]) acc[pos] = []
    acc[pos].push(p)
    return acc
  }, {})
  const positions = Object.keys(grouped).sort((a, b) => (POS_ORDER[a] ?? 99) - (POS_ORDER[b] ?? 99))

  return (
    <section className="flex flex-col gap-1">
      {active && (
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          {status === "loading" && <SectionLoading label={t("team.squad")} />}
          {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
          {status === "empty" && <SectionEmptyState teamName={teamName} label={t("team.squadData")} />}
          {status === "success" && data && (
            <div className="flex flex-col gap-4">
              {positions.map(pos => (
                <div key={pos}>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/85 px-1">
                    {POS_LABEL[pos] ?? pos}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {grouped[pos].map(p => (
                      <PlayerButton
                        key={p.id}
                        player={{ id: p.id, name: p.name, photo: p.photo ?? null }}
                        className="group flex w-full items-center gap-2 rounded-xl border border-border/60 bg-secondary/30 px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-secondary"
                      >
                        {/* Photo or number */}
                        {p.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.photo} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover border border-border" width={32} height={32} loading="lazy" decoding="async" />
                        ) : (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary border border-border">
                            <span className="text-[10px] font-black text-muted-foreground">
                              {p.number != null ? p.number : p.name.charAt(0)}
                            </span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                            {p.name}
                          </p>
                          <div className="flex items-center gap-1.5">
                            {p.number != null && (
                              <span className="text-[10px] font-bold tabular-nums text-muted-foreground">#{p.number}</span>
                            )}
                            {p.age != null && (
                              <span className="text-[10px] text-muted-foreground/75">{p.age} {t("team.age")}</span>
                            )}
                            {formatMarketValueEur(p.marketValueEur) && (
                              <span className="text-[10px] font-bold tabular-nums text-primary">
                                {formatMarketValueEur(p.marketValueEur)}
                              </span>
                            )}
                          </div>
                        </div>
                      </PlayerButton>
                    ))}
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
// Top Scorers — shows ALL fetched columns: goals, assists, appearances, rating, yellow/red cards, pos
// ---------------------------------------------------------------------------

function TopScorersSection({ teamId, teamName, active }: { teamId: number; teamName: string; active: boolean }) {
  const { t } = useLanguage()
  const { status, data, error, retry } = useTeamSection<TeamTopScorer[]>(teamId, "topScorers", active)
  return (
    <section className="flex flex-col gap-1">
      {active && (
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          {status === "loading" && <SectionLoading label={t("team.leagueTopScorers")} />}
          {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
          {status === "empty" && <SectionEmptyState teamName={teamName} label={t("team.leagueTopScorersData")} />}
          {status === "success" && data && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] text-muted-foreground">
                    <th className="pb-2 pr-2 font-semibold w-6">#</th>
                    <th className="pb-2 pr-3 font-semibold">{t("team.player")}</th>
                    <th className="pb-2 px-1.5 font-semibold text-center" title="Gol">G</th>
                    <th className="pb-2 px-1.5 font-semibold text-center" title="Asist">A</th>
                    <th className="pb-2 px-1.5 font-semibold text-center" title="Maç">M</th>
                    <th className="pb-2 px-1.5 font-semibold text-center" title={t("team.points")}>{t("team.points")}</th>
                    <th className="pb-2 px-1.5 font-semibold text-center" title={t("team.yellowCard")}>🟨</th>
                    <th className="pb-2 pl-1.5 font-semibold text-center" title={t("team.redCard")}>🟥</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {data.map((s, i) => (
                    <tr key={s.player.id} className="hover:bg-secondary/40 transition-colors group">
                      <td className="py-2 pr-2 tabular-nums font-bold text-muted-foreground">{i + 1}</td>
                      <td className="py-2 pr-3">
                        <PlayerButton
                          player={{ id: s.player.id, name: s.player.name, photo: s.player.photo ?? null }}
                          className="flex items-center gap-2"
                        >
                          {s.player.photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={s.player.photo} alt="" className="h-6 w-6 rounded-full object-cover border border-border shrink-0" width={24} height={24} loading="lazy" decoding="async" />
                          ) : (
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary">
                              <Users className="h-3 w-3 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="font-semibold text-foreground group-hover:text-primary transition-colors truncate leading-none">
                              {s.player.name}
                            </span>
                            {s.pos && (
                              <span className="text-[9px] uppercase text-muted-foreground/75 leading-none">{s.pos}</span>
                            )}
                          </div>
                        </PlayerButton>
                      </td>
                      <td className="py-2 px-1.5 text-center tabular-nums font-black text-primary">{s.goals}</td>
                      <td className="py-2 px-1.5 text-center tabular-nums text-foreground">{s.assists}</td>
                      <td className="py-2 px-1.5 text-center tabular-nums text-muted-foreground">{s.appearances}</td>
                      <td className="py-2 px-1.5 text-center tabular-nums text-muted-foreground">
                        {s.rating ? parseFloat(s.rating).toFixed(1) : "–"}
                      </td>
                      <td className="py-2 px-1.5 text-center tabular-nums text-muted-foreground">{s.yellowCards}</td>
                      <td className="py-2 pl-1.5 text-center tabular-nums text-muted-foreground">{s.redCards}</td>
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
// Standings — includes goalsFor, goalsAgainst and form dots
// ---------------------------------------------------------------------------

function StandingsSection({ teamId, teamName, active }: { teamId: number; teamName: string; active: boolean }) {
  const { t } = useLanguage()
  const { status, data, error, retry } = useTeamSection<StandingRow[]>(teamId, "standings", active)

  const groups = (data ?? []).reduce<Record<string, StandingRow[]>>((acc, r) => {
    if (!acc[r.group]) acc[r.group] = []
    acc[r.group].push(r)
    return acc
  }, {})

  return (
    <section className="flex flex-col gap-1">
      {active && (
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          {status === "loading" && <SectionLoading label={t("team.standings")} />}
          {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
          {status === "empty" && <SectionEmptyState teamName={teamName} label={t("team.standingsData")} />}
          {status === "success" && data && (
            <div className="flex flex-col gap-4">
              {Object.entries(groups).map(([group, rows]) => (
                <div key={group}>
                  {Object.keys(groups).length > 1 && (
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/85 px-1">{group}</p>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-left text-[10px] text-muted-foreground">
                          <th className="pb-1.5 pr-2 font-semibold w-6">#</th>
                          <th className="pb-1.5 pr-3 font-semibold">{t("team.team")}</th>
                          <th className="pb-1.5 px-1.5 font-semibold text-center" title={t("team.played")}>O</th>
                          <th className="pb-1.5 px-1.5 font-semibold text-center" title={t("team.win")}>G</th>
                          <th className="pb-1.5 px-1.5 font-semibold text-center" title={t("team.draw")}>B</th>
                          <th className="pb-1.5 px-1.5 font-semibold text-center" title={t("team.lose")}>M</th>
                          <th className="pb-1.5 px-1.5 font-semibold text-center" title={t("team.goalsFor")}>A</th>
                          <th className="pb-1.5 px-1.5 font-semibold text-center" title={t("team.goalsAgainst")}>Y</th>
                          <th className="pb-1.5 px-1.5 font-semibold text-center" title={t("team.points")}>P</th>
                          <th className="pb-1.5 pl-1.5 font-semibold text-center" title={t("team.last5Matches")}>{t("team.form")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {rows.map(r => {
                          const isTeam = r.teamId === teamId
                          const formChars = (r.form ?? "").slice(-5).split("")
                          return (
                            <tr
                              key={r.rank}
                              className={cn(
                                "transition-colors",
                                isTeam
                                  ? "bg-primary/8 font-semibold"
                                  : "hover:bg-secondary/40",
                              )}
                            >
                              <td className="py-1.5 pr-2 tabular-nums text-muted-foreground font-semibold">{r.rank}</td>
                              <td className={cn("py-1.5 pr-3 truncate max-w-[100px]", isTeam && "text-primary font-bold")}>
                                {r.team}
                              </td>
                              <td className="py-1.5 px-1.5 text-center tabular-nums text-muted-foreground">{r.played}</td>
                              <td className="py-1.5 px-1.5 text-center tabular-nums text-primary font-semibold">{r.win}</td>
                              <td className="py-1.5 px-1.5 text-center tabular-nums text-muted-foreground">{r.draw}</td>
                              <td className="py-1.5 px-1.5 text-center tabular-nums text-destructive">{r.lose}</td>
                              <td className="py-1.5 px-1.5 text-center tabular-nums text-foreground">{r.goalsFor}</td>
                              <td className="py-1.5 px-1.5 text-center tabular-nums text-foreground">{r.goalsAgainst}</td>
                              <td className="py-1.5 px-1.5 text-center tabular-nums font-black text-foreground">{r.points}</td>
                              <td className="py-1.5 pl-1.5">
                                <div className="flex items-center gap-0.5 justify-center">
                                  {formChars.map((ch, fi) => (
                                    <span
                                      key={fi}
                                      className={cn(
                                        "inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm text-[8px] font-black leading-none",
                                        ch === "W" && "bg-primary/20 text-primary",
                                        ch === "D" && "bg-secondary text-muted-foreground",
                                        ch === "L" && "bg-destructive/20 text-destructive",
                                      )}
                                    >
                                      {ch}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
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
// Transfers — incoming/outgoing with player photo, team logos, type badge, date
// ---------------------------------------------------------------------------

function TransfersSection({ teamId, teamName, active }: { teamId: number; teamName: string; active: boolean }) {
  const { t } = useLanguage()
  const { status, data, error, retry } = useTeamSection<TeamTransfer[]>(teamId, "transfers", active)

  const incoming = (data ?? []).filter(t => t.teamTo.id === teamId)
  const outgoing = (data ?? []).filter(t => t.teamFrom.id === teamId)

  return (
    <section className="flex flex-col gap-1">
      {active && (
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          {status === "loading" && <SectionLoading label={t("team.transfers")} />}
          {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
          {status === "empty" && <SectionEmptyState teamName={teamName} label={t("team.transfersData")} />}
          {status === "success" && data && (
            <div className="flex flex-col gap-4">
              {incoming.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/85">
                    <ArrowDownLeft className="h-3 w-3 text-primary" />
                    {t("team.incoming")} ({incoming.length})
                  </p>
                  {incoming.map((tr) => (
                    <TransferRow key={`in-${tr.player.id}-${tr.date}-${tr.teamFrom.id}`} transfer={tr} direction="in" />
                  ))}
                </div>
              )}
              {outgoing.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/85">
                    <ArrowUpRight className="h-3 w-3 text-destructive" />
                    {t("team.outgoing")} ({outgoing.length})
                  </p>
                  {outgoing.map((tr) => (
                    <TransferRow key={`out-${tr.player.id}-${tr.date}-${tr.teamTo.id}`} transfer={tr} direction="out" />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function TransferRow({ transfer: t, direction }: { transfer: TeamTransfer; direction: "in" | "out" }) {
  const fromTeam = t.teamFrom
  const toTeam = t.teamTo
  const isIn = direction === "in"

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5",
        isIn
          ? "border-primary/20 bg-primary/5"
          : "border-border/60 bg-secondary/30",
      )}
    >
      {/* Player identity */}
      <PlayerButton
        player={{ id: t.player.id, name: t.player.name, photo: t.player.photo ?? null }}
        className="flex min-w-0 items-center gap-2.5"
      >
        {t.player.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.player.photo} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover border border-border" width={32} height={32} loading="lazy" decoding="async" />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary border border-border">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 text-left">
          <p className="truncate text-xs font-semibold text-foreground hover:text-primary transition-colors">
            {t.player.name}
          </p>
          {/* Transfer flow: from → to with logos */}
          <div className="flex items-center gap-1 mt-0.5">
            {fromTeam.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fromTeam.logo} alt="" className="h-3 w-3 object-contain opacity-70" width={12} height={12} loading="lazy" decoding="async" />
            )}
            <span className="text-[10px] text-muted-foreground truncate">{fromTeam.name}</span>
            <span className="text-[10px] text-muted-foreground/60">→</span>
            {toTeam.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={toTeam.logo} alt="" className="h-3 w-3 object-contain opacity-70" width={12} height={12} loading="lazy" decoding="async" />
            )}
            <span className="text-[10px] text-muted-foreground truncate">{toTeam.name}</span>
          </div>
        </div>
      </PlayerButton>

      {/* Type + date */}
      <div className="flex shrink-0 flex-col items-end gap-1">
        {t.type && t.type !== "N/A" && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-bold",
              isIn
                ? "border border-primary/30 bg-primary/10 text-primary"
                : "border border-border bg-secondary text-muted-foreground",
            )}
          >
            {t.type}
          </span>
        )}
        {t.date && (
          <span className="text-[10px] tabular-nums text-muted-foreground">{t.date.slice(0, 7)}</span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Panel Modal
// ---------------------------------------------------------------------------

export function TeamPanel() {
  const { panel, closeTeam } = useTeamPanel()
  useBodyScrollLock(!!panel)
  useCloseOnBackButton(!!panel, closeTeam)
  if (!panel) return null
  return <TeamPanelInner key={panel.team.id} closeTeam={closeTeam} panel={panel} />
  }

function TeamPanelInner({
  panel,
  closeTeam,
}: {
  panel: { team: { id: number; name: string; logo: string }; basic: TeamBasicInfo | null; loading: boolean; error: string | null }
  closeTeam: () => void
}) {
  const { t, locale } = useLanguage()
  const { team, basic, loading, error } = panel

  const tabs: PanelTabItem[] = [
    { key: "stats", label: t("team.seasonStats"), icon: <Activity className="h-3.5 w-3.5" /> },
    { key: "form", label: t("team.recentForm"), icon: <Activity className="h-3.5 w-3.5" /> },
    { key: "fixtures", label: t("team.recentFixtures"), icon: <Calendar className="h-3.5 w-3.5" /> },
    { key: "coach", label: t("team.coach"), icon: <UserCheck className="h-3.5 w-3.5" /> },
    { key: "squad", label: t("team.squad"), icon: <Users className="h-3.5 w-3.5" /> },
    { key: "topScorers", label: t("team.leagueTopScorers"), icon: <Star className="h-3.5 w-3.5" /> },
    { key: "standings", label: t("team.standings"), icon: <Shield className="h-3.5 w-3.5" /> },
    { key: "transfers", label: t("team.transfers"), icon: <ArrowLeftRight className="h-3.5 w-3.5" /> },
  ]
  const [activeTab, setActiveTab] = useState(tabs[0].key)

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label={`${team.name} ${t("team.teamInfo")}`}
    >
      {/* Full screen panel */}
      <div className="flex h-full w-full flex-col overflow-hidden">

        {/* Header */}
        <div className="relative shrink-0 overflow-hidden">
          <div className="relative flex items-center gap-4 border-b border-border/60 px-5 py-4">
            {/* Logo */}
            {team.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={team.logo}
                alt={team.name}
                className="h-14 w-14 shrink-0 object-contain drop-shadow-md"
              width={56} height={56} loading="lazy" decoding="async" />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-secondary">
                <Shield className="h-6 w-6 text-muted-foreground" />
              </div>
            )}

            {/* Team name + venue info */}
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-black leading-tight text-foreground truncate">{team.name}</h2>
              {basic?.venue.name && (
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {basic.venue.name}
                    {basic.venue.city && `, ${basic.venue.city}`}
                  </span>
                  {basic.venue.capacity != null && (
                    <span className="rounded-lg border border-border bg-secondary/60 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                      {basic.venue.capacity.toLocaleString(locale === "en" ? "en-US" : "tr-TR")} {t("team.capacitySuffix")}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Close button */}
            <button
              type="button"
              onClick={closeTeam}
              aria-label={t("common.close")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border/60 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Season meta bar */}
          {basic && (
            <div className="relative flex items-center gap-3 border-b border-border/60 bg-secondary/40 px-5 py-2">
              <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground/85">{t("team.stadium") ? t("league.season") : t("league.season")}</span>
              <span className="rounded-lg border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-black text-primary">
                {basic.currentSeason}/{String(basic.currentSeason + 1).slice(2)}
              </span>
              {formatMarketValueEur(basic.marketValueEur) && (
                <>
                  <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground/85">
                    {t("team.squadValue")}
                  </span>
                  <span className="rounded-lg border border-border bg-secondary px-2 py-0.5 text-[11px] font-black text-foreground">
                    {formatMarketValueEur(basic.marketValueEur)}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium text-muted-foreground">{t("team.teamDataLoading")}</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 py-12 text-center">
              <ShieldOff className="h-8 w-8 text-destructive/75" />
              <p className="text-sm font-bold text-destructive">{t("league.dataFetchFailed")}</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          )}

          {!loading && !error && basic && (
            <div className="flex flex-col gap-2">
              {/* Venue image — shown only if available */}
              {basic.venue.image && (
                <div className="overflow-hidden rounded-2xl border border-border/70">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={basic.venue.image}
                    alt={basic.venue.name ?? t("team.stadium")}
                    className="w-full h-40 object-cover"
                  />
                  {basic.venue.name && (
                    <div className="flex items-center justify-between gap-2 bg-card px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="text-xs font-semibold text-foreground">{basic.venue.name}</span>
                        {basic.venue.city && (
                          <span className="text-[11px] text-muted-foreground">· {basic.venue.city}</span>
                        )}
                      </div>
                      {basic.venue.capacity != null && (
                        <span className="shrink-0 rounded-lg border border-border bg-secondary px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                          {basic.venue.capacity.toLocaleString(locale === "en" ? "en-US" : "tr-TR")} {t("team.capacitySuffixShort")}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Yan yana sekmeler — her sekme sadece aktifken kendi verisini çeker */}
              <PanelTabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />
              <SeasonStatsSection teamId={team.id} teamName={team.name} active={activeTab === "stats"} />
              <FormSection teamId={team.id} teamName={team.name} active={activeTab === "form"} />
              <RecentFixturesSection teamId={team.id} teamName={team.name} active={activeTab === "fixtures"} />
              <CoachSection teamId={team.id} teamName={team.name} active={activeTab === "coach"} />
              <SquadSection teamId={team.id} teamName={team.name} active={activeTab === "squad"} />
              <TopScorersSection teamId={team.id} teamName={team.name} active={activeTab === "topScorers"} />
              <StandingsSection teamId={team.id} teamName={team.name} active={activeTab === "standings"} />
              <TransfersSection teamId={team.id} teamName={team.name} active={activeTab === "transfers"} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reusable clickable team name / button
// ---------------------------------------------------------------------------

export function TeamButton({
  team,
  children,
  className,
}: {
  team: { id: number; name: string; logo: string }
  children: React.ReactNode
  className?: string
}) {
  const { openTeam } = useTeamPanel()
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        openTeam(team)
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
