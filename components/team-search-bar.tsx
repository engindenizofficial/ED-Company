"use client"

import { LoaderCircle, Search, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTeamPanel } from "@/contexts/team-context"
import type { TeamSearchResult } from "@/app/api/teams/search/route"

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
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<TeamSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const debouncedQuery = useDebounce(query, 320)

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    let cancelled = false
    setLoading(true)
    fetch(`/api/teams/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then((r) => r.json())
      .then((data: { results: TeamSearchResult[] }) => {
        if (cancelled) return
        setResults(data.results ?? [])
        setOpen(true)
      })
      .catch(() => {
        if (!cancelled) setResults([])
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

  const handleSelect = useCallback(
    (result: TeamSearchResult) => {
      openTeam({ id: result.id, name: result.name, logo: result.logo })
      setQuery("")
      setResults([])
      setOpen(false)
    },
    [openTeam],
  )

  const handleClear = useCallback(() => {
    setQuery("")
    setResults([])
    setOpen(false)
    inputRef.current?.focus()
  }, [])

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
          onFocus={() => { if (results.length > 0) setOpen(true) }}
          placeholder="Takım ara... (örn. Galatasaray, Arsenal, Bayern)"
          className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-9 text-sm text-foreground outline-none transition-colors focus:border-primary"
          aria-label="Takım ara"
          aria-expanded={open}
          aria-haspopup="listbox"
          autoComplete="off"
        />
        {/* Sağ ikon: yükleniyorsa spinner, dolu ise çarpı */}
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
          aria-label="Takım arama sonuçları"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-72 overflow-y-auto rounded-xl border border-border bg-card shadow-lg"
        >
          {results.length === 0 ? (
            <div className="px-4 py-4 text-center text-sm text-muted-foreground">
              &ldquo;{query}&rdquo; için takım bulunamadı.
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-border/50">
              {results.map((r) => (
                <li key={r.id} role="option">
                  <button
                    type="button"
                    onClick={() => handleSelect(r)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-secondary"
                  >
                    {/* Takım logosu */}
                    {r.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.logo}
                        alt=""
                        className="h-7 w-7 shrink-0 object-contain"
                      />
                    ) : (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-muted-foreground">
                        {r.name.charAt(0)}
                      </div>
                    )}

                    {/* Takım adı + lig bilgisi */}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold text-foreground">{r.name}</span>
                      <div className="flex items-center gap-1.5">
                        {r.leagueLogo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.leagueLogo} alt="" className="h-3 w-3 object-contain" />
                        ) : null}
                        <span className="truncate text-[11px] text-muted-foreground">
                          {r.leagueName}
                          {r.country ? ` · ${r.country}` : ""}
                        </span>
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
