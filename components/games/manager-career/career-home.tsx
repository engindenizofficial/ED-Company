"use client"

import { useState } from "react"
import Image from "next/image"
import useSWR from "swr"
import { Loader2 } from "lucide-react"
import { useLanguage } from "@/contexts/language-context"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getMyCareerHome, getLeagueTable, getSeasonFixtures, type LeagueTableRow, type FixtureSummary } from "@/app/actions/manager-fixtures"
import { DUEL_SELECTABLE_LEAGUES } from "@/lib/leagues"
import { MatchCenter } from "@/components/games/manager-career/match-center"
import { LeagueTable } from "@/components/games/manager-career/league-table"
import { FixtureList } from "@/components/games/manager-career/fixture-list"

/**
 * Aktif kariyer ana ekranı — kulüp başlığı + sekmeler: sıradaki maç
 * (canlı akış), lig tablosu (tamamen kendi simülasyonumuzdan), sezon
 * takvimi. `getMyCareerHome` sezon fikstürü henüz üretilmemişse (kadro
 * tamamlanır tamamlanmaz veya bu ilk çağrıda) `generateSeasonFixtures`'ı
 * kendi içinde tetikler — bu yüzden burada ek bir "oluştur" adımı yok.
 */
export function CareerHome() {
  const [tab, setTab] = useState("nextMatch")
  const { t } = useLanguage()

  const { data: home, mutate: mutateHome, isLoading: homeLoading } = useSWR("manager-career-home", () => getMyCareerHome())
  const { data: table, mutate: mutateTable } = useSWR(
    home ? "manager-career-table" : null,
    () => getLeagueTable(),
  )
  const { data: fixtures, mutate: mutateFixtures } = useSWR(
    tab === "fixtures" && home ? "manager-career-fixtures" : null,
    () => getSeasonFixtures(),
  )

  function handleMatchResult(nextTable: LeagueTableRow[], nextFixture: FixtureSummary | null, seasonComplete: boolean) {
    mutateTable(nextTable, { revalidate: false })
    mutateFixtures()
    mutateHome((prev) =>
      prev
        ? {
            ...prev,
            nextFixture,
            matchdaysPlayed: seasonComplete ? prev.totalMatchdays : prev.matchdaysPlayed + (nextFixture ? 1 : 0),
          }
        : prev,
      { revalidate: false },
    )
  }

  if (homeLoading || !home) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const league = DUEL_SELECTABLE_LEAGUES.find((l) => l.id === home.leagueId)
  const seasonComplete = home.nextFixture === null && home.matchdaysPlayed >= home.totalMatchdays && home.totalMatchdays > 0

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-4">
        <Image
          src={`/images/manager-logos/${home.logoFile}`}
          alt=""
          width={44}
          height={44}
          className="h-11 w-11 shrink-0 object-contain"
        />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-black tracking-tight text-foreground">{home.clubName}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {league ? t("managerCareer.leagueName", { league: league.name }) : null}
          </p>
        </div>
        {home.totalMatchdays > 0 ? (
          <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
            {t("managerCareer.matchdayProgress", { played: home.matchdaysPlayed, total: home.totalMatchdays })}
          </span>
        ) : (
          <span className="shrink-0 text-xs font-semibold text-muted-foreground">
            {t("managerCareer.generatingFixtures")}
          </span>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="nextMatch">{t("managerCareer.tabNextMatch")}</TabsTrigger>
          <TabsTrigger value="table">{t("managerCareer.tabTable")}</TabsTrigger>
          <TabsTrigger value="fixtures">{t("managerCareer.tabFixtures")}</TabsTrigger>
        </TabsList>

        <TabsContent value="nextMatch" className="mt-4">
          <MatchCenter
            nextFixture={home.nextFixture}
            lastPlayedMatch={home.lastPlayedMatch}
            seasonComplete={seasonComplete}
            onResult={handleMatchResult}
          />
        </TabsContent>

        <TabsContent value="table" className="mt-4">
          {table ? <LeagueTable rows={table} /> : (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </TabsContent>

        <TabsContent value="fixtures" className="mt-4">
          {fixtures ? <FixtureList fixtures={fixtures} /> : (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
