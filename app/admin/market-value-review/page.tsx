import { headers } from "next/headers"
import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { desc } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { isAdminEmail } from "@/lib/admin"
import { db } from "@/lib/db"
import { marketValueReviewQueue } from "@/lib/db/schema"
import { MarketValueReviewBoard, type ReviewQueueItem } from "@/components/market-value-review-board"
import { MarketValueCronStatus } from "@/components/market-value-cron-status"
import { PlayerPositionCronStatus } from "@/components/player-position-cron-status"
import { PlayerPositionDangerZone } from "@/components/player-position-danger-zone"
import { PlayerPowerMaintenance } from "@/components/player-power-maintenance"
import { getMarketValueCronStatus } from "@/app/actions/market-value-cron"
import { getPlayerPositionCronStatus } from "@/app/actions/player-position-cron"
import { getServerLocale } from "@/lib/i18n/server-locale"
import { translate } from "@/lib/i18n/dictionaries"

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  return {
    title: translate(locale, "meta.admin.title"),
  }
}

export const dynamic = "force-dynamic"

export default async function MarketValueReviewPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!isAdminEmail(session?.user?.email)) {
    redirect("/")
  }

  const locale = await getServerLocale()

  const [rows, cronStatus, playerPositionStatus] = await Promise.all([
    db.select().from(marketValueReviewQueue).orderBy(desc(marketValueReviewQueue.createdAt)),
    getMarketValueCronStatus(),
    getPlayerPositionCronStatus(),
  ])

  const items: ReviewQueueItem[] = rows.map((row) => ({
    id: row.id,
    entityType: row.entityType as "league" | "team" | "player",
    afName: row.afName,
    afCountry: row.afCountry,
    tmName: row.tmName,
    tmCountry: row.tmCountry,
    tmValueEur: row.tmValueEur !== null ? Number(row.tmValueEur) : null,
    confidence: row.confidence,
    status: row.status as "pending" | "approved",
  }))

  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
      <div className="mb-6 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {translate(locale, "admin.sectionMarketValue")}
        </h2>
        <MarketValueCronStatus initialStatus={cronStatus} />
      </div>
      <div className="mb-6 flex flex-col gap-4 border-t pt-6">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {translate(locale, "admin.sectionPlayerPositions")}
        </h2>
        <PlayerPositionCronStatus initialStatus={playerPositionStatus} />
        <PlayerPositionDangerZone />
      </div>
      <div className="mb-6 flex flex-col gap-4 border-t pt-6">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {translate(locale, "admin.sectionPlayerPower")}
        </h2>
        <PlayerPowerMaintenance />
      </div>
      <MarketValueReviewBoard items={items} />
    </main>
  )
}
