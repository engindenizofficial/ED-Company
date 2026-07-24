"use client"

import { LoaderCircle, Search, User } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import useSWR from "swr"

async function fetcher(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error((await res.json()).error ?? "Hata")
  return res.json()
}

interface PlayerSummary {
  id: number
  name: string
  photo: string | null
  nationality: string | null
  age: number | null
  position: string | null
  team: { id: number; name: string; logo: string } | null
  league: { id: number; name: string; logo: string } | null
  goals: number | null
  assists: number | null
  rating: string | null
}

function translatePos(pos: string | null): string {
  if (!pos) return ""
  const map: Record<string, string> = {
    Goalkeeper: "Kaleci",
    Defender: "Defans",
    Midfielder: "Orta Saha",
    Attacker: "Forvet",
  }
  return map[pos] ?? pos
}

export default function PlayersPage() {
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
    debouncedQuery.length >= 3
      ? `/api/players/search?q=${encodeURIComponent(debouncedQuery)}`
      : "/api/players/search"

  const { data, isLoading, error } = useSWR<{ players: PlayerSummary[] }>(key, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  })

  const players = data?.players ?? []

  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <label className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Oyuncu ara (en az 3 karakter)..."
          className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-3 text-sm text-foreground outline-none transition-colors focus:border-primary"
          aria-label="Oyuncu ara"
        />
        {isLoading && (
          <LoaderCircle className="pointer-events-none absolute right-3 h-4 w-4 animate-spin text-primary" />
        )}
      </label>

      {error ? (
        <div className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-destructive">
          Oyuncular yüklenemedi: {error.message}
        </div>
      ) : players.length === 0 && !isLoading ? (
        <div className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {debouncedQuery.length >= 3
            ? `"${debouncedQuery}" için oyuncu bulunamadı.`
            : "Arama yapmak için en az 3 karakter girin."}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {players.map((p) => (
            <li key={p.id}>
              <Link
                href={`/player/${p.id}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-secondary"
              >
                {p.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.photo}
                    alt={p.name}
                    className="h-12 w-12 shrink-0 rounded-full border border-border object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-secondary">
                    <User className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold text-foreground">{p.name}</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {p.team && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        {p.team.logo && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.team.logo} alt="" className="h-3.5 w-3.5 object-contain" />
                        )}
                        <span className="truncate max-w-[120px]">{p.team.name}</span>
                      </span>
                    )}
                    {p.position && (
                      <span className="rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {translatePos(p.position)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    {p.nationality && <span>{p.nationality}</span>}
                    {p.age && <span>{p.age} yaş</span>}
                    {p.goals !== null && <span>{p.goals} gol</span>}
                    {p.rating && (
                      <span className="font-semibold text-primary">
                        {Number.parseFloat(p.rating).toFixed(1)} puan
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
