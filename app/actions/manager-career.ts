"use server"

import { auth } from "@/lib/auth"
import { isAdminEmail } from "@/lib/admin"
import { db } from "@/lib/db"
import { managerCareer, managerSquadPlayer } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { getPlayerMarketValueMapByIds } from "@/lib/search/market-index"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import {
  DIFFICULTY_SETTINGS,
  CLUB_LOGO_FILES,
  STARTING_XI_SIZE,
  BENCH_SIZE,
  isValidFormationId,
  getFormationSlots,
  type ManagerDifficulty,
} from "@/lib/games/manager-career"
import { isPlayerPosition, type PlayerPosition } from "@/lib/player-positions"
import { DUEL_SELECTABLE_LEAGUE_IDS } from "@/lib/leagues"

/**
 * Her kullanıcı verisine dokunan action bu helper'dan geçmek ZORUNDA — bkz.
 * app/actions/favorites.ts (aynı desen).
 *
 * Menajer kariyeri oyunu henüz yayında değil, sadece admin hesabı test
 * edebilir. Sayfa (`/oyunlar/kulubunu-kur`) zaten admin olmayanları
 * yönlendiriyor ama biri action'ı doğrudan çağırırsa (devtools, eski sekme
 * vb.) burada da aynı kontrol tekrar edilir.
 */
async function getUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")
  if (!isAdminEmail(session.user.email)) throw new Error("Unauthorized")
  return session.user.id
}

export interface ManagerCareerSummary {
  id: string
  difficulty: ManagerDifficulty
  clubName: string
  managerName: string
  logoFile: string
  leagueId: number
  formation: string
  status: "building" | "active"
}

/** Kullanıcının mevcut kariyerini okur — hiç kariyeri yoksa null. */
export async function getMyManagerCareer(): Promise<ManagerCareerSummary | null> {
  const userId = await getUserId()
  const rows = await db.select().from(managerCareer).where(eq(managerCareer.userId, userId)).limit(1)
  if (rows.length === 0) return null
  const row = rows[0]
  return {
    id: row.id,
    difficulty: row.difficulty as ManagerDifficulty,
    clubName: row.clubName,
    managerName: row.managerName,
    logoFile: row.logoFile,
    leagueId: row.leagueId,
    formation: row.formation,
    status: row.status as "building" | "active",
  }
}

export interface SquadPlayerInput {
  playerId: number
  playerName: string
  photo: string | null
  realTeamName: string | null
  realTeamLogo: string | null
  role: PlayerPosition
  /** İstemcinin gösterdiği fiyat — GÜVENİLMEZ, sunucu her zaman DB'deki gerçek değeri baz alır. */
  clientPriceEur: number
  slot: { kind: "starting"; slotKey: string } | { kind: "bench"; benchIndex: number }
}

export interface CreateManagerCareerInput {
  difficulty: ManagerDifficulty
  logoFile: string
  clubName: string
  managerName: string
  leagueId: number
  formation: string
  squad: SquadPlayerInput[]
}

/**
 * Yeni bir menajer kariyeri kaydeder. Kullanıcının zaten bir kariyeri varsa
 * ÖNCE onu (ve kadrosunu, cascade ile) siler — aynı anda sadece tek bir
 * aktif kariyer desteklenir.
 *
 * Bütçe ve fiyatlar İSTEMCİDEN GELEN değerlere göre değil, oyuncuların
 * `playerMarketValue` tablosundaki ANLIK gerçek değerine göre sunucuda
 * yeniden hesaplanır ve doğrulanır — istemci hiçbir zaman parayla ilgili
 * son kararı veremez.
 */
export async function createManagerCareer(
  input: CreateManagerCareerInput,
): Promise<{ ok: true; careerId: string } | { ok: false; error: string }> {
  const userId = await getUserId()

  // --- Temel doğrulamalar -----------------------------------------------
  if (!DIFFICULTY_SETTINGS[input.difficulty]) return { ok: false, error: "invalidDifficulty" }
  if (!CLUB_LOGO_FILES.includes(input.logoFile)) return { ok: false, error: "invalidLogo" }
  if (!DUEL_SELECTABLE_LEAGUE_IDS.includes(input.leagueId)) return { ok: false, error: "invalidLeague" }
  if (!isValidFormationId(input.formation)) return { ok: false, error: "invalidFormation" }

  const clubName = input.clubName.trim().slice(0, 40)
  const managerName = input.managerName.trim().slice(0, 40)
  if (clubName.length < 2 || managerName.length < 2) return { ok: false, error: "invalidNames" }

  const starting = input.squad.filter((s) => s.slot.kind === "starting")
  const bench = input.squad.filter((s) => s.slot.kind === "bench")
  if (starting.length !== STARTING_XI_SIZE || bench.length !== BENCH_SIZE) {
    return { ok: false, error: "incompleteSquad" }
  }

  const slots = getFormationSlots(input.formation)
  const slotByKey = new Map(slots.map((s) => [s.key, s]))
  const usedSlotKeys = new Set<string>()
  const usedBenchIndices = new Set<number>()
  const seenPlayerIds = new Set<number>()

  for (const s of input.squad) {
    if (!isPlayerPosition(s.role)) return { ok: false, error: "invalidPlayer" }
    if (seenPlayerIds.has(s.playerId)) return { ok: false, error: "duplicatePlayer" }
    seenPlayerIds.add(s.playerId)

    if (s.slot.kind === "starting") {
      const slotDef = slotByKey.get(s.slot.slotKey)
      if (!slotDef) return { ok: false, error: "invalidSlot" }
      if (usedSlotKeys.has(s.slot.slotKey)) return { ok: false, error: "duplicateSlot" }
      usedSlotKeys.add(s.slot.slotKey)
    } else {
      if (s.slot.benchIndex < 0 || s.slot.benchIndex >= BENCH_SIZE) return { ok: false, error: "invalidSlot" }
      if (usedBenchIndices.has(s.slot.benchIndex)) return { ok: false, error: "duplicateSlot" }
      usedBenchIndices.add(s.slot.benchIndex)
    }
  }
  // Her formasyon slotu doldurulmuş olmalı.
  if (usedSlotKeys.size !== slots.length) return { ok: false, error: "incompleteSquad" }

  // --- Sunucu tarafı fiyat/bütçe doğrulaması -----------------------------
  const playerIds = input.squad.map((s) => s.playerId)
  const realPrice = await getPlayerMarketValueMapByIds(playerIds)

  let totalSpent = 0
  for (const s of input.squad) {
    const price = realPrice.get(s.playerId)
    if (price === undefined) return { ok: false, error: "playerPriceUnavailable" }
    totalSpent += price
  }

  const budget = DIFFICULTY_SETTINGS[input.difficulty].budgetEur
  if (totalSpent > budget) return { ok: false, error: "budgetExceeded" }

  // --- Kayıt: eski kariyer (varsa) silinir, yenisi eklenir ---------------
  const careerId = crypto.randomUUID()
  await db.transaction(async (tx) => {
    await tx.delete(managerCareer).where(eq(managerCareer.userId, userId))

    await tx.insert(managerCareer).values({
      id: careerId,
      userId,
      difficulty: input.difficulty,
      startingBudgetEur: String(budget),
      opponentStrengthPercent: DIFFICULTY_SETTINGS[input.difficulty].opponentStrengthPercent,
      logoFile: input.logoFile,
      clubName,
      managerName,
      leagueId: input.leagueId,
      formation: input.formation,
      status: "active",
    })

    await tx.insert(managerSquadPlayer).values(
      input.squad.map((s) => ({
        id: crypto.randomUUID(),
        careerId,
        playerId: s.playerId,
        playerName: s.playerName,
        photo: s.photo,
        realTeamName: s.realTeamName,
        realTeamLogo: s.realTeamLogo,
        position: s.role,
        priceEur: String(realPrice.get(s.playerId)),
        role: s.slot.kind,
        slotKey: s.slot.kind === "starting" ? s.slot.slotKey : null,
        benchIndex: s.slot.kind === "bench" ? s.slot.benchIndex : null,
      })),
    )
  })

  revalidatePath("/oyunlar")
  return { ok: true, careerId }
}

/** Kullanıcının kariyerini (ve kadrosunu) tamamen siler — "yeniden başla" akışı için. */
export async function deleteMyManagerCareer(): Promise<void> {
  const userId = await getUserId()
  await db.delete(managerCareer).where(eq(managerCareer.userId, userId))
  revalidatePath("/oyunlar")
}
