import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  account,
  favorite,
  managerCareer,
  managerFixture,
  managerSquadPlayer,
  managerTeamStrength,
  marketValueDuelDailyResult,
  marketValueDuelStats,
  userPreferences,
} from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id
  const [accounts, preferences, favorites, duelStats, dailyResults, careers] = await Promise.all([
    db
      .select({
        providerId: account.providerId,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      })
      .from(account)
      .where(eq(account.userId, userId)),
    db
      .select({
        themeColor: userPreferences.themeColor,
        locale: userPreferences.locale,
        notificationsEnabled: userPreferences.notificationsEnabled,
        createdAt: userPreferences.createdAt,
        updatedAt: userPreferences.updatedAt,
      })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId)),
    db
      .select({
        id: favorite.id,
        type: favorite.type,
        itemId: favorite.itemId,
        name: favorite.name,
        logo: favorite.logo,
        country: favorite.country,
        flagUrl: favorite.flagUrl,
        position: favorite.position,
        createdAt: favorite.createdAt,
      })
      .from(favorite)
      .where(eq(favorite.userId, userId)),
    db
      .select({
        difficulty: marketValueDuelStats.difficulty,
        leagueScope: marketValueDuelStats.leagueScope,
        gamesPlayed: marketValueDuelStats.gamesPlayed,
        totalCorrect: marketValueDuelStats.totalCorrect,
        totalAnswers: marketValueDuelStats.totalAnswers,
        highScore: marketValueDuelStats.highScore,
        bestStreak: marketValueDuelStats.bestStreak,
        createdAt: marketValueDuelStats.createdAt,
        updatedAt: marketValueDuelStats.updatedAt,
      })
      .from(marketValueDuelStats)
      .where(eq(marketValueDuelStats.userId, userId)),
    db
      .select({
        dayKey: marketValueDuelDailyResult.dayKey,
        answers: marketValueDuelDailyResult.answers,
        score: marketValueDuelDailyResult.score,
        correctCount: marketValueDuelDailyResult.correctCount,
        remainingLives: marketValueDuelDailyResult.remainingLives,
        bestStreak: marketValueDuelDailyResult.bestStreak,
        durationMs: marketValueDuelDailyResult.durationMs,
        startedAt: marketValueDuelDailyResult.startedAt,
        finishedAt: marketValueDuelDailyResult.finishedAt,
      })
      .from(marketValueDuelDailyResult)
      .where(eq(marketValueDuelDailyResult.userId, userId)),
    db
      .select()
      .from(managerCareer)
      .where(eq(managerCareer.userId, userId)),
  ])

  const career = careers[0] ?? null
  const [squad, fixtures, teamStrengths] = career
    ? await Promise.all([
        db.select().from(managerSquadPlayer).where(eq(managerSquadPlayer.careerId, career.id)),
        db.select().from(managerFixture).where(eq(managerFixture.careerId, career.id)),
        db.select().from(managerTeamStrength).where(eq(managerTeamStrength.careerId, career.id)),
      ])
    : [[], [], []]

  const exportedAt = new Date()
  const payload = {
    exportVersion: 1,
    exportedAt: exportedAt.toISOString(),
    profile: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      emailVerified: session.user.emailVerified,
      image: session.user.image,
      createdAt: session.user.createdAt,
      updatedAt: session.user.updatedAt,
    },
    signInMethods: accounts,
    preferences: preferences[0] ?? null,
    favorites,
    games: {
      marketValueDuel: duelStats,
      dailyChallenges: dailyResults,
      managerCareer: career ? { career, squad, fixtures, teamStrengths } : null,
    },
  }

  const date = exportedAt.toISOString().slice(0, 10)
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="ed-analytics-data-${date}.json"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
