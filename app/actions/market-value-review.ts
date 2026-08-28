"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { isAdminEmail } from "@/lib/admin"
import { db } from "@/lib/db"
import { leagueMarketValue, marketValueCronRun, marketValueLeagueStaging, marketValuePlayerStaging, marketValueReviewQueue, marketValueTeamStaging, playerMarketValue, teamMarketValue } from "@/lib/db/schema"
import { matchPlayersForStagedTeams } from "@/lib/market-value-cron-run"
import { combinedMatchScore, countrySimilarityScore, playerSimilarityScore, similarityScore, teamSimilarityScore } from "@/lib/market-value-matcher"

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!isAdminEmail(session?.user?.email)) throw new Error("Unauthorized")
}

export async function approveReviewEntry(id: string) {
  await requireAdmin()
  const [row] = await db.select().from(marketValueReviewQueue).where(and(eq(marketValueReviewQueue.id, id), eq(marketValueReviewQueue.status, "pending"))).limit(1)
  if (!row) throw new Error("Review kaydı bulunamadı.")
  if (!row.tmName) throw new Error("Onaylanabilecek Transfermarkt adayı yok.")

  if (row.entityType === "league") {
    const [league] = await db.select().from(marketValueLeagueStaging).where(and(eq(marketValueLeagueStaging.runId, row.runId), eq(marketValueLeagueStaging.leagueId, row.leagueId))).limit(1)
    if (!league) throw new Error("Lig staging kaydı bulunamadı.")
    const nameMatchPercent = similarityScore(row.afName, row.tmName)
    const countryMatchPercent = row.afCountry && row.tmCountry ? countrySimilarityScore(row.afCountry, row.tmCountry) : null
    const matchPercent = combinedMatchScore(nameMatchPercent, countryMatchPercent)
    await db.insert(leagueMarketValue).values({ id: crypto.randomUUID(), leagueId: row.leagueId, leagueName: row.afName, leagueCountry: row.afCountry, transfermarktLeagueName: row.tmName, transfermarktLeagueCountry: row.tmCountry, totalValueEur: row.tmValueEur, nameMatchPercent, countryMatchPercent, matchPercent, matchStatus: "matched", lastScrapedAt: new Date() }).onConflictDoNothing()
  } else if (row.entityType === "team") {
    if (!row.afTeamStagingId || !row.tmTeamStagingId) throw new Error("Takım adayı eksik.")
    const [af] = await db.select().from(marketValueTeamStaging).where(eq(marketValueTeamStaging.id, row.afTeamStagingId)).limit(1)
    const [tm] = await db.select().from(marketValueTeamStaging).where(eq(marketValueTeamStaging.id, row.tmTeamStagingId)).limit(1)
    if (!af || !tm) throw new Error("Takım staging kaydı bulunamadı.")
    const nameMatchPercent = teamSimilarityScore(af.name, tm.name)
    const countryMatchPercent = af.country && tm.country ? countrySimilarityScore(af.country, tm.country) : null
    const matchConfidence = combinedMatchScore(nameMatchPercent, countryMatchPercent)
    await db.insert(teamMarketValue).values({ id: crypto.randomUUID(), teamId: Number(af.externalId), leagueId: row.leagueId, teamName: af.name, teamCountry: af.country, transfermarktTeamId: tm.externalId, transfermarktTeamName: tm.name, transfermarktTeamCountry: tm.country, totalValueEur: tm.valueEur, nameMatchPercent, countryMatchPercent, matchConfidence, matchStatus: "matched", lastScrapedAt: new Date() }).onConflictDoNothing()
    const [run] = await db.select().from(marketValueCronRun).where(eq(marketValueCronRun.id, row.runId)).limit(1)
    if (!run) throw new Error("Tarama kaydı bulunamadı.")
    await matchPlayersForStagedTeams(run, row.leagueId, af.id, tm.id)
  } else {
    if (!row.afPlayerStagingId || !row.tmPlayerStagingId || !row.afTeamStagingId) throw new Error("Oyuncu adayı eksik.")
    const [afPlayer] = await db.select().from(marketValuePlayerStaging).where(eq(marketValuePlayerStaging.id, row.afPlayerStagingId)).limit(1)
    const [tmPlayer] = await db.select().from(marketValuePlayerStaging).where(eq(marketValuePlayerStaging.id, row.tmPlayerStagingId)).limit(1)
    const [afTeam] = await db.select().from(marketValueTeamStaging).where(eq(marketValueTeamStaging.id, row.afTeamStagingId)).limit(1)
    if (!afPlayer || !tmPlayer || !afTeam) throw new Error("Oyuncu staging kaydı bulunamadı.")
    const nameMatchPercent = playerSimilarityScore(afPlayer.name, tmPlayer.name)
    const countryMatchPercent = afPlayer.country && tmPlayer.country ? countrySimilarityScore(afPlayer.country, tmPlayer.country) : null
    const matchConfidence = combinedMatchScore(nameMatchPercent, countryMatchPercent)
    await db.insert(playerMarketValue).values({ id: crypto.randomUUID(), playerId: Number(afPlayer.externalId), teamId: Number(afTeam.externalId), playerName: afPlayer.name, fullName: tmPlayer.name, playerCountry: afPlayer.country, transfermarktPlayerId: tmPlayer.externalId, transfermarktPlayerCountry: tmPlayer.country, valueEur: tmPlayer.valueEur, nameMatchPercent, countryMatchPercent, matchConfidence, matchStatus: "matched", lastScrapedAt: new Date() }).onConflictDoNothing()
  }

  await db.update(marketValueReviewQueue).set({ status: "approved", resolvedAt: new Date() }).where(eq(marketValueReviewQueue.id, id))
  revalidatePath("/admin/market-value-review")
}
