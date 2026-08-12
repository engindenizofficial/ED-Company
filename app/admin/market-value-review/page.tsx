import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { desc } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { isAdminEmail } from "@/lib/admin"
import { db } from "@/lib/db"
import { marketValueReviewQueue } from "@/lib/db/schema"
import { MarketValueReviewBoard, type ReviewQueueItem } from "@/components/market-value-review-board"
import { MarketValueCronStatus } from "@/components/market-value-cron-status"
import { MarketValueDangerZone } from "@/components/market-value-danger-zone"
import { getMarketValueCronStatus } from "@/app/actions/market-value-cron"

export const metadata = {
  title: "Piyasa Değeri Kontrolü — ED Company",
}

export const dynamic = "force-dynamic"

export default async function MarketValueReviewPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!isAdminEmail(session?.user?.email)) {
    redirect("/")
  }

  const [rows, cronStatus] = await Promise.all([
    db.select().from(marketValueReviewQueue).orderBy(desc(marketValueReviewQueue.createdAt)),
    getMarketValueCronStatus(),
  ])

  const items: ReviewQueueItem[] = rows.map((row) => ({
    id: row.id,
    entityType: row.entityType as "team" | "player",
    entityId: row.entityId,
    entityName: row.entityName,
    entityCountry: row.entityCountry,
    candidateName: row.candidateName,
    candidateCountry: row.candidateCountry,
    countryLookupAttempted: row.countryLookupAttempted,
    candidateValueEur: row.candidateValueEur !== null ? Number(row.candidateValueEur) : null,
    confidence: row.confidence,
    status: row.status as "pending" | "approved" | "rejected",
    createdAt: row.createdAt.toISOString(),
  }))

  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
      <div className="mb-6 flex flex-col gap-4">
        <MarketValueCronStatus initialStatus={cronStatus} />
        <MarketValueDangerZone />
      </div>
      <MarketValueReviewBoard items={items} />
    </main>
  )
}
