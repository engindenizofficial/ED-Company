"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { isAdminEmail } from "@/lib/admin"
import { resetAllPlayerPowerData, recomputeAllPlayerPowerData } from "@/lib/player-power-sync"

// ---------------------------------------------------------------------------
// Admin panelinde oyuncu güç motorunun (player_power) iki manuel bakım
// butonu için kullanılan action'lar. İkisi de dış API'ye (API-Football)
// gitmez, SADECE DB'deki mevcut veriyi (piyasa değeri + biriken sezon
// rating) okur/yazar — bu yüzden tam-sezon backfill'in (lib/player-power-
// backfill.ts) aksine zincirleme/after() gerektirmez, tek istekte biter.
//
// - "Sıfırla": tüm satırların güç alanlarını literal 0'a çeker (SİLMEZ —
//   bkz. resetAllPlayerPowerData'daki açıklama, ?? fallback'i).
// - "Yeniden Hesapla": tüm satırların marketPower/basePower/currentPower'ını
//   güncel piyasa değeri + mevcut biriken rating'den yeniden hesaplayıp
//   ÜSTÜNE YAZAR (silmeden çalıştırılsa da fark etmez, her zaman overwrite).
// ---------------------------------------------------------------------------

const ADMIN_PATH = "/admin"

async function requireAdmin(): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!isAdminEmail(session?.user?.email)) {
    console.error(
      `[v0] Admin yetkisi reddedildi (oyuncu güç bakımı) — oturumdaki e-posta: ${session?.user?.email ?? "(oturum yok)"}`,
    )
    throw new Error(`Unauthorized: ${session?.user?.email ?? "no session"}`)
  }
}

export interface ResetPlayerPowerResult {
  resetCount: number
}

/** Admin'in "Oyuncu Güçlerini Sıfırla" butonu — bkz. resetAllPlayerPowerData. */
export async function resetPlayerPowerNow(): Promise<ResetPlayerPowerResult> {
  await requireAdmin()
  const result = await resetAllPlayerPowerData()
  revalidatePath(ADMIN_PATH)
  return result
}

export interface RecomputePlayerPowerResult {
  updated: number
}

/** Admin'in "Yeniden Hesapla" butonu — bkz. recomputeAllPlayerPowerData. */
export async function recomputePlayerPowerNow(): Promise<RecomputePlayerPowerResult> {
  await requireAdmin()
  const result = await recomputeAllPlayerPowerData()
  revalidatePath(ADMIN_PATH)
  return result
}
