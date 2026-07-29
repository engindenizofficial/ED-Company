"use client"

import { LoaderCircle, Search, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTeamPanel } from "@/contexts/team-context"
import { useLeaguePanel } from "@/contexts/league-context"
import { cn } from "@/lib/utils"
import type { TeamSearchResult } from "@/app/api/teams/search/route"
import type { LeagueSearchResult } from "@/app/api/leagues/search/route"

type Tab = "team" | "league"

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

  const [tab, setTab] = useState<Tab>("team")
  const [query, setQuery] = useState("")
  const [teamResults, setTeamResults] = useState<TeamSearchResult[]>([])
  const [leagueResults, setLeagueResults] = useState<LeagueSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debouncedQuery = useDebounce(query, 320)

  // Ligler için: sorgu boşken tüm ligleri göster
  useEffect(() => {
    if (tab === "league") {
      setLoading(true)
      fetch(`/api/leagues/search?q=${encodeURIComponent(debouncedQuery)}`)
        .then((r) => r.json())
        .then((data: { results: LeagueSearchResult[] }) => {
          setLeagueResults(data.results ?? [])
          setOpen(true)
        })
        .catch(() => setLeagueResults([]))
        .finally(() => setLoading(false))
      return
    }

    // Takım araması — en az 2 karakter
    if (debouncedQuery.length < 2) {
      setTeamResults([])
      setOpen(false)
      return
    }
    let cancelled = false
    setLoading(true)
    fetch(`/api/teams/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then((r) => r.json())
      .then((data: { results: TeamSearchResult[] }) => {
        if (cancelled) return
        setTeamResults(data.results ?? [])
        setOpen(true)
      })
      .catch(() => {
        if (!cancelled) setTeamResults([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [debouncedQuery, tab])

  // Sekme değişince dropdown'ı kapat, query'yi sıfırla
  const switchTab = useCallback((t: Tab) => {
    setTab(t)
    setQuery("")
    setTeamResults([])
    setLeagueResults([])
    setOpen(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  // Lig sekmesine geçince ligleri hemen getir
  useEffect(() => {
    if (tab === "league") {
      setLoading(true)
      fetch("/api/leagues/search?q=")
        .then((r) => r.json())
        .then((data: { results: LeagueSearchResult[] }) => {
          setLeagueResults(data.results ?? [])
          setOpen(true)
        })
        .catch(() => setLeagueResults([]))
        .finally(() => setLoading(false))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

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
      setOpen(false)
    },
    [openLeague],
  )

  const handleClear = useCallback(() => {
    setQuery("")
    setTeamResults([])
    setOpen(tab === "league") // lig sekmesinde temizlense bile liste açık kalsın
    inputRef.current?.focus()
  }, [tab])

  const placeholder =
    tab === "team"
      ? "Takım ara... (örn. Galatasaray, Arsenal)"
      : "Lig ara... (örn. Premier League, Süper Lig)"

  const currentResults = tab === "team" ? teamResults : leagueResults
  const hasResults = currentResults.length > 0

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Sekme seçici */}
      <div className="mb-2 flex gap-1 rounded-lg bg-secondary p-1">
        <button
          type="button"
          onClick={() => switchTab("team")}
          className={cn(
            "flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors",
            tab === "team"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Takım
        </button>
        <button
          type="button"
          onClick={() => switchTab("league")}
          className={cn(
            "flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors",
            tab === "league"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Lig
        </button>
      </div>

      {/* Input */}
      <label className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (tab === "league") setOpen(true)
            else if (currentResults.length > 0) setOpen(true)
          }}
          placeholder={placeholder}
          className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-9 text-sm text-foreground outline-none transition-colors focus:border-primary"
          aria-label={tab === "team" ? "Takım ara" : "Lig ara"}
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
      {open && (
        <div
          role="listbox"
          aria-label={tab === "team" ? "Takım arama sonuçları" : "Lig arama sonuçları"}
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-72 overflow-y-auto rounded-xl border border-border bg-card shadow-lg"
        >
          {!hasResults && !loading ? (
            <div className="px-4 py-4 text-center text-sm text-muted-foreground">
              {query
                ? `"${query}" için sonuç bulunamadı.`
                : tab === "league"
                  ? "Ligler yükleniyor..."
                  : "En az 2 karakter girin."}
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-border/50">
              {tab === "team"
                ? (teamResults as TeamSearchResult[]).map((r) => (
                    <li key={r.id} role="option">
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
                  ))
                : (leagueResults as LeagueSearchResult[]).map((r) => (
                    <li key={r.id} role="option">
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
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
