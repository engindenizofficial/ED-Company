"use client"

import { Clock, Star } from "lucide-react"
import { TeamButton } from "@/components/team-panel"
import { LeagueButton } from "@/components/league-panel"
import { cn } from "@/lib/utils"
import { toTurkishCountry } from "@/lib/tr-aliases"
import { useFavorites } from "@/contexts/favorites-context"
import type { Fixture } from "@/lib/types"
import type { FavoriteItem } from "@/contexts/favorites-context"

/** Ana ekranda takım/lig satırlarında kullanılan içi boş/dolu yıldız butonu. */
function FavoriteStarButton({
  active,
  label,
  onToggle,
  size = "sm",
}: {
  active: boolean
  label: string
  onToggle: () => void
  size?: "sm" | "xs"
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onToggle()
      }}
      aria-pressed={active}
      aria-label={active ? `${label} favorilerden kaldır` : `${label} favorilere ekle`}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg text-muted-foreground/40 transition-colors hover:text-primary",
        size === "sm" ? "h-6 w-6" : "h-5 w-5",
      )}
    >
      <Star
        className={cn(size === "sm" ? "h-4 w-4" : "h-3.5 w-3.5", active && "fill-primary text-primary")}
      />
    </button>
  )
}

function kickoff(iso: string): string {
  return new Date(iso).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  })
}

const LIVE_STATUSES = new Set(["1H", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP", "HT"])

function isLive(short: string): boolean {
  return LIVE_STATUSES.has(short)
}

function statusLabel(short: string): string {
  switch (short) {
    case "FT":
      return "MS"
    case "AET":
      return "MS (uzatma)"
    case "PEN":
      return "MS (pen.)"
    case "HT":
      return "İY"
    case "1H":
      return "1. Yarı"
    case "2H":
      return "2. Yarı"
    case "ET":
      return "Uzatma"
    case "BT":
      return "Devre arası"
    case "P":
      return "Penaltılar"
    case "SUSP":
      return "Durduruldu"
    case "INT":
      return "Ara verildi"
    case "PST":
      return "Ertelendi"
    case "CANC":
      return "İptal"
    case "ABD":
      return "Tatil edildi"
    case "TBD":
      return "Belirsiz"
    case "NS":
      return "Başlamadı"
    default:
      return short
  }
}

function liveText(f: Fixture): string {
  if (f.statusShort === "HT") return "İY"
  if (f.statusShort === "BT") return "Devre arası"
  if (f.statusShort === "P") return "Penaltılar"
  if (typeof f.elapsed === "number") {
    if (f.elapsedExtra != null && f.elapsedExtra > 0) {
      return `${f.elapsed}+${f.elapsedExtra}'`
    }
    return `${f.elapsed}'`
  }
  return statusLabel(f.statusShort)
}

function groupByLeague(fixtures: Fixture[]) {
  const groups = new Map<
    number,
    { id: number; name: string; country: string; logo: string; items: Fixture[] }
  >()
  for (const f of fixtures) {
    const key = f.league.id
    if (!groups.has(key)) {
      groups.set(key, {
        id: f.league.id,
        name: f.league.name,
        country: f.league.country,
        logo: f.league.logo,
        items: [],
      })
    }
    groups.get(key)!.items.push(f)
  }
  return Array.from(groups.values())
}

/**
 * Ligler sadece kendi favori sıra numarasına (1, 2, 3...) göre en üste çıkar.
 * Bir takımın favori olması, o takımın maçının bulunduğu ligin diğer tüm
 * maçlarını yukarı çekmemeli — bu yüzden grup sıralaması SADECE lig
 * favorilerine bakar, takım favorilerine bakmaz.
 */
function sortGroupsByFavorites<T extends { id: number; items: Fixture[] }>(
  groups: T[],
  favorites: FavoriteItem[],
): T[] {
  const leaguePosition = new Map<number, number>()
  for (const fav of favorites) {
    if (fav.type === "league") leaguePosition.set(fav.itemId, fav.position)
  }

  if (leaguePosition.size === 0) return groups

  const rankOf = (group: T): number => leaguePosition.get(group.id) ?? Number.POSITIVE_INFINITY

  return groups
    .map((group, index) => ({ group, rank: rankOf(group), index }))
    .sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.index - b.index))
    .map((entry) => entry.group)
}

/**
 * Bir lig grubu içinde, favori bir takımın maçı varsa SADECE o maç grubun
 * en üstüne çıkar; grubun diğer maçları kendi orijinal sırasında kalır.
 */
function sortFixturesByFavoriteTeam(fixtures: Fixture[], favorites: FavoriteItem[]): Fixture[] {
  const teamPosition = new Map<number, number>()
  for (const fav of favorites) {
    if (fav.type === "team") teamPosition.set(fav.itemId, fav.position)
  }
  if (teamPosition.size === 0) return fixtures

  const rankOf = (f: Fixture): number => {
    const homeRank = teamPosition.get(f.home.id)
    const awayRank = teamPosition.get(f.away.id)
    if (homeRank === undefined && awayRank === undefined) return Number.POSITIVE_INFINITY
    if (homeRank === undefined) return awayRank!
    if (awayRank === undefined) return homeRank
    return Math.min(homeRank, awayRank)
  }

  return fixtures
    .map((f, index) => ({ f, rank: rankOf(f), index }))
    .sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.index - b.index))
    .map((entry) => entry.f)
}

export function FixtureList({
  fixtures,
  selectedId,
  onSelect,
  favorites = [],
}: {
  fixtures: Fixture[]
  selectedId: number | null
  onSelect: (f: Fixture) => void
  favorites?: FavoriteItem[]
}) {
  const { isFavorite, toggleFavorite } = useFavorites()
  const groups = sortGroupsByFavorites(groupByLeague(fixtures), favorites)

  const leagueFavoriteIds = new Set(favorites.filter((f) => f.type === "league").map((f) => f.itemId))
  const teamFavoriteIds = new Set(favorites.filter((f) => f.type === "team").map((f) => f.itemId))

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => {
        const leagueIsFavorite = leagueFavoriteIds.has(group.id)
        return (
        <div key={group.id} className="flex flex-col gap-1.5">
          {/* League header */}
          <div className="flex items-center gap-2 px-1 pb-1">
            {group.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={group.logo || "/placeholder.svg"} alt="" className="h-[18px] w-[18px] object-contain opacity-90" />
            ) : null}
            <LeagueButton
              league={{ id: group.id, name: group.name, logo: group.logo, country: group.country, flagUrl: null }}
              className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground hover:text-primary transition-colors"
            >
              {group.name}
              <span className="ml-1.5 font-normal opacity-60">{toTurkishCountry(group.country)}</span>
            </LeagueButton>
            <FavoriteStarButton
              active={leagueIsFavorite}
              label={group.name}
              size="xs"
              onToggle={() =>
                toggleFavorite({
                  type: "league",
                  itemId: group.id,
                  name: group.name,
                  logo: group.logo,
                  country: group.country,
                  flagUrl: null,
                })
              }
            />
            <div className="ml-auto h-px flex-1 bg-border/60" />
            <span className="text-[10px] tabular-nums text-muted-foreground/50">{group.items.length}</span>
          </div>

          {/* Fixture cards */}
          <ul className="flex flex-col gap-1">
            {sortFixturesByFavoriteTeam(group.items, favorites).map((f) => {
              const active = f.id === selectedId
              const live = isLive(f.statusShort)
              const played = f.statusShort !== "NS" && f.statusShort !== "TBD" && f.statusShort !== "PST"
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(f)}
                    aria-pressed={active}
                    className={cn(
                      "group w-full rounded-xl border px-4 py-3 text-left transition-all duration-150",
                      active
                        ? "border-primary/60 bg-primary/[0.07] shadow-sm"
                        : "border-border/70 bg-card hover:border-border hover:bg-card/80",
                    )}
                  >
                    <div className="flex items-center gap-4">
                      {/* Teams column */}
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <TeamRow
                          id={f.home.id}
                          name={f.home.name}
                          logo={f.home.logo}
                          goals={f.goalsHome}
                          played={played}
                          isFavorite={teamFavoriteIds.has(f.home.id)}
                          onToggleFavorite={() =>
                            toggleFavorite({
                              type: "team",
                              itemId: f.home.id,
                              name: f.home.name,
                              logo: f.home.logo,
                              country: null,
                              flagUrl: null,
                            })
                          }
                        />
                        <TeamRow
                          id={f.away.id}
                          name={f.away.name}
                          logo={f.away.logo}
                          goals={f.goalsAway}
                          played={played}
                          isFavorite={teamFavoriteIds.has(f.away.id)}
                          onToggleFavorite={() =>
                            toggleFavorite({
                              type: "team",
                              itemId: f.away.id,
                              name: f.away.name,
                              logo: f.away.logo,
                              country: null,
                              flagUrl: null,
                            })
                          }
                        />
                      </div>

                      {/* Divider */}
                      <div className="h-9 w-px bg-border/50" />

                      {/* Status column */}
                      <div className="flex w-16 shrink-0 flex-col items-center gap-1">
                        {live ? (
                          <>
                            <span className="flex items-center gap-1 text-[10px] font-bold tabular-nums text-destructive">
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" />
                              CANLI
                            </span>
                            <span className="text-[11px] font-semibold tabular-nums text-foreground">{liveText(f)}</span>
                          </>
                        ) : played ? (
                          <>
                            <span className="text-[10px] font-medium text-muted-foreground/60">Tamamlandı</span>
                            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{statusLabel(f.statusShort)}</span>
                          </>
                        ) : (
                          <>
                            <span className="text-[10px] text-muted-foreground/60">Başlangıç</span>
                            <span className="flex items-center gap-1 text-[13px] font-bold tabular-nums text-foreground">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              {kickoff(f.date)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
        )
      })}
    </div>
  )
}

function TeamRow({
  id,
  name,
  logo,
  goals,
  played,
  isFavorite,
  onToggleFavorite,
}: {
  id: number
  name: string
  logo: string
  goals: number | null
  played: boolean
  isFavorite: boolean
  onToggleFavorite: () => void
}) {
  return (
    <div className="flex items-center gap-2.5">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo || "/placeholder.svg"} alt="" className="h-5 w-5 shrink-0 object-contain" />
      ) : (
        <div className="h-5 w-5 shrink-0 rounded-full bg-secondary" />
      )}
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <TeamButton
          team={{ id, name, logo }}
          className="min-w-0 shrink truncate text-sm font-semibold text-foreground hover:text-primary transition-colors"
        >
          {name}
        </TeamButton>
        <FavoriteStarButton active={isFavorite} label={name} size="xs" onToggle={onToggleFavorite} />
      </div>
      {played ? (
        <span className="ml-auto text-base font-black tabular-nums text-foreground">{goals ?? 0}</span>
      ) : null}
    </div>
  )
}
