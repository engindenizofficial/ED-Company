"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { and, count, eq, isNull, or } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { isAdminEmail } from "@/lib/admin"
import { db } from "@/lib/db"
import { marketValueReviewQueue, teamMarketValue, playerMarketValue } from "@/lib/db/schema"
import { getTeamCountry, getPlayerNationality } from "@/lib/api-football"
import { scrapeTeamCountry, scrapePlayerNationality } from "@/lib/transfermarkt-scraper"

// ---------------------------------------------------------------------------
// Manuel gözden geçirme arayüzünün (8. adım) yazma katmanı. Sadece admin
// e-postası ile giriş yapmış kullanıcı çağırabilir. Onay/red, review kuyruğu
// kaydını çözer VE ilgili team_market_value / player_market_value satırını
// buna göre günceller — cron'un tekrar üzerine yazmaması için status artık
// "pending" olmadığından upsertReviewQueueEntry bu kayda dokunmaz.
// ---------------------------------------------------------------------------

const REVIEW_PATH = "/admin/market-value-review"

async function requireAdmin(): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!isAdminEmail(session?.user?.email)) {
    throw new Error("Unauthorized")
  }
}

interface ReviewRow {
  id: string
  entityType: "team" | "player"
  entityId: number
  candidateTransfermarktId: string | null
  candidateValueEur: string | null
  confidence: number
  status: string
}

async function getReviewRow(id: string): Promise<ReviewRow | null> {
  const rows = await db
    .select()
    .from(marketValueReviewQueue)
    .where(eq(marketValueReviewQueue.id, id))
    .limit(1)
  if (rows.length === 0) return null
  return rows[0] as ReviewRow
}

/**
 * Bir review kaydını onaylar: adayı doğru kabul eder, ilgili takım/oyuncu
 * satırını "matched" durumuna, adayın piyasa değeri ve Transfermarkt id'siyle
 * günceller.
 */
export async function approveReviewEntry(id: string): Promise<void> {
  await requireAdmin()

  const row = await getReviewRow(id)
  if (!row || row.status !== "pending") return

  const now = new Date()

  await db
    .update(marketValueReviewQueue)
    .set({ status: "approved", resolvedAt: now })
    .where(eq(marketValueReviewQueue.id, id))

  if (row.entityType === "team") {
    await db
      .update(teamMarketValue)
      .set({
        transfermarktTeamId: row.candidateTransfermarktId,
        totalValueEur: row.candidateValueEur,
        matchConfidence: row.confidence,
        matchStatus: "matched",
        // Kilitle: cron artık bu takımın eşleşmesini yeniden hesaplayıp
        // üzerine yazmayacak (bkz. lib/market-value-sync.ts).
        manualOverride: true,
        updatedAt: now,
      })
      .where(eq(teamMarketValue.teamId, row.entityId))
  } else {
    await db
      .update(playerMarketValue)
      .set({
        transfermarktPlayerId: row.candidateTransfermarktId,
        valueEur: row.candidateValueEur,
        matchConfidence: row.confidence,
        matchStatus: "matched",
        manualOverride: true,
        updatedAt: now,
      })
      .where(eq(playerMarketValue.playerId, row.entityId))
  }

  revalidatePath(REVIEW_PATH)
}

const BACKFILL_BATCH_SIZE = 12

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function currentSeason(): number {
  const now = new Date()
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
}

export interface BackfillBatchResult {
  done: boolean
  updated: number
  failed: number
  remaining: number
}

/**
 * "pending" durumundaki, henüz ülke doldurma denemesi yapılmamış eski review
 * kayıtlarını geriye dönük dolduran tek bir grup. Bugüne kadar biriken 700+
 * kayıt için, cron her yeni review'a bunu artık otomatik eklediğinden (bkz.
 * lib/market-value-sync.ts) bu sadece geçmiş kayıtlar için bir kerelik
 * geriye dönük doldurma amaçlıdır.
 *
 * ÖNEMLİ — countryLookupAttempted bayrağı: API-Football / Transfermarkt
 * kaynağında bazı takım/oyuncular için ülke verisi hiç bulunmayabilir; bu
 * durumda sonuç null'dır ama bu bir "hata" değildir. Eskiden WHERE koşulu
 * sadece entityCountry/candidateCountry'nin null olup olmadığına bakıyordu,
 * bu yüzden veri bulunamayan satırlar her turda yeniden seçiliyor ve
 * sonsuza kadar "güncelleniyor" (yine null ile) — updated sayacı gerçek
 * kayıt sayısını katlarca aşıyor ve döngü hiç durmuyordu. Şimdi her satır
 * işlendiğinde (sonuç null olsa da) countryLookupAttempted=true yazılıyor
 * ve WHERE koşulu bunu da kontrol ediyor, böylece gerçekten çözülemeyen
 * satırlar bir kez denenip kalıcı olarak dışarıda kalıyor.
 *
 * Transfermarkt'a art arda çok hızlı istek atmamak için grup küçük tutulur;
 * admin panelindeki buton bu fonksiyonu "done: true" gelene kadar art arda
 * çağırır (bkz. components/market-value-review-board.tsx).
 */
function backfillPendingCondition() {
  return and(
    eq(marketValueReviewQueue.status, "pending"),
    eq(marketValueReviewQueue.countryLookupAttempted, false),
    or(isNull(marketValueReviewQueue.entityCountry), isNull(marketValueReviewQueue.candidateCountry)),
  )
}

export async function backfillReviewQueueCountriesBatch(): Promise<BackfillBatchResult> {
  await requireAdmin()

  const season = currentSeason()

  const rows = await db.select().from(marketValueReviewQueue).where(backfillPendingCondition()).limit(BACKFILL_BATCH_SIZE)

  if (rows.length === 0) {
    revalidatePath(REVIEW_PATH)
    return { done: true, updated: 0, failed: 0, remaining: 0 }
  }

  let updated = 0
  let failed = 0

  for (const row of rows) {
    try {
      const [entityCountry, candidateCountry] = await Promise.all([
        row.entityType === "team" ? getTeamCountry(row.entityId) : getPlayerNationality(row.entityId, season),
        row.candidateTransfermarktId
          ? row.entityType === "team"
            ? scrapeTeamCountry(row.candidateTransfermarktId)
            : scrapePlayerNationality(row.candidateTransfermarktId)
          : Promise.resolve(null),
      ])

      // Sonuç null olsa bile deneme yapıldığını işaretle — aksi halde bu
      // satır bir sonraki turda tekrar seçilip sonsuza kadar denenir.
      await db
        .update(marketValueReviewQueue)
        .set({
          entityCountry: entityCountry ?? row.entityCountry,
          candidateCountry: candidateCountry ?? row.candidateCountry,
          countryLookupAttempted: true,
        })
        .where(eq(marketValueReviewQueue.id, row.id))

      updated++
    } catch (err) {
      failed++
      console.error(`[v0] Backfill hatası (${row.id}):`, err instanceof Error ? err.message : err)
      // Gerçek bir hata (ağ/timeout vb.) olduğunda bayrağı işaretleME —
      // böylece bu satır bir sonraki turda yeniden denenir. Sadece "veri
      // bulunamadı" (null dönen) durumlar kalıcı olarak dışarıda kalır.
    }

    // Transfermarkt'a art arda çok hızlı istek atmamak için bekleme.
    await sleep(400)
  }

  const [{ remaining }] = await db.select({ remaining: count() }).from(marketValueReviewQueue).where(backfillPendingCondition())

  revalidatePath(REVIEW_PATH)

  return { done: remaining === 0, updated, failed, remaining }
}

/**
 * Bir review kaydını reddeder: adayın yanlış olduğunu işaretler, ilgili
 * takım/oyuncu satırını "unmatched" durumuna çeker (yanlış veri göstermek
 * yerine boş bırakır).
 */
export async function rejectReviewEntry(id: string): Promise<void> {
  await requireAdmin()

  const row = await getReviewRow(id)
  if (!row || row.status !== "pending") return

  const now = new Date()

  await db
    .update(marketValueReviewQueue)
    .set({ status: "rejected", resolvedAt: now })
    .where(eq(marketValueReviewQueue.id, id))

  if (row.entityType === "team") {
    await db
      .update(teamMarketValue)
      .set({
        transfermarktTeamId: null,
        totalValueEur: null,
        matchConfidence: null,
        matchStatus: "unmatched",
        // Kilitle: cron bu takım için "unmatched" kararını yeniden eşleşme
        // denemesine çevirmesin — admin bilerek boş bıraktı.
        manualOverride: true,
        updatedAt: now,
      })
      .where(eq(teamMarketValue.teamId, row.entityId))
  } else {
    await db
      .update(playerMarketValue)
      .set({
        transfermarktPlayerId: null,
        valueEur: null,
        matchConfidence: null,
        matchStatus: "unmatched",
        manualOverride: true,
        updatedAt: now,
      })
      .where(eq(playerMarketValue.playerId, row.entityId))
  }

  revalidatePath(REVIEW_PATH)
}
