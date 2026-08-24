"use client"

import { LoaderCircle, Search, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTeamPanel } from "@/contexts/team-context"
import { useLeaguePanel } from "@/contexts/league-context"
import type { TeamSearchResult } from "@/app/api/teams/search/route"
import type { LeagueSearchResult } from "@/app/api/leagues/search/route"
import { toDisplayCountry } from "@/lib/tr-aliases"
import { useLanguage } from "@/contexts/language-context"

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debouncedValue
}

export function TeamSearchBar() {
  const { t, locale } = useLanguage()
  const { openTeam } = useTeamPanel()
  const { openLeague } = useLeaguePanel()

  const [query, setQuery] = useState("")
  const [teamResults, setTeamResults] = useState<TeamSearchResult[]>([])
  const [leagueResults, setLeagueResults] = useState<LeagueSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debouncedQuery = useDebounce(query, 320)

  // Arama — en az 2 karakter, hem takım hem lig paralel çekilir
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setTeamResults([])
      setLeagueResults([])
      setOpen(false)
      return
    }

    let cancelled = false
    setLoading(true)

    const q = encodeURIComponent(debouncedQuery)

    Promise.all([
      fetch(`/api/teams/search?q=${q}`).then((r) => r.json()) as Promise<{ results: TeamSearchResult[] }>,
      fetch(`/api/leagues/search?q=${q}`).then((r) => r.json()) as Promise<{ results: LeagueSearchResult[] }>,
    ])
      .then(([teamData, leagueData]) => {
        if (cancelled) return
        setTeamResults(teamData.results ?? [])
        setLeagueResults(leagueData.results ?? [])
        setOpen(true)
      })
      .catch(() => {
        if (!cancelled) {
          setTeamResults([])
          setLeagueResults([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [debouncedQuery])

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

  const handleSelectTeam = useCallback(
    (result: TeamSearchResult) => {
      openTeam({ id: result.id, name: result.name, logo: result.logo })
      setQuery("")
      setTeamResults([])
      setLeagueResults([])
      setOpen(false)
    },
    [openTeam],
  )

  const handleSelectLeague = useCallback(
    (result: LeagueSearchResult) => {
      openLeague({
        id: result.id,
        name: result.name,
        logo: result.logo,
        country: result.country,
        flagUrl: result.flagUrl,
      })
      setQuery("")
      setTeamResults([])
      setLeagueResults([])
      setOpen(false)
    },
    [openLeague],
  )

  const handleClear = useCallback(() => {
    setQuery("")
    setTeamResults([])
    setLeagueResults([])
    setOpen(false)
    inputRef.current?.focus()
  }, [])

  const hasTeams = teamResults.length > 0
  const hasLeagues = leagueResults.length > 0
  const hasAnyResults = hasTeams || hasLeagues

  const isActive = open && debouncedQuery.length >= 2

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Input wrapper — pill shape, inset icon, focus ring via outline */}
      <label className="relative flex items-center">
        {/* Left icon */}
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
            if (teamResults.length > 0 || leagueResults.length > 0) setOpen(true)
          }}
          placeholder={t("search.favoritePlaceholder")}
          className="
            w-full rounded-xl border bg-secondary/50 py-2.5 pl-10 pr-10
            text-sm font-medium text-foreground outline-none
            placeholder:font-normal placeholder:text-muted-foreground
            transition-all duration-150
            border-border/50
            focus:border-primary/60 focus:bg-card focus:shadow-sm
            [&::-webkit-search-cancel-button]:hidden
          "
          aria-label={t("search.favoritePlaceholder")}
          role="combobox"
          aria-expanded={isActive}
          aria-haspopup="listbox"
          // Listbox sadece isActive olduğunda DOM'a giriyor (aşağıda koşullu render).
          // aria-controls'u da aynı koşula bağlıyoruz; aksi halde kapalıyken var
          // olmayan bir ID'ye işaret eder (axe/Lighthouse "aria-valid-attr-value" hatası).
          aria-controls={isActive ? "team-search-results" : undefined}
          aria-autocomplete="list"
          autoComplete="off"
        />

        {/* Right: clear button */}
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
          id="team-search-results"
          role="listbox"
          aria-label={t("search.results")}
          className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-border/60 bg-card/98 shadow-2xl backdrop-blur-xl"
        >
          {!hasAnyResults && !loading ? (
            <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
              <Search className="h-5 w-5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{t("search.noResultsFor", { query })}</p>
            </div>
          ) : (
            <ul className="flex max-h-80 flex-col overflow-y-auto py-1.5">
              {/* Teams */}
              {hasTeams && (
                <>
                  <li className="flex items-center gap-2 px-3.5 py-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                      {t("search.teams")}
                    </span>
                    <span className="h-px flex-1 bg-border/50" />
                    <span className="text-[10px] tabular-nums text-muted-foreground">{teamResults.length}</span>
                  </li>
                  {teamResults.map((r) => (
                    <li key={`team-${r.id}`} role="option">
                      <button
                        type="button"
                        onClick={() => handleSelectTeam(r)}
                        className="group flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-secondary/70"
                      >
                        {/* Logo */}
                        <div className="relative h-8 w-8 shrink-0">
                          {r.logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.logo} alt="" className="h-8 w-8 object-contain rounded-full bg-white/95 p-0.5 ring-1 ring-black/5" width={32} height={32} loading="lazy" decoding="async" />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-[11px] font-black text-muted-foreground">
                              {r.name.charAt(0)}
                            </div>
                          )}
                        </div>
                        {/* Info */}
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
                              {r.leagueName}{r.country ? ` · ${toDisplayCountry(r.country, locale)}` : ""}
                            </span>
                          </div>
                        </div>
                        {/* Arrow hint */}
                        <span className="shrink-0 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                          →
                        </span>
                      </button>
                    </li>
                  ))}
                </>
              )}

              {/* Leagues */}
              {hasLeagues && (
                <>
                  <li className={`flex items-center gap-2 px-3.5 py-2${hasTeams ? " mt-1 border-t border-border/40 pt-3" : ""}`}>
                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                      {t("search.leagues")}
                    </span>
                    <span className="h-px flex-1 bg-border/50" />
                    <span className="text-[10px] tabular-nums text-muted-foreground">{leagueResults.length}</span>
                  </li>
                  {leagueResults.map((r) => (
                    <li key={`league-${r.id}`} role="option">
                      <button
                        type="button"
                        onClick={() => handleSelectLeague(r)}
                        className="group flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-secondary/70"
                      >
                        {/* Logo */}
                        <div className="relative h-8 w-8 shrink-0">
                          {r.logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.logo} alt="" className="h-8 w-8 object-contain rounded-full bg-white/95 p-0.5 ring-1 ring-black/5" width={32} height={32} loading="lazy" decoding="async" />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-[11px] font-black text-muted-foreground">
                              {r.name.charAt(0)}
                            </div>
                          )}
                        </div>
                        {/* Info */}
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-[13px] font-semibold text-foreground group-hover:text-primary transition-colors">
                            {r.name}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {r.flagUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.flagUrl} alt="" className="h-3 w-4 rounded-sm object-cover opacity-80" width={16} height={12} loading="lazy" decoding="async" />
                            )}
                            <span className="truncate text-[11px] text-muted-foreground">
                              {toDisplayCountry(r.country, locale)}
                            </span>
                          </div>
                        </div>
                        {/* Arrow hint */}
                        <span className="shrink-0 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                          →
                        </span>
                      </button>
                    </li>
                  ))}
                </>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
