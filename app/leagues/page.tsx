"use client"

import { Globe, LoaderCircle, Search, Star, Trophy } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import useSWR from "swr"

async function fetcher(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error((await res.json()).error ?? "Hata")
  return res.json()
}

interface LeagueSummary {
  id: number
  name: string
  logo: string | null
  country: string
  countryFlag: string | null
  season: number | null
  type: string | null
}

// Top leagues to feature at the top
const FEATURED_IDS = [39, 140, 61, 78, 135, 2, 3, 88] // PL, LaLiga, Ligue1, Bundesliga, SerieA, UCL, UEL, Eredivisie

const TYPE_FILTERS = [
  { label: "Tümü", value: "" },
  { label: "Lig", value: "League" },
  { label: "Kupa", value: "Cup" },
]

export default function LeaguesPage() {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebouncedQuery(query.trim()), 400)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [query])

  const key =
    debouncedQuery.length >= 2
      ? `/api/leagues/list?q=${encodeURIComponent(debouncedQuery)}`
      : "/api/leagues/list"

  const { data, isLoading, error } = useSWR<{ leagues: LeagueSummary[] }>(key, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  })

  const allLeagues = data?.leagues ?? []
  const leagues = allLeagues.filter((l) => (typeFilter ? l.type === typeFilter : true))

  const featured = leagues.filter((l) => FEATURED_IDS.includes(l.id))
  const rest = leagues.filter((l) => !FEATURED_IDS.includes(l.id))
  const showFeatured = !debouncedQuery && featured.length > 0

  return (
    <div className="flex flex-col gap-5">
      {/* Search */}
      <label className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Lig ara (en az 2 karakter)..."
          className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
          aria-label="Lig ara"
          style={{ boxShadow: "var(--shadow-card)" }}
        />
        {isLoading && (
          <LoaderCircle className="pointer-events-none absolute right-3 h-4 w-4 animate-spin text-primary" />
        )}
      </label>

      {/* Type filter chips */}
      <div className="flex items-center gap-2">
        <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {TYPE_FILTERS.map(({ label, value }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTypeFilter(value)}
            className="rounded-full px-3.5 py-1.5 text-xs font-bold transition-all duration-200"
            style={
              typeFilter === value
                ? {
                    background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
                    color: "var(--primary-foreground)",
                    boxShadow: "var(--shadow-card-active)",
                    border: "1px solid transparent",
                  }
                : {
                    background: "var(--secondary)",
                    color: "var(--muted-foreground)",
                    border: "1px solid var(--border)",
                    boxShadow: "var(--shadow-card)",
                  }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Featured major leagues */}
      {showFeatured && (
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Büyük Ligler</span>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {FEATURED_IDS.map((id) => {
              const l = featured.find((x) => x.id === id)
              if (!l) return null
              return (
                <Link
                  key={l.id}
                  href={`/league/${l.id}`}
                  className="group flex flex-col items-center gap-1.5 rounded-xl p-2.5 text-center transition-all duration-200 hover:-translate-y-0.5"
                  style={{
                    background: "linear-gradient(145deg, color-mix(in oklch, var(--primary) 5%, var(--card)), var(--card))",
                    border: "1px solid color-mix(in oklch, var(--primary) 18%, var(--border))",
                    boxShadow: "var(--shadow-card)",
                  }}
                >
                  {l.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={l.logo}
                      alt={l.name}
                      className="h-10 w-10 object-contain transition-transform duration-200 group-hover:scale-110"
                    />
                  ) : (
                    <Trophy className="h-10 w-10 text-muted-foreground" />
                  )}
                  <span className="text-[10px] font-bold leading-tight text-foreground line-clamp-2 text-center">
                    {l.name}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Error / empty states */}
      {error ? (
        <div
          className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-destructive"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          Ligler yüklenemedi: {error.message}
        </div>
      ) : leagues.length === 0 && !isLoading ? (
        <div
          className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          {debouncedQuery.length >= 2
            ? `"${debouncedQuery}" için lig bulunamadı.`
            : "Arama yapmak için en az 2 karakter girin."}
        </div>
      ) : (
        <>
          {/* Show rest (non-featured) or all when searching */}
          {(showFeatured ? rest : leagues).length > 0 && (
            <div>
              {showFeatured && (
                <div className="mb-2 flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Tüm Ligler</span>
                </div>
              )}
              <ul className="grid gap-2 sm:grid-cols-2">
                {(showFeatured ? rest : leagues).map((l) => (
                  <li key={l.id}>
                    <Link
                      href={`/league/${l.id}`}
                      className="group flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-200 hover:-translate-y-0.5"
                      style={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        boxShadow: "var(--shadow-card)",
                      }}
                    >
                      {l.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={l.logo}
                          alt={l.name}
                          className="h-10 w-10 shrink-0 object-contain transition-transform duration-200 group-hover:scale-105"
                        />
                      ) : (
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                          style={{ background: "var(--secondary)", border: "1px solid var(--border)" }}
                        >
                          <Trophy className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-sm font-bold text-foreground group-hover:text-primary">{l.name}</span>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {l.countryFlag && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={l.countryFlag} alt="" className="h-3.5 w-5 rounded-sm object-cover" />
                          )}
                          <span>{l.country}</span>
                          {l.season && (
                            <span
                              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                              style={{ background: "var(--secondary)", border: "1px solid var(--border)" }}
                            >
                              {l.season}/{l.season + 1}
                            </span>
                          )}
                          {l.type && l.type !== "League" && (
                            <span
                              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                              style={{
                                background: "color-mix(in oklch, var(--accent) 12%, var(--secondary))",
                                border: "1px solid color-mix(in oklch, var(--accent) 25%, var(--border))",
                                color: "var(--accent)",
                              }}
                            >
                              {l.type === "Cup" ? "Kupa" : l.type}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}
