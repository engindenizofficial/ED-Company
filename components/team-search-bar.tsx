"use client"

import { LoaderCircle, Search, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTeamPanel } from "@/contexts/team-context"
import { useLeaguePanel } from "@/contexts/league-context"
import { usePlayerPanel } from "@/contexts/player-context"
import type { TeamSearchResult } from "@/app/api/teams/search/route"
import type { LeagueSearchResult } from "@/app/api/leagues/search/route"
import type { PlayerSearchResult } from "@/app/api/players/search/route"

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debouncedValue
}

export function TeamSearchBar() {
  const { openTeam } = useTeamPanel()
  const { openLeague } = useLeaguePanel()
  const { openPlayer } = usePlayerPanel()

  const [query, setQuery] = useState("")
  const [teamResults, setTeamResults] = useState<TeamSearchResult[]>([])
  const [leagueResults, setLeagueResults] = useState<LeagueSearchResult[]>([])
  const [playerResults, setPlayerResults] = useState<PlayerSearchResult[]>([])
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
      setPlayerResults([])
      setOpen(false)
      return
    }

    let cancelled = false
    setLoading(true)

    const q = encodeURIComponent(debouncedQuery)

    Promise.all([
      fetch(`/api/teams/search?q=${q}`).then((r) => r.json()) as Promise<{ results: TeamSearchResult[] }>,
      fetch(`/api/leagues/search?q=${q}`).then((r) => r.json()) as Promise<{ results: LeagueSearchResult[] }>,
      fetch(`/api/players/search?q=${q}`).then((r) => r.json()) as Promise<{ results: PlayerSearchResult[] }>,
    ])
      .then(([teamData, leagueData, playerData]) => {
        if (cancelled) return
        setTeamResults(teamData.results ?? [])
        setLeagueResults(leagueData.results ?? [])
        setPlayerResults(playerData.results ?? [])
        setOpen(true)
      })
      .catch(() => {
        if (!cancelled) {
          setTeamResults([])
          setLeagueResults([])
          setPlayerResults([])
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

  const handleSelectPlayer = useCallback(
    (result: PlayerSearchResult) => {
      openPlayer({ id: result.id, name: result.name, photo: result.photo })
      setQuery("")
      setTeamResults([])
      setLeagueResults([])
      setPlayerResults([])
      setOpen(false)
    },
    [openPlayer],
  )

  const handleClear = useCallback(() => {
    setQuery("")
    setTeamResults([])
    setLeagueResults([])
    setPlayerResults([])
    setOpen(false)
    inputRef.current?.focus()
  }, [])

  const hasTeams = teamResults.length > 0
  const hasLeagues = leagueResults.length > 0
  const hasPlayers = playerResults.length > 0
  const hasAnyResults = hasTeams || hasLeagues || hasPlayers

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Input */}
      <label className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            // Odaklanınca sadece önceden sonuç varsa dropdown'ı aç
            if (teamResults.length > 0 || leagueResults.length > 0) setOpen(true)
          }}
          placeholder="Takım / Lig / Oyuncu ara..."
          className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-9 text-sm text-foreground outline-none transition-colors focus:border-primary"
          aria-label="Takım, lig veya oyuncu ara"
          aria-expanded={open}
          aria-haspopup="listbox"
          autoComplete="off"
        />
        {loading ? (
          <LoaderCircle className="pointer-events-none absolute right-3 h-4 w-4 animate-spin text-muted-foreground" />
        ) : query.length > 0 ? (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Aramayı temizle"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </label>

      {/* Dropdown */}
      {open && debouncedQuery.length >= 2 && (
        <div
          role="listbox"
          aria-label="Arama sonuçları"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-80 overflow-y-auto rounded-xl border border-border bg-card shadow-lg"
        >
          {!hasAnyResults && !loading ? (
            <div className="px-4 py-4 text-center text-sm text-muted-foreground">
              {`"${query}" için sonuç bulunamadı.`}
            </div>
          ) : (
            <ul className="flex flex-col">
              {/* Takımlar grubu */}
              {hasTeams && (
                <>
                  <li className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Takımlar
                  </li>
                  {teamResults.map((r) => (
                    <li key={`team-${r.id}`} role="option" className="border-t border-border/40 first:border-t-0">
                      <button
                        type="button"
                        onClick={() => handleSelectTeam(r)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-secondary"
                      >
                        {r.logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.logo} alt="" className="h-7 w-7 shrink-0 object-contain" />
                        ) : (
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-muted-foreground">
                            {r.name.charAt(0)}
                          </div>
                        )}
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-semibold text-foreground">{r.name}</span>
                          <div className="flex items-center gap-1.5">
                            {r.leagueLogo && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.leagueLogo} alt="" className="h-3 w-3 object-contain" />
                            )}
                            <span className="truncate text-[11px] text-muted-foreground">
                              {r.leagueName}{r.country ? ` · ${r.country}` : ""}
                            </span>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </>
              )}

              {/* Ligler grubu */}
              {hasLeagues && (
                <>
                  <li className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground${hasTeams ? " border-t border-border/60" : ""}`}>
                    Ligler
                  </li>
                  {leagueResults.map((r) => (
                    <li key={`league-${r.id}`} role="option" className="border-t border-border/40 first:border-t-0">
                      <button
                        type="button"
                        onClick={() => handleSelectLeague(r)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-secondary"
                      >
                        {r.logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.logo} alt="" className="h-7 w-7 shrink-0 object-contain" />
                        ) : (
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-muted-foreground">
                            {r.name.charAt(0)}
                          </div>
                        )}
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-semibold text-foreground">{r.name}</span>
                          <div className="flex items-center gap-1.5">
                            {r.flagUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.flagUrl} alt="" className="h-3 w-4 rounded-[2px] object-cover" />
                            )}
                            <span className="truncate text-[11px] text-muted-foreground">{r.country}</span>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </>
              )}

              {/* Oyuncular grubu */}
              {hasPlayers && (
                <>
                  <li className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground${hasTeams || hasLeagues ? " border-t border-border/60" : ""}`}>
                    Oyuncular
                  </li>
                  {playerResults.map((r) => (
                    <li key={`player-${r.id}`} role="option" className="border-t border-border/40 first:border-t-0">
                      <button
                        type="button"
                        onClick={() => handleSelectPlayer(r)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-secondary"
                      >
                        {r.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.photo} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover border border-border" />
                        ) : (
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-muted-foreground">
                            {r.name.charAt(0)}
                          </div>
                        )}
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-semibold text-foreground">{r.name}</span>
                          <div className="flex items-center gap-1.5">
                            {r.teamLogo && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.teamLogo} alt="" className="h-3 w-3 object-contain" />
                            )}
                            <span className="truncate text-[11px] text-muted-foreground">
                              {r.teamName ?? "Serbest"}{r.nationality ? ` · ${r.nationality}` : ""}
                            </span>
                          </div>
                        </div>
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
