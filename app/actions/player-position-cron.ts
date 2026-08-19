"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { desc } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { isAdminEmail } from "@/lib/admin"
import { db } from "@/lib/db"
import { playerPosition, playerPositionCronRun } from "@/lib/db/schema"
import { countRemainingCandidates } from "@/lib/player-position-sync"

// ---------------------------------------------------------------------------
// Admin panelinde oyuncu mevki (Transfermarkt) backfill'inin durumunu
// göstermek ve manuel olarak silmek için kullanılan action'lar.
//
// ÖNEMLİ MİMARİ — bu backfill kendi kendini ZİNCİRLEMİYOR (self-fetch chain
// YOK). Vercel platformu, bir fonksiyonun kendini art arda çağırmasına sabit
// bir 5-sıçrama sınırı koyuyor; 7500+ oyuncu için yüzlerce adım gerektiren bu
// backfill her zaman 5. adımda "508 Loop Detected" ile kesiliyordu (bkz.
// app/api/cron/backfill-player-positions/route.ts'in başındaki uzun
// açıklama). Bunun düzeltmesi olarak önce dışarıdan bir GitHub Actions
// cron'u eklendi (her 5 dakikada bir otomatik tetikleyen) — ama bu istenmedi:
// admin, taramanın SADECE kendisi "Şimdi Tara"ya bastığında çalışmasını,
// kendiliğinden sürekli arka planda dönmemesini istedi. Bu yüzden o cron
// tamamen KALDIRILDI.
//
// ŞİMDİKİ MİMARİ — bu dosyada artık bir "tetikleme" action'ı YOK. Admin
// panelindeki "Şimdi Tara" butonu (bkz. components/player-position-cron-
// status.tsx), her batch'i doğrudan TARAYICIDAN app/api/cron/backfill-
// player-positions route'una fetch ile çağırır (o route artık admin oturum
// çerezini de kabul ediyor, CRON_SECRET'i istemciye göndermeye gerek yok).
// Admin butona bastığı sürece tarayıcı bu route'u art arda çağırıp taramayı
// ilerletir; sekmeyi kapatınca veya "Durdur"a basınca hiçbir şey arka planda
// çalışmaya devam etmez. Bu dosyadaki action'lar SADECE durumu okumak
// (getPlayerPositionCronStatus) ve veriyi sıfırlamak (resetAllPlayerPosition-
// Data) için var — asıl tarama işini artık route.ts + tarayıcı döngüsü yapıyor.
//
// run satırı deseni: app/api/cron/backfill-player-positions devam eden
// ("running") bir satır varsa onu yeniden kullanır, yoksa yeni bir satır
// açar — "en son satır" tüm koşunun toplam ilerlemesini gösterir. Genel
// ilerleme (kaç oyuncu kaldı) ayrıca doğrudan veritabanından
// (countRemainingCandidates) canlı hesaplanır.
// ---------------------------------------------------------------------------

const REVIEW_PATH = "/admin/market-value-review"

/**
 * Bir "running" satırın son batch'inden bu kadar süre sonra hâlâ heartbeat
 * tazelenmemişse "kırılmış/durmuş" sayılır. Her batch'i artık admin'in
 * TARAYICISI tetikliyor (bkz. dosya başı açıklaması) — her başarılı çağrı
 * heartbeat'i tazeler. Bu eşik, admin'in tarayıcısının bir batch'i işlerken
 * (tipik ~250s) normal süren beklemeyi "kırıldı" saymayacak, ama sekme
 * kapanır/çökerse (bir sonraki batch hiç gelmez) makul bir sürede "kırıldı"
 * uyarısını gösterecek şekilde seçildi (~250s'nin biraz üzeri).
 *
 * ÖNEMLİ — bu kontrol `run.heartbeatAt`'e bakar, `run.runStartedAt`'a DEĞİL.
 * Satır koşu boyunca (tüm dış çağrılar için) TEK ve aynı olduğundan
 * (bkz. app/api/cron/backfill-player-positions), runStartedAt SADECE
 * koşunun en başında bir kere yazılır ve tüm koşu boyunca sabit kalır — bu
 * yüzden saatlerce sürmesi normal olan (binlerce oyuncu) bir koşuyu
 * runStartedAt'a göre "eskimiş" saymak yanlış olurdu.
 */
const STALE_RUN_MS = 6 * 60 * 1000

async function requireAdmin(): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!isAdminEmail(session?.user?.email)) {
    console.error(
      `[v0] Admin yetkisi reddedildi (oyuncu mevki backfill) — oturumdaki e-posta: ${session?.user?.email ?? "(oturum yok)"}`,
    )
    throw new Error(`Unauthorized: ${session?.user?.email ?? "no session"}`)
  }
}

export interface PlayerPositionCronStatus {
  hasRun: boolean
  runId: string | null
  status: "running" | "completed" | "failed" | null
  runStartedAt: string | null
  runFinishedAt: string | null
  playersProcessed: number
  playersMatched: number
  lastError: string | null
  isStale: boolean
  remainingCandidates: number
  isDone: boolean
}

/** Admin panelinde göstermek için: en son batch satırının durumu + canlı hesaplanan kalan oyuncu sayısı. */
export async function getPlayerPositionCronStatus(): Promise<PlayerPositionCronStatus> {
  await requireAdmin()

  const [latest, remainingCandidates] = await Promise.all([
    db.select().from(playerPositionCronRun).orderBy(desc(playerPositionCronRun.createdAt)).limit(1),
    countRemainingCandidates(),
  ])

  const run = latest[0]
  const isDone = remainingCandidates === 0

  if (!run) {
    return {
      hasRun: false,
      runId: null,
      status: null,
      runStartedAt: null,
      runFinishedAt: null,
      playersProcessed: 0,
      playersMatched: 0,
      lastError: null,
      isStale: false,
      remainingCandidates,
      isDone,
    }
  }

  const status = run.status as "running" | "completed" | "failed"
  const isStale = status === "running" && Date.now() - run.heartbeatAt.getTime() > STALE_RUN_MS

  return {
    hasRun: true,
    runId: run.id,
    status,
    runStartedAt: run.runStartedAt.toISOString(),
    runFinishedAt: run.runFinishedAt ? run.runFinishedAt.toISOString() : null,
    playersProcessed: run.playersProcessed,
    playersMatched: run.playersMatched,
    lastError: run.lastError,
    isStale,
    remainingCandidates,
    isDone,
  }
}

export interface ResetPlayerPositionDataResult {
  deletedPositions: number
  deletedCronRuns: number
}

/**
 * Admin'in "Tümünü Sıfırla" butonu — çekilmiş TÜM oyuncu mevki verilerini
 * (player_position) ve backfill çalışma günlüğünü (player_position_cron_run)
 * kalıcı olarak siler. Piyasa değeri/oyuncu eşleştirme verisine (player_
 * market_value) DOKUNMAZ — sadece mevki verisi sıfırlanır, bir sonraki
 * tarama tüm adayları sıfırdan (unverified) yeniden işler.
 */
export async function resetAllPlayerPositionData(): Promise<ResetPlayerPositionDataResult> {
  await requireAdmin()

  const [deletedPositions, deletedCronRuns] = await Promise.all([
    db.delete(playerPosition).returning({ id: playerPosition.id }),
    db.delete(playerPositionCronRun).returning({ id: playerPositionCronRun.id }),
  ])

  revalidatePath(REVIEW_PATH)

  return {
    deletedPositions: deletedPositions.length,
    deletedCronRuns: deletedCronRuns.length,
  }
}
