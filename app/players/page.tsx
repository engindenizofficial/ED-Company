"use client"

import { LoaderCircle, Search, Star, User } from "lucide-react"
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

const POSITION_FILTERS = [
  { label: "Tümü", value: "" },
  { label: "Kaleci", value: "Goalkeeper" },
  { label: "Defans", value: "Defender" },
  { label: "Orta Saha", value: "Midfielder" },
  { label: "Forvet", value: "Attacker" },
]

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

const POSITION_COLORS: Record<string, string> = {
  Goalkeeper: "var(--accent)",
  Defender: "var(--chart-1)",
  Midfielder: "var(--chart-2)",
  Attacker: "var(--live)",
}

export default function PlayersPage() {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [posFilter, setPosFilter] = useState("")
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

  const players = (data?.players ?? []).filter((p) =>
    posFilter ? p.position === posFilter : true,
  )

  const topRated = players.filter((p) => p.rating && parseFloat(p.rating) >= 7.5).slice(0, 3)

  return (
    <div className="flex flex-col gap-5">
      {/* Search */}
      <label className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Oyuncu ara (en az 3 karakter)..."
          className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
          aria-label="Oyuncu ara"
          style={{ boxShadow: "var(--shadow-card)" }}
        />
        {isLoading && (
          <LoaderCircle className="pointer-events-none absolute right-3 h-4 w-4 animate-spin text-primary" />
        )}
      </label>

      {/* Position filter chips */}
      <div className="flex flex-wrap gap-2">
        {POSITION_FILTERS.map(({ label, value }) => (
          <button
            key={value}
            type="button"
            onClick={() => setPosFilter(value)}
            className="rounded-full px-3.5 py-1.5 text-xs font-bold transition-all duration-200"
            style={
              posFilter === value
                ? {
                    background: value ? POSITION_COLORS[value] ?? "linear-gradient(135deg, var(--brand-from), var(--brand-to))" : "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
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

      {/* Top Rated spotlight */}
      {topRated.length > 0 && !debouncedQuery && (
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">En Yüksek Puanlı</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {topRated.map((p) => (
              <Link
                key={p.id}
                href={`/player/${p.id}`}
                className="group flex flex-col items-center gap-2 rounded-xl p-3 text-center transition-all duration-200 hover:-translate-y-0.5"
                style={{
                  background: "linear-gradient(145deg, color-mix(in oklch, var(--primary) 6%, var(--card)), var(--card))",
                  border: "1px solid color-mix(in oklch, var(--primary) 20%, var(--border))",
                  boxShadow: "var(--shadow-card)",
                }}
              >
                {p.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.photo}
                    alt={p.name}
                    className="h-14 w-14 rounded-full border-2 object-cover transition-transform duration-200 group-hover:scale-105"
                    style={{ borderColor: "color-mix(in oklch, var(--primary) 40%, var(--border))" }}
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
                    <User className="h-7 w-7 text-muted-foreground" />
                  </div>
                )}
                <span className="truncate text-xs font-bold text-foreground">{p.name}</span>
                {p.rating && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-extrabold"
                    style={{
                      background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
                      color: "var(--primary-foreground)",
                    }}
                  >
                    {parseFloat(p.rating).toFixed(1)}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {error ? (
        <div
          className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-destructive"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          Oyuncular yüklenemedi: {error.message}
        </div>
      ) : players.length === 0 && !isLoading ? (
        <div
          className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          {debouncedQuery.length >= 3
            ? `"${debouncedQuery}" için oyuncu bulunamadı.`
            : "Arama yapmak için en az 3 karakter girin."}
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {players.map((p) => {
            const posColor = p.position ? POSITION_COLORS[p.position] : undefined
            return (
              <li key={p.id}>
                <Link
                  href={`/player/${p.id}`}
                  className="group flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-200 hover:-translate-y-0.5"
                  style={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    boxShadow: "var(--shadow-card)",
                  }}
                >
                  {p.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.photo}
                      alt={p.name}
                      className="h-12 w-12 shrink-0 rounded-full border object-cover transition-transform duration-200 group-hover:scale-105"
                      style={{ borderColor: "var(--border)" }}
                    />
                  ) : (
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
                      style={{ background: "var(--secondary)", border: "1px solid var(--border)" }}
                    >
                      <User className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-bold text-foreground group-hover:text-primary">{p.name}</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {p.team && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          {p.team.logo && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.team.logo} alt="" className="h-3.5 w-3.5 object-contain" />
                          )}
                          <span className="max-w-[120px] truncate">{p.team.name}</span>
                        </span>
                      )}
                      {p.position && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{
                            background: posColor ? `color-mix(in oklch, ${posColor} 15%, var(--secondary))` : "var(--secondary)",
                            color: posColor ?? "var(--muted-foreground)",
                            border: `1px solid ${posColor ? `color-mix(in oklch, ${posColor} 30%, var(--border))` : "var(--border)"}`,
                          }}
                        >
                          {translatePos(p.position)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      {p.nationality && <span>{p.nationality}</span>}
                      {p.age && <span>{p.age} yaş</span>}
                      {p.goals !== null && <span>{p.goals} gol</span>}
                      {p.rating && (
                        <span className="font-extrabold" style={{ color: "var(--primary)" }}>
                          {parseFloat(p.rating).toFixed(1)} puan
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
