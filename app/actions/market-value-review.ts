"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { isAdminEmail } from "@/lib/admin"
import { db } from "@/lib/db"
import { leagueMarketValue, marketValueLeagueStaging, marketValuePlayerStaging, marketValueReviewQueue, marketValueTeamStaging, playerMarketValue, teamMarketValue } from "@/lib/db/schema"

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
    await db.insert(leagueMarketValue).values({ id: crypto.randomUUID(), leagueId: row.leagueId, leagueName: row.afName, leagueCountry: row.afCountry, transfermarktLeagueName: row.tmName, transfermarktLeagueCountry: row.tmCountry, totalValueEur: row.tmValueEur, matchPercent: row.confidence, lastScrapedAt: new Date() }).onConflictDoNothing()
  } else if (row.entityType === "team") {
    if (!row.afTeamStagingId || !row.tmTeamStagingId) throw new Error("Takım adayı eksik.")
    const [af] = await db.select().from(marketValueTeamStaging).where(eq(marketValueTeamStaging.id, row.afTeamStagingId)).limit(1)
    const [tm] = await db.select().from(marketValueTeamStaging).where(eq(marketValueTeamStaging.id, row.tmTeamStagingId)).limit(1)
    if (!af || !tm) throw new Error("Takım staging kaydı bulunamadı.")
    await db.insert(teamMarketValue).values({ id: crypto.randomUUID(), teamId: Number(af.externalId), leagueId: row.leagueId, teamName: af.name, teamCountry: af.country, transfermarktTeamId: tm.externalId, transfermarktTeamName: tm.name, transfermarktTeamCountry: tm.country, totalValueEur: tm.valueEur, matchConfidence: row.confidence, lastScrapedAt: new Date() }).onConflictDoNothing()
  } else {
    if (!row.afPlayerStagingId || !row.tmPlayerStagingId || !row.afTeamStagingId) throw new Error("Oyuncu adayı eksik.")
    const [afPlayer] = await db.select().from(marketValuePlayerStaging).where(eq(marketValuePlayerStaging.id, row.afPlayerStagingId)).limit(1)
    const [tmPlayer] = await db.select().from(marketValuePlayerStaging).where(eq(marketValuePlayerStaging.id, row.tmPlayerStagingId)).limit(1)
    const [afTeam] = await db.select().from(marketValueTeamStaging).where(eq(marketValueTeamStaging.id, row.afTeamStagingId)).limit(1)
    if (!afPlayer || !tmPlayer || !afTeam) throw new Error("Oyuncu staging kaydı bulunamadı.")
    await db.insert(playerMarketValue).values({ id: crypto.randomUUID(), playerId: Number(afPlayer.externalId), teamId: Number(afTeam.externalId), playerName: afPlayer.name, fullName: tmPlayer.name, playerCountry: afPlayer.country, transfermarktPlayerId: tmPlayer.externalId, transfermarktPlayerCountry: tmPlayer.country, valueEur: tmPlayer.valueEur, matchConfidence: row.confidence, lastScrapedAt: new Date() }).onConflictDoNothing()
  }

  await db.update(marketValueReviewQueue).set({ status: "approved", resolvedAt: new Date() }).where(eq(marketValueReviewQueue.id, id))
  revalidatePath("/admin/market-value-review")
}
