"use client"

import { LoaderCircle, Search, Trophy } from "lucide-react"
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

export default function LeaguesPage() {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
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

  const leagues = data?.leagues ?? []

  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <label className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Lig ara (en az 2 karakter)..."
          className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-3 text-sm text-foreground outline-none transition-colors focus:border-primary"
          aria-label="Lig ara"
        />
        {isLoading && (
          <LoaderCircle className="pointer-events-none absolute right-3 h-4 w-4 animate-spin text-primary" />
        )}
      </label>

      {error ? (
        <div className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-destructive">
          Ligler yüklenemedi: {error.message}
        </div>
      ) : leagues.length === 0 && !isLoading ? (
        <div className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {debouncedQuery.length >= 2
            ? `"${debouncedQuery}" için lig bulunamadı.`
            : "Arama yapmak için en az 2 karakter girin."}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {leagues.map((l) => (
            <li key={l.id}>
              <Link
                href={`/league/${l.id}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-secondary"
              >
                {l.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={l.logo}
                    alt={l.name}
                    className="h-10 w-10 shrink-0 object-contain"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-secondary">
                    <Trophy className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold text-foreground">{l.name}</span>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {l.countryFlag && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.countryFlag} alt="" className="h-3.5 w-5 object-cover rounded-sm" />
                    )}
                    <span>{l.country}</span>
                    {l.season && (
                      <span className="rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[10px]">
                        {l.season}/{l.season + 1}
                      </span>
                    )}
                    {l.type && l.type !== "League" && (
                      <span className="rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[10px]">
                        {l.type === "Cup" ? "Kupa" : l.type}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
