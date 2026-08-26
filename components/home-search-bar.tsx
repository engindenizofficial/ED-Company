"use client"

import { LoaderCircle, Search, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTeamPanel } from "@/contexts/team-context"
import { useLeaguePanel } from "@/contexts/league-context"
import { usePlayerPanel } from "@/contexts/player-context"
import { useMatchPanel } from "@/contexts/match-context"
import { useLanguage } from "@/contexts/language-context"
import { toDisplayCountry } from "@/lib/tr-aliases"
import type { Fixture } from "@/lib/types"
import type { Locale } from "@/lib/i18n/dictionaries"
import type { HomeSearchPlayerResult } from "@/app/api/search/players/route"
import type { HomeSearchTeamResult } from "@/app/api/search/teams/route"
import type { HomeSearchLeagueResult } from "@/app/api/search/leagues/route"

type Tab = "matches" | "players" | "teams" | "leagues"

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debouncedValue
}

function kickoff(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleTimeString(locale === "tr" ? "tr-TR" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  })
}

const LIVE_STATUSES = new Set(["1H", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP", "HT"])

function Logo({ src, alt, fallback }: { src: string | null; alt: string; fallback: string }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className="h-8 w-8 shrink-0 rounded-full bg-white/95 object-contain p-0.5 ring-1 ring-black/5"
        width={32}
        height={32}
        loading="lazy"
        decoding="async"
      />
    )
  }
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-black text-muted-foreground">
      {fallback.charAt(0)}
    </div>
  )
}

/**
 * Ana sayfadaki 4 sekmeli arama çubuğu (Maçlar / Oyuncular / Takımlar /
 * Ligler). Her sekme kendi endpoint'inden (bkz. app/api/search/*) veri
 * çeker; sadece aktif sekmenin isteği yapılır. "Maçlar" sekmesi, seçili
 * `date` (Dün/Bugün/Yarın) parametresiyle o günün TÜM maçları arasından
 * (24 lig sınırı olmadan) arar; diğer üç sekme 24 öne çıkan lig kapsamıyla
 * sınırlıdır. Her arama oturumu (yeni bir yazma başladığında) "Maçlar"
 * sekmesine sıfırlanır.
 */
export function HomeSearchBar({ date }: { date: string }) {
  const { t, locale } = useLanguage()
  const { openTeam } = useTeamPanel()
  const { openLeague } = useLeaguePanel()
  const { openPlayer } = usePlayerPanel()
  const { openMatch } = useMatchPanel()

  const [query, setQuery] = useState("")
  const [tab, setTab] = useState<Tab>("matches")
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const [matchResults, setMatchResults] = useState<Fixture[]>([])
  const [playerResults, setPlayerResults] = useState<HomeSearchPlayerResult[]>([])
  const [teamResults, setTeamResults] = useState<HomeSearchTeamResult[]>([])
  const [leagueResults, setLeagueResults] = useState<HomeSearchLeagueResult[]>([])

  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debouncedQuery = useDebounce(query, 320)

  // Yeni bir arama oturumu (boştan yazmaya başlama) her zaman "Maçlar"
  // sekmesiyle başlar (istenen davranış).
  useEffect(() => {
    if (query.length === 0) {
      setTab("matches")
    }
  }, [query.length === 0])

  // Aktif sekme veya sorgu değiştiğinde SADECE o sekmenin verisini çek.
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setMatchResults([])
      setPlayerResults([])
      setTeamResults([])
      setLeagueResults([])
      setOpen(false)
      return
    }

    let cancelled = false
    setLoading(true)

    const q = encodeURIComponent(debouncedQuery)
    const url =
      tab === "matches"
        ? `/api/search/matches?q=${q}&date=${encodeURIComponent(date)}`
        : tab === "players"
          ? `/api/search/players?q=${q}`
          : tab === "teams"
            ? `/api/search/teams?q=${q}`
            : `/api/search/leagues?q=${q}`

    fetch(url)
      .then((r) => r.json())
      .then((data: { results: unknown[] }) => {
        if (cancelled) return
        const results = data.results ?? []
        if (tab === "matches") setMatchResults(results as Fixture[])
        else if (tab === "players") setPlayerResults(results as HomeSearchPlayerResult[])
        else if (tab === "teams") setTeamResults(results as HomeSearchTeamResult[])
        else setLeagueResults(results as HomeSearchLeagueResult[])
        setOpen(true)
      })
      .catch(() => {
        if (cancelled) return
        if (tab === "matches") setMatchResults([])
        else if (tab === "players") setPlayerResults([])
        else if (tab === "teams") setTeamResults([])
        else setLeagueResults([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [debouncedQuery, tab, date])

  // Dışarı tıklanınca kapat
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const resetAndClose = useCallback(() => {
    setQuery("")
    setMatchResults([])
    setPlayerResults([])
    setTeamResults([])
    setLeagueResults([])
    setOpen(false)
    setTab("matches")
  }, [])

  const handleSelectMatch = useCallback(
    (fixture: Fixture) => {
      openMatch(fixture)
      resetAndClose()
    },
    [openMatch, resetAndClose],
  )

  const handleSelectPlayer = useCallback(
    (p: HomeSearchPlayerResult) => {
      openPlayer({ id: p.id, name: p.name, photo: p.photo })
      resetAndClose()
    },
    [openPlayer, resetAndClose],
  )

  const handleSelectTeam = useCallback(
    (r: HomeSearchTeamResult) => {
      openTeam({ id: r.id, name: r.name, logo: r.logo })
      resetAndClose()
    },
    [openTeam, resetAndClose],
  )

  const handleSelectLeague = useCallback(
    (r: HomeSearchLeagueResult) => {
      openLeague({ id: r.id, name: r.name, logo: r.logo, country: r.country, flagUrl: null })
      resetAndClose()
    },
    [openLeague, resetAndClose],
  )

  const handleClear = useCallback(() => {
    resetAndClose()
    inputRef.current?.focus()
  }, [resetAndClose])

  const isActive = open && debouncedQuery.length >= 2

  const activeCount =
    tab === "matches"
      ? matchResults.length
      : tab === "players"
        ? playerResults.length
        : tab === "teams"
          ? teamResults.length
          : leagueResults.length

  const noResultsKey =
    tab === "matches"
      ? "search.noMatchesFor"
      : tab === "players"
        ? "search.noPlayersFor"
        : tab === "teams"
          ? "search.noTeamsFor"
          : "search.noLeaguesFor"

  const tabs: { id: Tab; label: string }[] = [
    { id: "matches", label: t("search.tabMatches") },
    { id: "players", label: t("search.tabPlayers") },
    { id: "teams", label: t("search.tabTeams") },
    { id: "leagues", label: t("search.tabLeagues") },
  ]

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Input wrapper — pill shape, inset icon, focus ring via outline */}
      <label className="relative flex items-center">
        <span className="pointer-events-none absolute left-3.5 flex h-full items-center">
          {loading ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin text-primary" />
          ) : (
            <Search className={`h-3.5 w-3.5 transition-colors ${query.length > 0 ? "text-primary" : "text-muted-foreground"}`} />
          )}
        </span>

        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (activeCount > 0) setOpen(true)
          }}
          placeholder={t("search.homePlaceholder")}
          className="
            w-full rounded-xl border bg-secondary/50 py-2.5 pl-10 pr-10
            text-sm font-medium text-foreground outline-none
            placeholder:font-normal placeholder:text-muted-foreground
            transition-all duration-150
            border-border/50
            focus:border-primary/60 focus:bg-card focus:shadow-sm
            [&::-webkit-search-cancel-button]:hidden
          "
          aria-label={t("search.homePlaceholder")}
          role="combobox"
          aria-expanded={isActive}
          aria-haspopup="listbox"
          aria-controls={isActive ? "home-search-results" : undefined}
          aria-autocomplete="list"
          autoComplete="off"
        />

        {query.length > 0 && !loading && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 flex h-5 w-5 items-center justify-center rounded-full bg-border/60 text-muted-foreground transition-all hover:bg-border hover:text-foreground"
            aria-label={t("search.clear")}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </label>

      {/* Dropdown */}
      {isActive && (
        <div
          id="home-search-results"
          role="listbox"
          aria-label={t("search.results")}
          className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl"
        >
          {/* Tab bar */}
          <div className="flex items-center gap-1 border-b border-border/50 p-1.5">
            {tabs.map((tabItem) => (
              <button
                key={tabItem.id}
                type="button"
                onClick={() => setTab(tabItem.id)}
                className={`flex-1 rounded-lg px-2 py-1.5 text-[12px] font-semibold transition-colors ${
                  tab === tabItem.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                }`}
                aria-pressed={tab === tabItem.id}
              >
                {tabItem.label}
              </button>
            ))}
          </div>

          {activeCount === 0 && !loading ? (
            <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
              <Search className="h-5 w-5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{t(noResultsKey, { query })}</p>
            </div>
          ) : (
            <ul className="flex max-h-80 flex-col overflow-y-auto py-1.5">
              {tab === "matches" &&
                matchResults.map((f) => {
                  const live = LIVE_STATUSES.has(f.statusShort)
                  const played = f.statusShort !== "NS" && f.statusShort !== "TBD" && f.statusShort !== "PST"
                  return (
                    <li key={`match-${f.id}`} role="option">
                      <button
                        type="button"
                        onClick={() => handleSelectMatch(f)}
                        className="group flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-secondary/70"
                      >
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <Logo src={f.home.logo} alt="" fallback={f.home.name} />
                            <span className="truncate text-[13px] font-semibold text-foreground">{f.home.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Logo src={f.away.logo} alt="" fallback={f.away.name} />
                            <span className="truncate text-[13px] font-semibold text-foreground">{f.away.name}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {played ? (
                            <span className={`text-[13px] font-bold tabular-nums ${live ? "text-primary" : "text-foreground"}`}>
                              {f.goalsHome ?? 0} - {f.goalsAway ?? 0}
                            </span>
                          ) : (
                            <span className="text-[12px] font-semibold tabular-nums text-muted-foreground">
                              {kickoff(f.date, locale)}
                            </span>
                          )}
                          <span className="truncate text-[10px] text-muted-foreground">{f.league.name}</span>
                        </div>
                      </button>
                    </li>
                  )
                })}

              {tab === "players" &&
                playerResults.map((p) => (
                  <li key={`player-${p.id}`} role="option">
                    <button
                      type="button"
                      onClick={() => handleSelectPlayer(p)}
                      className="group flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-secondary/70"
                    >
                      <Logo src={p.photo} alt="" fallback={p.name} />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[13px] font-semibold text-foreground group-hover:text-primary transition-colors">
                          {p.name}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {p.teamLogo && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.teamLogo} alt="" className="h-3 w-3 object-contain opacity-70" width={12} height={12} loading="lazy" decoding="async" />
                          )}
                          <span className="truncate text-[11px] text-muted-foreground">
                            {p.teamName ?? "—"}
                            {p.nationality ? ` · ${toDisplayCountry(p.nationality, locale)}` : ""}
                          </span>
                        </div>
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                        →
                      </span>
                    </button>
                  </li>
                ))}

              {tab === "teams" &&
                teamResults.map((r) => (
                  <li key={`team-${r.id}`} role="option">
                    <button
                      type="button"
                      onClick={() => handleSelectTeam(r)}
                      className="group flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-secondary/70"
                    >
                      <Logo src={r.logo} alt="" fallback={r.name} />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[13px] font-semibold text-foreground group-hover:text-primary transition-colors">
                          {r.name}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {r.leagueLogo && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.leagueLogo} alt="" className="h-3 w-3 object-contain opacity-70" width={12} height={12} loading="lazy" decoding="async" />
                          )}
                          <span className="truncate text-[11px] text-muted-foreground">
                            {r.leagueName}
                            {r.country ? ` · ${toDisplayCountry(r.country, locale)}` : ""}
                          </span>
                        </div>
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                        →
                      </span>
                    </button>
                  </li>
                ))}

              {tab === "leagues" &&
                leagueResults.map((r) => (
                  <li key={`league-${r.id}`} role="option">
                    <button
                      type="button"
                      onClick={() => handleSelectLeague(r)}
                      className="group flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-secondary/70"
                    >
                      <Logo src={r.logo} alt="" fallback={r.name} />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[13px] font-semibold text-foreground group-hover:text-primary transition-colors">
                          {r.name}
                        </span>
                        <span className="truncate text-[11px] text-muted-foreground">{toDisplayCountry(r.country, locale)}</span>
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                        →
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
