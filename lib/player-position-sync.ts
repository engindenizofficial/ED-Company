import { and, desc, eq, gt, isNull, sql } from "drizzle-orm"
import { db } from "./db"
import { playerMarketValue, playerPosition } from "./db/schema"
import { scrapePlayerPosition, getAdaptiveDelayMs } from "./transfermarkt-scraper"
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

/**
 * Transfermarkt'a art arda çok hızlı istek atmamamak için oyuncular arası
 * bekleme. Sabit bir ms değeri DEĞİL — "player-position" sistemine özel,
 * kendi kendine kalibre olan bir AIMD (Multiplicative-Increase /
 * Multiplicative-Decrease) mekanizmasının şu anki değeri (bkz.
 * transfermarkt-scraper.ts -> getAdaptiveDelayMs, lib/redis.ts ->
 * getTmDelayMs/recordTmSuccess/recordTmBlock).
 *
 * ÖNEMLİ — DÜRÜST UYARI: Transfermarkt'ın bot koruması bizim kontrolümüzde
 * değil ve algoritması bilinmiyor (IP başına istek sıklığı, günün saati,
 * paralel başka trafik vs. hepsi etkileyebilir). Bu yüzden "her oyuncu
 * KESİN aynı sürede, hiç engel yemeden çekilecek" diye %100 garanti
 * VERİLEMEZ — hiçbir gecikme değeri bunu matematiksel olarak garanti
 * edemez.
 *
 * DENEY GEÇMİŞİ (kullanıcı isteğiyle, önceden deneye deneye bulunmuştu, sabit
 * bir taban değerle):
 *   - 700ms  → sık sık 403/429 (blok çok sık).
 *   - 1500ms → yine yavaşlama gözlemlendi (blok azalmadı/yeterince azalmadı).
 *   - 2000ms → ~50 oyuncu sorunsuz gitti, sonra yine yavaşladı.
 *   - 2500ms → iyi gitti ama net sonuç belirsizdi.
 *   - 3000ms → kullanıcı bu değerde bile blok gördüğünü bildirdi.
 *   - 5000ms → sabit taban olarak kullanılmaya başlandı.
 *
 * KARAR — kullanıcı önceliği netleştirdi: "sistem yavaş olsun ama hiç hata
 * olmasın" (yani: bir oyuncunun verisi hiç alınamadan es geçilmesi kabul
 * edilemez; buna karşılık gecikme/yavaşlık kabul edilebilir bir maliyettir).
 * fetchHtml'deki 3 adımlı retry merdiveni (1.5s/4s/10s,
 * transfermarkt-scraper.ts) bir "pes et" mekanizması değil, gerçek bir
 * güvenlik ağı olarak çalışır — bir istek bloklanırsa ATLANMAZ, ısrarla
 * (giderek uzayan beklemelerle) tekrar denenir.
 *
 * SON KARAR — sabit bir taban değeri elle deneyip artırmak yerine, sistem
 * artık KENDİ KENDİNE kalibre olur: 5000ms'den başlar, jitter YOK (kullanıcı
 * kararıyla kaldırıldı), bir blok/timeout sinyali görüldüğünde anında sertçe
 * artar (×1.8), uzun bir başarı serisinde yavaşça azalır (20 başarılı
 * istekte bir %5) — ama bilinen kötü bölgenin (3000ms'in bile blok verdiği)
 * bir tık üzerinde kalacak şekilde 4000ms'in altına asla inmez. Bu sistem
 * lib/market-value-sync.ts'in ("market-value") blok sinyallerinden
 * TAMAMEN BAĞIMSIZ kalibre olur.
 *
 * İzleme: admin panelindeki "Oyuncu Mevki Taraması" durumu.
 */

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
 * ÖNEMLİ — bu değer ÖNCEDEN 190s'ydi. Bu, her adımın invocation'ın 300s'lik
 * payının BÜYÜK KISMINI tüketmesine yol açıyordu (worst-case ~235s); bir
 * sonraki adımı tetikleyen after() bloğuna sadece ~60-65s'lik bir pay
 * kalıyordu. Bu pay, bir sonraki adımın TAM YANITINI bekleyen
 * triggerChainContinuation'ı güvenle kullanmaya yetmiyordu — bu yüzden
 * route.ts, tam yanıtı beklemeyen, daha dayanıksız fireChainStepWithout-
 * AwaitingResponse'a mecbur kalıyordu (bkz. o fonksiyonun kendi açıklaması).
 * İstek ağa tam çıkmadan invocation sert şekilde öldürülürse zincir hiçbir
 * iz bırakmadan kırılıyordu — admin panelinin sürekli "Zincir kırıldı"
 * göstermesinin kök nedeni buydu.
 *
 * SON DURUM — route artık kendi kendini HİÇ tetiklemiyor (self-fetch chain
 * kaldırıldı, bkz. app/api/cron/backfill-player-positions/route.ts başındaki
 * açıklama — Vercel'in 5-sıçrama limiti self-fetch zincirlemeyi yapısal
 * olarak imkansız kılıyordu). Devamını dışarıdan bir zamanlayıcı (GitHub
 * Actions / cron-job.org) periyodik çağrılarla sağlıyor.
 *
 * Bu değişiklik sayesinde bu bütçeyi bir sonraki adımı tetiklemek için pay
 * bırakma zorunluluğu olmadan, invocation'ın 300s'lik sert sınırına GÜVENLE
 * yaklaştırabiliriz — tek kısıtlama, son adayın worst-case süresi (tam 3
 * tekrar denemesi + backoff ≈ 45s) için pay bırakmak. 250s + ~45s = ~295s,
 * 300s'nin hemen altında güvenli bir payla kalır.
 *
 * 250s'lik bütçeyle, çağrı başına ~250s / ~3.4s ≈ 73 oyuncu işlenir. GitHub
 * Actions'ın minimum zamanlama aralığı 5 dakika olduğundan (ayrıca yoğun
 * saatlerde birkaç dakika gecikebilir), her 5 dakikada bir ~73 oyuncu ≈
 * dakikada ~14.6 oyuncu işlenir — eski 70s/1dk kombinasyonundan (dakikada
 * ~20 oyuncu) biraz daha yavaş ama zamanlayıcı çok daha basit/güvenilir
 * (GitHub'ın kendi altyapısı, üçüncü taraf hesabı gerektirmiyor).
 */
const SOFT_TIME_BUDGET_MS = 250_000

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
  * "player-position" sisteminin AIMD gecikmesi kadar bekleyerek) işler; her
  * biri için profil sayfasını çeker, normalize eder ve `player_position`
  * tablosuna yazar.
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
    // Zaman bütçesini aştıysak burada dur — kalan adaylar dışarıdan gelecek
    // bir sonraki çağrıda işlenecek. Fonksiyonun platformun sert zaman
    // aşımı (maxDuration) tarafından ortadan kesilmesini önler.
    if (Date.now() - startedAt > SOFT_TIME_BUDGET_MS) break

    if (processed > 0) await sleep(await getAdaptiveDelayMs("player-position"))

    let scraped: Awaited<ReturnType<typeof scrapePlayerPosition>> = null
    let scrapeFailed = false
    try {
      scraped = await scrapePlayerPosition(candidate.transfermarktPlayerId)
    } catch (err) {
      // ÖNEMLİ — BURASI GERÇEK "VERİ YOK" DEĞİL, GEÇİCİ BİR HATA.
      // scrapePlayerPosition/fetchHtml SADECE 404'te (sayfa gerçekten yok)
      // null döner; buraya düşen exception 403/429 bot koruması (3 tekrar
      // denemesi tükendi), 5xx veya ağ/timeout hatası anlamına gelir — yani
      // Transfermarkt'ta bu oyuncu için mevki verisi VAR ama şu an
      // çekilemedi. Bu durumu "unverified" olarak yazmak KALICI bir yanlış
      // negatif oluşturuyordu: getPositionBackfillCandidates sadece
      // player_position satırı OLMAYAN oyuncuları aday sayar, bu yüzden bir
      // kez (geçici bir 403 bloğu yüzünden) "unverified" yazılan oyuncu bir
      // daha ASLA yeniden denenmiyordu. Canlı doğrulamada "unverified"
      // işaretli 4 örnek oyuncunun (hepsi tanınmış, aktif futbolcu) 4'ünde
      // de gerçek mevki verisi bulundu — düşük eşleşme oranının kök nedeni
      // buydu, Transfermarkt'ta veri eksikliği değildi.
      console.error(`[v0] Mevki scrape hatası (playerId=${candidate.playerId}), bu batch'te atlanıyor, sonraki koşuda tekrar denenecek:`, err)
      scrapeFailed = true
    }

    if (scrapeFailed) {
      // Satır YAZILMAZ — oyuncu candidate havuzunda kalır, bir sonraki
      // çağrıda (en yüksek değerli işlenmemiş aday olarak) tekrar denenir.
      processed++
      continue
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
