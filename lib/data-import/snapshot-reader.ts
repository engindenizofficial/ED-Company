import { and, desc, eq, isNotNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { dataImportRun, transfermarktPlayer } from '@/lib/db/schema'

export async function getTransfermarktDuelPlayers(limit = 2) {
  try {
    const run = await db.query.dataImportRun.findFirst({ where: and(eq(dataImportRun.source, 'transfermarkt'), eq(dataImportRun.status, 'completed')), orderBy: [desc(dataImportRun.finishedAt)] })
    if (!run) return []
    return db.select({ id: transfermarktPlayer.sourceId, name: transfermarktPlayer.name, team: transfermarktPlayer.currentTeamName, position: transfermarktPlayer.detailedPosition, marketValueEur: transfermarktPlayer.marketValueEur }).from(transfermarktPlayer).where(and(eq(transfermarktPlayer.runId, run.id), isNotNull(transfermarktPlayer.marketValueEur))).orderBy(sql`random()`).limit(limit)
  } catch { return [] }
}

export async function getTransfermarktPlayerPool(limit = 100) {
  return getTransfermarktDuelPlayers(limit)
}
