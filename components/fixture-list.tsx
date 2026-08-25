"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import dynamic from "next/dynamic"
import { Clock, Star } from "lucide-react"
import { TeamButton } from "@/components/team-panel"
import { LeagueButton } from "@/components/league-panel"
import { useGoalCelebrationQueue } from "@/hooks/use-goal-celebration-queue"
import { cn } from "@/lib/utils"
import { toDisplayCountry } from "@/lib/tr-aliases"
import { useFavorites } from "@/contexts/favorites-context"
import { useLanguage } from "@/contexts/language-context"
import { useCountry } from "@/contexts/country-context"
import { getNationalTeamName } from "@/lib/national-teams"
import type { Locale } from "@/lib/i18n/dictionaries"
import type { Fixture } from "@/lib/types"
import type { FavoriteItem } from "@/contexts/favorites-context"

// "motion" kütüphanesini ana sayfa paketinden çıkarmak için gol kutlaması
// talep üzerine (sadece gerçekten bir kutlama gösterilecekse) yükleniyor.
// Bkz. components/goal-celebration-lazy.tsx.
const GoalCelebrationLazy = dynamic(
  () => import("@/components/goal-celebration-lazy").then((m) => m.GoalCelebrationLazy),
  { ssr: false },
)

/** Bir favori eklendiğinde yıldızın etrafına saçılan, kısa ömürlü parçacıklar. */
const BURST_PARTICLE_COUNT = 8

function FavoriteBurst() {
  const particles = Array.from({ length: BURST_PARTICLE_COUNT }, (_, i) => {
    const angle = (i / BURST_PARTICLE_COUNT) * Math.PI * 2
    const distance = 16 + (i % 2) * 6
    const x = Math.cos(angle) * distance
    const y = Math.sin(angle) * distance
    return { x, y, delay: (i % 3) * 20 }
  })

  return (
    <span className="pointer-events-none absolute inset-0 z-20" aria-hidden="true">
      {particles.map((p, i) => (
        <span
          key={i}
          className="favorite-burst-particle absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-primary"
          style={
            {
              "--burst-x": `${p.x}px`,
              "--burst-y": `${p.y}px`,
              animationDelay: `${p.delay}ms`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  )
}

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
  const { t } = useLanguage()
  const [bursting, setBursting] = useState(false)

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        // Favoriye eklenirken (çıkarılırken değil) küçük bir kutlama patlaması göster.
        if (!active) {
          setBursting(true)
          setTimeout(() => setBursting(false), 600)
        }
        onToggle()
      }}
      aria-pressed={active}
  aria-label={
  active
  ? t("fixtureList.removeFromFavorites", { name: label })
  : t("fixtureList.addToFavorites", { name: label })
  }
  className={cn(
  "relative flex shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-primary pointer-events-auto",
      // before:-inset-* görünmez bir dokunma alanı ekler: yıldız ikonu görsel
      // olarak küçük kalır ama gerçek tıklanabilir alan ~44x44px'e ulaşır
      // (Lighthouse "dokunma hedefleri yeterli boyuta sahip değil" uyarısı).
      size === "sm" ? "h-6 w-6 before:absolute before:-inset-2.5 before:content-['']" : "h-5 w-5 before:absolute before:-inset-3 before:content-['']",
  )}
  >
      {bursting ? <FavoriteBurst /> : null}
      <Star
        key={active ? "on" : "off"}
        className={cn(
          size === "sm" ? "h-4 w-4" : "h-3.5 w-3.5",
          active && "fill-primary text-primary",
          bursting && "favorite-star-pop",
        )}
      />
    </button>
  )
}

function kickoff(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleTimeString(locale === "tr" ? "tr-TR" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  })
}

const LIVE_STATUSES = new Set(["1H", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP", "HT"])

function isLive(short: string): boolean {
  return LIVE_STATUSES.has(short)
}

function statusLabel(short: string, t: (key: string) => string): string {
  return t(`matchStatus.${short}`)
}

function liveText(f: Fixture, t: (key: string) => string): string {
  if (f.statusShort === "HT") return t("matchStatus.HT")
  if (f.statusShort === "BT") return t("matchStatus.BT")
  if (f.statusShort === "P") return t("matchStatus.P")
  if (typeof f.elapsed === "number") {
    if (f.elapsedExtra != null && f.elapsedExtra > 0) {
      return `${f.elapsed}+${f.elapsedExtra}'`
    }
    return `${f.elapsed}'`
  }
  return statusLabel(f.statusShort, t)
}

/**
 * Ülke önceliği bloğunun yalnızca Erkek A Takım (senior men's first team)
 * maçlarını kapsaması için U19/U20/U21/U23, genç, kadın ve rezerv takım
 * liglerini eler. API-Football bu ligleri isimlerinde bu ibarelerle işaretler.
 */
const NON_SENIOR_MEN_LEAGUE_PATTERN =
  /\b(u1[5-9]|u2[0-3]|women|w-league|femin(e|il)|kadin|kadın|youth|genc|genç|reserve|reserves|yedek|b[- ]?team|academy)\b/i

function isSeniorMenLeague(leagueName: string): boolean {
  return !NON_SENIOR_MEN_LEAGUE_PATTERN.test(leagueName)
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

/** Ekranda gösterilecek tek bir blok (lig grubu ya da favori takım/milli takım için ayrılmış mini blok). */
interface RenderGroup {
  key: string
  id: number
  name: string
  country: string
  logo: string
  items: Fixture[]
  /**
   * 0 = favori lig (en üstte), 1 = favori takım için ayrılan blok,
   * 2 = kullanıcının ülkesine ait öncelik bloğu — ya kullanıcının ülkesinde
   *     oynanan bir kulüp ligi (örn. TR kullanıcı için Süper Lig, dolayısıyla
   *     Galatasaray, İstanbulspor gibi tüm kulüp maçları) ya da kullanıcının
   *     ülkesinin Erkek A Milli Takım maçı,
   * 3 = normal sıradaki lig. Favoriler her zaman ülke önceliğinden üstte kalır.
   */
  tier: 0 | 1 | 2 | 3
  rank: number
  order: number
}

function sortFixturesByFavoriteTeam(fixtures: Fixture[], teamPosition: Map<number, number>): Fixture[] {
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

/**
 * Görüntülenecek blokları oluşturur:
 * - Favori bir lig ise: tüm lig bloğu en üste çıkar (içindeki favori takımın
 *   maçı da o blok içinde en üstte gösterilir).
 * - Favori olmayan bir ligde favori bir takımın maçı varsa: SADECE o maç(lar)
 *   ayrı, "{lig adı}" başlıklı yeni bir blok olarak en üste (favori liglerin
 *   altına) taşınır. Aynı ligin diğer maçları kendi orijinal konumunda,
 *   ayrı bir blok olarak kalır.
 * - Favorisi olmayan ligler kendi orijinal sırasında değişmeden kalır.
 */
function buildRenderGroups(
  fixtures: Fixture[],
  favorites: FavoriteItem[],
  countryName: string | null,
): RenderGroup[] {
  const leaguePosition = new Map<number, number>()
  const teamPosition = new Map<number, number>()
  for (const fav of favorites) {
    if (fav.type === "league") leaguePosition.set(fav.itemId, fav.position)
    else teamPosition.set(fav.itemId, fav.position)
  }

  const baseGroups = groupByLeague(fixtures)
  const renderGroups: RenderGroup[] = []

  baseGroups.forEach((group, order) => {
    const leagueRank = leaguePosition.get(group.id)

    if (leagueRank !== undefined) {
      // Lig favorilendi: tüm blok en üste çıkar, içindeki favori takım en üstte gösterilir.
      renderGroups.push({
        key: `league-${group.id}`,
        id: group.id,
        name: group.name,
        country: group.country,
        logo: group.logo,
        items: sortFixturesByFavoriteTeam(group.items, teamPosition),
        tier: 0,
        rank: leagueRank,
        order,
      })
      return
    }

    // Lig favori değil: favori takımın maçlarını ayrı bir bloğa çıkar.
    const pinned: Fixture[] = []
    const remainder: Fixture[] = []
    for (const f of group.items) {
      const isFavoriteTeamMatch = teamPosition.has(f.home.id) || teamPosition.has(f.away.id)
      if (isFavoriteTeamMatch) pinned.push(f)
      else remainder.push(f)
    }

    if (pinned.length > 0) {
      const pinnedRank = Math.min(
        ...pinned.map((f) =>
          Math.min(teamPosition.get(f.home.id) ?? Number.POSITIVE_INFINITY, teamPosition.get(f.away.id) ?? Number.POSITIVE_INFINITY),
        ),
      )
      renderGroups.push({
        key: `team-pin-${group.id}`,
        id: group.id,
        name: group.name,
        country: group.country,
        logo: group.logo,
        items: sortFixturesByFavoriteTeam(pinned, teamPosition),
        tier: 1,
        rank: pinnedRank,
        order,
      })
    }

    if (remainder.length === 0) return

    // Ligin ülkesi doğrudan kullanıcının ülkesiyle eşleşiyorsa (örn. TR
    // kullanıcı için "Süper Lig" -> country: "Turkey") VE bu lig Erkek A
    // Takım seviyesindeyse (U19/U21/Kadınlar/Rezerv ligleri hariç), bu kulüp
    // ligindeki TÜM kalan maçlar (Galatasaray, İstanbulspor, vb. fark
    // etmeksizin) ülke önceliği bloğuna taşınır.
    const isDomesticLeague =
      countryName !== null && group.country === countryName && isSeniorMenLeague(group.name)

    if (isDomesticLeague) {
      renderGroups.push({
        key: `league-${group.id}`,
        id: group.id,
        name: group.name,
        country: group.country,
        logo: group.logo,
        items: remainder,
        tier: 2,
        rank: Number.POSITIVE_INFINITY,
        order,
      })
      return
    }

    // Yabancı lig: sadece kullanıcının ülkesinin Erkek A Milli Takım maçı
    // varsa, o maç(lar) ayrı bir üst blok olarak çıkar; ligin diğer maçları
    // (örn. yabancı takımların birbiriyle oynadığı maçlar) yerinde kalır.
    const nationalPinned: Fixture[] = []
    const rest: Fixture[] = []
    for (const f of remainder) {
      const isNationalTeamMatch = countryName !== null && (f.home.name === countryName || f.away.name === countryName)
      if (isNationalTeamMatch) nationalPinned.push(f)
      else rest.push(f)
    }

    if (nationalPinned.length > 0) {
      renderGroups.push({
        key: `national-pin-${group.id}`,
        id: group.id,
        name: group.name,
        country: group.country,
        logo: group.logo,
        items: nationalPinned,
        tier: 2,
        rank: Number.POSITIVE_INFINITY,
        order,
      })
    }

    if (rest.length > 0) {
      renderGroups.push({
        key: `league-${group.id}`,
        id: group.id,
        name: group.name,
        country: group.country,
        logo: group.logo,
        items: rest,
        tier: 3,
        rank: Number.POSITIVE_INFINITY,
        order,
      })
    }
  })

  return renderGroups.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier
    if (a.tier === 2 || a.tier === 3) return a.order - b.order
    return a.rank !== b.rank ? a.rank - b.rank : a.order - b.order
  })
}

// Ana sayfada ilk ekranda görünen lig grubu sayısı — bunlar her zaman anında
// (gözlemci beklemeden) mount edilir. Sayfa daha aşağıdaki gruplar
// `LazyFixtureGroup` tarafından ekrana yaklaşana kadar hiç render edilmez.
const EAGER_GROUP_COUNT = 3

/**
 * Bir lig grubunun maç kartlarını, kullanıcı o gruba yaklaşana kadar hiç
 * mount etmeden geciktirir. `content-visibility: auto` sadece tarayıcının
 * layout/paint işini atlatıyordu, ama React yine de her FixtureCard için
 * component fonksiyonunu çalıştırıp hook'ları/effect'leri tetikliyordu —
 * asıl "ana iş parçacığı çalışması" (TBT) buradan geliyordu. Bu sarmalayıcı,
 * IntersectionObserver ekrana ~800px yaklaşana kadar gerçek kartlar yerine
 * doğru yükseklikte boş bir placeholder render ederek o JS çalışmasının
 * kendisini erteliyor. Bir kez mount olduktan sonra hiç unmount olmaz —
 * canlı skor güncellemeleri kaybolmasın.
 */
function LazyFixtureGroup({
  eager,
  estimatedHeight,
  children,
}: {
  eager: boolean
  estimatedHeight: number
  children: React.ReactNode
}) {
  const [mounted, setMounted] = useState(eager)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (mounted) return
    const el = ref.current
    if (!el || typeof IntersectionObserver === "undefined") {
      setMounted(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setMounted(true)
          observer.disconnect()
        }
      },
      { rootMargin: "800px 0px" },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [mounted])

  if (!mounted) {
    return <div ref={ref} style={{ height: estimatedHeight }} aria-hidden="true" />
  }
  return <div ref={ref}>{children}</div>
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
  const { t, locale } = useLanguage()
  const { countryCode } = useCountry()
  const countryName = getNationalTeamName(countryCode)
  const groups = buildRenderGroups(fixtures, favorites, countryName)

  const leagueFavoriteIds = new Set(favorites.filter((f) => f.type === "league").map((f) => f.itemId))
  const teamFavoriteIds = new Set(favorites.filter((f) => f.type === "team").map((f) => f.itemId))

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group, groupIndex) => {
        const leagueIsFavorite = leagueFavoriteIds.has(group.id)
        // Ana sayfada aynı anda 150-200+ maç kartı render edilebiliyor (her
        // biri kendi hook'ları, useEffect'leri ve AnimatePresence'ı olan
        // FixtureCard). Hepsi mount olsaydı React her birinin fonksiyonunu
        // hemen çalıştırıp Lighthouse'un "ana iş parçacığı çalışması"/TBT
        // metriklerini şişirirdi. İlk birkaç lig hariç, gruplar
        // `LazyFixtureGroup` ile kullanıcı yaklaşana kadar hiç mount edilmez.
        // `content-visibility: auto` da zaten mount olmuş ama ekran dışında
        // kalan gruplar için tarayıcının layout/paint işini atlatır;
        // `contain-intrinsic-size` ilk kaydırmada ani bir layout sıçramasını
        // (CLS) önlemek için maç sayısına göre kabaca bir yükseklik ayırır.
        const estimatedHeight = 28 + group.items.length * 92
        return (
        <div
          key={group.key}
          className="flex flex-col gap-1.5 [content-visibility:auto]"
          style={{ containIntrinsicSize: `auto ${estimatedHeight}px` } as CSSProperties}
        >
          {/* League header */}
          <div className="flex items-center gap-2 px-1 pb-1">
            {group.logo ? (
              // Bazı lig logoları (özellikle tek renkli/çizgi logolar) şeffaf arka
              // planla gelir ve siyah öğeler koyu temada arka planla aynı renge
              // karışıp kaybolur. Sabit beyaz bir zemin, temadan bağımsız olarak
              // her zaman kontrast sağlar.
              <span className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full bg-white p-[3px] shadow-sm ring-1 ring-border/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={group.logo || "/placeholder.svg"}
                  alt=""
                  className="h-full w-full object-contain"
                  width={20}
                  height={20}
                  loading="lazy"
                  decoding="async"
                />
              </span>
            ) : null}
            <LeagueButton
              league={{ id: group.id, name: group.name, logo: group.logo, country: group.country, flagUrl: null }}
              className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-primary"
            >
              {group.name}
              <span className="ml-1.5 font-normal">{toDisplayCountry(group.country, locale)}</span>
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
            <span className="text-[10px] tabular-nums text-muted-foreground">{group.items.length}</span>
          </div>

          {/* Fixture cards */}
          <LazyFixtureGroup eager={groupIndex < EAGER_GROUP_COUNT} estimatedHeight={group.items.length * 92}>
            <ul className="flex flex-col gap-1">
              {group.items.map((f, index) => (
                <FixtureCard
                  key={f.id}
                  f={f}
                  index={index}
                  active={f.id === selectedId}
                  onSelect={onSelect}
                  teamFavoriteIds={teamFavoriteIds}
                />
              ))}
            </ul>
          </LazyFixtureGroup>
        </div>
        )
      })}
    </div>
  )
}

function FixtureCard({
  f,
  index,
  active,
  onSelect,
  teamFavoriteIds,
}: {
  f: Fixture
  index: number
  active: boolean
  onSelect: (f: Fixture) => void
  teamFavoriteIds: Set<number>
}) {
  const { toggleFavorite } = useFavorites()
  const { t, locale } = useLanguage()
  const live = isLive(f.statusShort)
  const played = f.statusShort !== "NS" && f.statusShort !== "TBD" && f.statusShort !== "PST"
  // fixtureId ve live parametreleri sadece burada (ana ekran) verilir —
  // "geri dönüşte kaçırılan tek golü göster" özelliği bu yüzden analiz
  // paneline sızmaz, sadece ana ekrandaki maç kartlarında çalışır.
  const { current: celebration, advance, currentKey } = useGoalCelebrationQueue(f.goalsHome, f.goalsAway, f.id, live)

  return (
    <li>
      <div
        className={cn(
          "fixture-in-card group relative isolate w-full rounded-xl border px-4 py-3 text-left transition-all duration-200",
          active
            ? "border-primary/60 bg-primary/[0.07] shadow-sm"
            : "border-border/70 bg-card hover:-translate-y-0.5 hover:border-border hover:bg-card/80 hover:shadow-md",
        )}
        style={{ "--stagger-delay": `${Math.min(index * 35, 350)}ms` } as CSSProperties}
      >
        {live ? (
          <span
            key={`${f.goalsHome}-${f.goalsAway}`}
            className="goal-row-flash pointer-events-none absolute inset-0 z-0 rounded-xl bg-primary/10"
            aria-hidden="true"
          />
        ) : null}
        <button
          type="button"
          onClick={() => onSelect(f)}
          aria-pressed={active}
          aria-label={t("fixtureList.viewMatch", { home: f.home.name, away: f.away.name })}
          className="absolute inset-0 z-0 cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="relative z-10 flex items-center gap-4 pointer-events-none">
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
                  <span className="relative flex h-1.5 w-1.5 shrink-0 items-center justify-center">
                    <span className="live-ping-ring absolute inset-0 rounded-full bg-destructive" />
                    <span className="relative h-1.5 w-1.5 rounded-full bg-destructive" />
                  </span>
                  {t("matchStatus.liveBadge")}
                </span>
                <span className="text-[11px] font-semibold tabular-nums text-foreground">{liveText(f, t)}</span>
              </>
            ) : played ? (
              <>
                <span className="text-[10px] font-medium text-muted-foreground">{t("matchStatus.completed")}</span>
                <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{statusLabel(f.statusShort, t)}</span>
              </>
            ) : (
              <>
                <span className="text-[10px] text-muted-foreground">{t("matchStatus.kickoffLabel")}</span>
                <span className="flex items-center gap-1 text-[13px] font-bold tabular-nums text-foreground">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  {kickoff(f.date, locale)}
                </span>
              </>
            )}
          </div>
        </div>

          {/* Takıma özel, 5 saniyelik gol kutlama animasyonu — sadece bu kartı
              kaplar, tam ekran değildir. "motion" kütüphanesi burada
              `next/dynamic` ile talep üzerine yükleniyor. */}
          {celebration ? (
            <GoalCelebrationLazy
              celebration={celebration}
              currentKey={currentKey}
              fixtureId={f.id}
              homeTeamName={f.home.name}
              awayTeamName={f.away.name}
              homeTeamLogo={f.home.logo}
              awayTeamLogo={f.away.logo}
              onDone={advance}
            />
          ) : null}
      </div>
    </li>
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
  // Skor önceki değerinden yükseldiğinde ("gol!") skor sayısına kısa bir
  // zıplama + renk parlaması animasyonu uygulanır.
  const prevGoalsRef = useRef(goals)
  const [justScored, setJustScored] = useState(false)

  useEffect(() => {
    const prev = prevGoalsRef.current
    if (prev !== null && goals !== null && goals > prev) {
      setJustScored(true)
      const timeout = setTimeout(() => setJustScored(false), 700)
      prevGoalsRef.current = goals
      return () => clearTimeout(timeout)
    }
    prevGoalsRef.current = goals
  }, [goals])

  return (
    <div className="flex items-center gap-2.5">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo || "/placeholder.svg"} alt="" className="h-5 w-5 shrink-0 object-contain" width={20} height={20} loading="lazy" decoding="async" />
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
        <span
          className={cn(
            "ml-auto text-base font-black tabular-nums text-foreground",
            justScored && "goal-score-pop",
          )}
        >
          {goals ?? 0}
        </span>
      ) : null}
    </div>
  )
}
