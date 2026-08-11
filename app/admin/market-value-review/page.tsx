import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { desc } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { isAdminEmail } from "@/lib/admin"
import { db } from "@/lib/db"
import { marketValueReviewQueue } from "@/lib/db/schema"
import { MarketValueReviewBoard, type ReviewQueueItem } from "@/components/market-value-review-board"

export const metadata = {
  title: "Piyasa Değeri Kontrolü — ED Company",
}

export const dynamic = "force-dynamic"

export default async function MarketValueReviewPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!isAdminEmail(session?.user?.email)) {
    redirect("/")
  }

  const rows = await db
    .select()
    .from(marketValueReviewQueue)
    .orderBy(desc(marketValueReviewQueue.createdAt))

  const items: ReviewQueueItem[] = rows.map((row) => ({
    id: row.id,
    entityType: row.entityType as "team" | "player",
    entityId: row.entityId,
    entityName: row.entityName,
    entityCountry: row.entityCountry,
    candidateName: row.candidateName,
    candidateCountry: row.candidateCountry,
    candidateValueEur: row.candidateValueEur !== null ? Number(row.candidateValueEur) : null,
    confidence: row.confidence,
    status: row.status as "pending" | "approved" | "rejected",
    createdAt: row.createdAt.toISOString(),
  }))

  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
      <MarketValueReviewBoard items={items} />
    </main>
  )
}
