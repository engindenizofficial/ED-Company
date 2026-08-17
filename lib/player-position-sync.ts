import { and, desc, eq, gt, isNull, sql } from "drizzle-orm"
import { db } from "./db"
import { playerMarketValue, playerPosition } from "./db/schema"
import { scrapePlayerPosition } from "./transfermarkt-scraper"
import { profile } from "./player-positions"

// ---------------------------------------------------------------------------
// Kademeli, arka planda çalışan Transfermarkt alt mevki backfill'i.
//
// Piyasa değeri eşleşmesi (player_market_value) zaten her oyuncunun
// transfermarktPlayerId'sini tutuyor — bu yüzden burada YENİDEN isim
// araması yapılmaz, direkt o id'nin profil sayfası çekilir (oyuncu başına
// tek istek). İşlenecek sıradaki adaylar piyasa değerine göre (yüksek
// değerli/aktif lig oyuncuları önce) belirlenir; "player_position" tablosunda
// satırı olmayan oyuncular "henüz işlenmemiş" sayılır.
//
// Bu tasarım kasıtlı olarak durumsuz (stateless) bırakıldı: ilerleme,
// ayrı bir cursor/kilit yerine doğrudan veritabanı durumundan (kimin
// player_position satırı yok) okunur. Bu sayede backfill route'u ne kadar
// kesilirse kesilsin, tekrar tetiklendiğinde otomatik olarak kaldığı yerden
// (en yüksek değerli işlenmemiş oyuncudan) devam eder — çakışan iki koşu
// olsa bile en kötü ihtimalle aynı oyuncu iki kez çekilir, veri bozulmaz.
// ---------------------------------------------------------------------------

/** Transfermarkt'a art arda çok hızlı istek atmamamak için oyuncular arası bekleme. */
const REQUEST_DELAY_MS = 700

/**
 * Route'un maxDuration'ından (300s) daha erken, kendi isteğimizle güvenli bir
 * şekilde durmak için yumuşak zaman bütçesi.
 *
 * NEDEN GEREKLİ: Her oyuncu isteği Transfermarkt'tan yavaş yanıt gelirse ya
 * da 429/403/5xx alıp yeniden denerse tek başına 8s'ye (+ 1.5s/4s/10s backoff
 * ile üç tekrar denemeye) kadar sürebilir. BATCH_SIZE=200 ile, art arda
 * birkaç oyuncu yavaş/yeniden denenen olduğunda toplam süre kolayca 300s'yi
 * geçiyordu — bu durumda Vercel fonksiyonu döngünün ORTASINDA sert bir
 * şekilde kesiyor, bu yüzden ne run satırı güncelleniyor (sonsuza kadar
 * "running" + 0/0 kalıyor) ne de bir sonraki adım tetikleniyordu ("Zincir
 * kırıldı"). Tek tek oyuncu yazma işlemleri döngü içinde anında commit
 * edildiği için ilerleme gerçekte oluyordu, sadece görünmüyordu.
 *
 * Çözüm: sabit bir batch boyutuna güvenmek yerine, döngü her adımdan önce
 * geçen süreyi kontrol eder ve bu bütçeye yaklaşınca KENDİ İSTEĞİYLE erken
 * durur — böylece fonksiyon her zaman platform zaman aşımından ÖNCE, run
 * satırını doğru sayılarla güncelleyip bir sonraki adımı tetikleyerek düzgün
 * bir şekilde geri döner.
 *
 * 190s seçildi (300s'nin belirgin altında): kontrol her adaydan ÖNCE
 * yapılıyor, bu yüzden bütçeyi az aşmış olsak bile son adayın kendisi
 * worst-case ~40-45s sürebilir (3 tekrar denemenin tamamı + backoff'lar) —
 * 190s + ~45s = ~235s, hâlâ 300s'nin belirgin altında kalır.
 */
const SOFT_TIME_BUDGET_MS = 190_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface PositionCandidate {
  playerId: number
  transfermarktPlayerId: string
}

/**
 * Henüz mevki verisi çekilmemiş, en yüksek piyasa değerine sahip `limit`
 * kadar oyuncuyu döndürür. Piyasa değerine göre sıralama, yıldız/aktif lig
 * oyuncularının doğal olarak önce dolmasını sağlar (aktif liglerin en
 * değerli oyuncuları genelde en yüksek piyasa değerine sahiptir).
 */
export async function getPositionBackfillCandidates(limit: number): Promise<PositionCandidate[]> {
  const rows = await db
    .select({
      playerId: playerMarketValue.playerId,
      transfermarktPlayerId: playerMarketValue.transfermarktPlayerId,
    })
    .from(playerMarketValue)
    .leftJoin(playerPosition, eq(playerPosition.playerId, playerMarketValue.playerId))
    .where(
      and(
        eq(playerMarketValue.matchStatus, "matched"),
        gt(playerMarketValue.valueEur, "0"),
        sql`${playerMarketValue.transfermarktPlayerId} IS NOT NULL`,
        isNull(playerPosition.id),
      ),
    )
    .orderBy(desc(playerMarketValue.valueEur))
    .limit(limit)

  return rows
    .filter((r): r is { playerId: number; transfermarktPlayerId: string } => Boolean(r.transfermarktPlayerId))
    .map((r) => ({ playerId: r.playerId, transfermarktPlayerId: r.transfermarktPlayerId }))
}

/** Toplam aday sayısı (henüz işlenmemiş) — ilerleme göstergesi için. */
export async function countRemainingCandidates(): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(playerMarketValue)
    .leftJoin(playerPosition, eq(playerPosition.playerId, playerMarketValue.playerId))
    .where(
      and(
        eq(playerMarketValue.matchStatus, "matched"),
        gt(playerMarketValue.valueEur, "0"),
        sql`${playerMarketValue.transfermarktPlayerId} IS NOT NULL`,
        isNull(playerPosition.id),
      ),
    )
  return Number(count)
}

export interface PositionBackfillBatchResult {
  processed: number
  matched: number
  remaining: number
}

/**
 * `batchSize` kadar adayı sırayla (Transfermarkt'ı bloklamamak için aralarda
 * `REQUEST_DELAY_MS` bekleyerek) işler; her biri için profil sayfasını
 * çeker, normalize eder ve `player_position` tablosuna yazar.
 *
 * Profilde hiç pozisyon bulunamazsa (404, silinmiş profil, veri yok) satır
 * yine de "source: unverified" olarak yazılır — böylece bu oyuncu bir
 * sonraki koşuda tekrar tekrar denenip zaman kaybettirmez, ama fit()
 * fonksiyonu onu doğrulanmamış (nötr 0.72) olarak ele almaya devam eder.
 */
export async function runPlayerPositionBackfillBatch(batchSize: number): Promise<PositionBackfillBatchResult> {
  const candidates = await getPositionBackfillCandidates(batchSize)
  const startedAt = Date.now()
  let processed = 0
  let matched = 0

  for (const candidate of candidates) {
    // Zaman bütçesini aştıysak burada dur — kalan adaylar bir sonraki
    // (kendi kendini tetikleyen) adımda işlenecek. Fonksiyonun platformun
    // sert zaman aşımı tarafından ortadan kesilmesini önler.
    if (Date.now() - startedAt > SOFT_TIME_BUDGET_MS) break

    if (processed > 0) await sleep(REQUEST_DELAY_MS)

    let scraped: Awaited<ReturnType<typeof scrapePlayerPosition>> = null
    try {
      scraped = await scrapePlayerPosition(candidate.transfermarktPlayerId)
    } catch (err) {
      console.error(`[v0] Mevki scrape hatası (playerId=${candidate.playerId}):`, err)
    }

    const now = new Date()
    const id = `player-position-${candidate.playerId}`

    if (scraped && (scraped.mainPosition || scraped.secondaryPositions.length > 0)) {
      const normalized = profile(scraped.mainPosition, scraped.secondaryPositions, "transfermarkt")
      await db
        .insert(playerPosition)
        .values({
          id,
          playerId: candidate.playerId,
          transfermarktPlayerId: candidate.transfermarktPlayerId,
          mainPositionRaw: scraped.mainPosition,
          mainPosition: normalized.primary,
          secondaryPositionsRaw: scraped.secondaryPositions,
          secondaryPositions: normalized.secondary,
          source: "transfermarkt",
          lastScrapedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: playerPosition.playerId,
          set: {
            transfermarktPlayerId: candidate.transfermarktPlayerId,
            mainPositionRaw: scraped.mainPosition,
            mainPosition: normalized.primary,
            secondaryPositionsRaw: scraped.secondaryPositions,
            secondaryPositions: normalized.secondary,
            source: "transfermarkt",
            lastScrapedAt: now,
            updatedAt: now,
          },
        })
      matched++
    } else {
      await db
        .insert(playerPosition)
        .values({
          id,
          playerId: candidate.playerId,
          transfermarktPlayerId: candidate.transfermarktPlayerId,
          source: "unverified",
          lastScrapedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: playerPosition.playerId,
          set: { source: "unverified", lastScrapedAt: now, updatedAt: now },
        })
    }

    processed++
  }

  const remaining = await countRemainingCandidates()
  return { processed, matched, remaining }
}
