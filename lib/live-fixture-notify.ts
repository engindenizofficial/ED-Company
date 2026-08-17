import { db } from "@/lib/db"
import { favorite, liveFixtureNotificationState } from "@/lib/db/schema"
import { and, eq, inArray } from "drizzle-orm"
import { getFixturesByDate } from "@/lib/api-football"
import { sendPushToUsers, type PushPayload } from "@/lib/push-notifications"
import type { Fixture } from "@/lib/types"

// ---------------------------------------------------------------------------
// Canlı maç bildirim motoru — favori takımlardan biri sahadayken gol, maç
// başlangıcı, devre arası, 2. yarı başlangıcı ve maç bitişinde push bildirimi
// tetikler. Durum karşılaştırması liveFixtureNotificationState tablosunda
// tutulur ki aynı olay iki kez gönderilmesin (bkz. lib/db/schema.ts).
//
// Bu modül SADECE "bir taramada ne değişti, kime bildirim gitmeli" mantığını
// içerir — HTTP zincirleme (self-fetch, heartbeat, budget) app/api/cron/
// live-fixture-notifications/route.ts'de, market-value-cron-run.ts ile aynı
// desende yaşar.
// ---------------------------------------------------------------------------

/** API-Football statusShort değerlerinden "canlı veya az önce bitmiş" sayılanlar. */
const LIVE_OR_FINISHED = new Set(["1H", "HT", "2H", "ET", "P", "BT", "LIVE", "FT", "AET", "PEN"])

/** Bu statusShort'a sahip bir maç hâlâ takip edilmeli mi (yoksa tarama listesinden düşsün mü)? */
const STILL_TRACKING = new Set(["1H", "HT", "2H", "ET", "P", "BT", "LIVE"])

function todayIstanbulDate(): string {
  // API-Football tarih parametresi YYYY-MM-DD, TR saatine göre "bugün".
  const now = new Date()
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)
  const y = parts.find((p) => p.type === "year")?.value
  const m = parts.find((p) => p.type === "month")?.value
  const d = parts.find((p) => p.type === "day")?.value
  return `${y}-${m}-${d}`
}

interface FixtureEvent {
  fixture: Fixture
  payload: PushPayload
}

/** İki durum arasındaki farkı olay listesine çevirir (bir taramada birden fazla olay birikmiş olabilir, örn. gol + maç bitişi aynı anda). */
function diffFixtureEvents(
  fixture: Fixture,
  prev: { lastStatusShort: string | null; lastHomeGoals: number; lastAwayGoals: number } | null,
): PushPayload[] {
  const events: PushPayload[] = []
  const homeGoals = fixture.goalsHome ?? 0
  const awayGoals = fixture.goalsAway ?? 0
  const prevStatus = prev?.lastStatusShort ?? null
  const prevHomeGoals = prev?.lastHomeGoals ?? 0
  const prevAwayGoals = prev?.lastAwayGoals ?? 0
  const scoreLine = `${fixture.home.name} ${homeGoals}-${awayGoals} ${fixture.away.name}`
  const tag = `fixture-${fixture.id}`
  const url = `/?fixture=${fixture.id}`

  // Gol(ler) — nadiren aynı taramada iki gol birden gelebilir (30s aralık +
  // API gecikmesi), her ikisi de bildirilsin diye fark kadar tekrarlanır.
  const newHomeGoals = homeGoals - prevHomeGoals
  const newAwayGoals = awayGoals - prevAwayGoals
  for (let i = 0; i < Math.max(newHomeGoals, 0); i++) {
    events.push({ title: `GOL! ${fixture.home.name}`, body: scoreLine, url, tag })
  }
  for (let i = 0; i < Math.max(newAwayGoals, 0); i++) {
    events.push({ title: `GOL! ${fixture.away.name}`, body: scoreLine, url, tag })
  }

  // Durum geçişleri
  if (prevStatus !== fixture.statusShort) {
    if (fixture.statusShort === "1H" && (prevStatus === "NS" || prevStatus === null || prevStatus === "TBD")) {
      events.push({ title: "Maç Başladı", body: `${fixture.home.name} - ${fixture.away.name}`, url, tag })
    } else if (fixture.statusShort === "HT" && prevStatus === "1H") {
      events.push({ title: "Devre Arası", body: scoreLine, url, tag })
    } else if (fixture.statusShort === "2H" && prevStatus === "HT") {
      events.push({ title: "2. Yarı Başladı", body: scoreLine, url, tag })
    } else if (["FT", "AET", "PEN"].includes(fixture.statusShort) && STILL_TRACKING.has(prevStatus ?? "")) {
      events.push({ title: "Maç Bitti", body: scoreLine, url, tag })
    }
  }

  return events
}

/**
 * Bugünün fikstürlerinden canlı/az önce bitmiş olanları alır, önceki
 * bilinen duruma göre yeni olayları tespit eder, favori kullanıcılara push
 * gönderir ve durumu günceller.
 *
 * Döner: bu taramada işlenen canlı maç sayısı (0 ise "boşta" moda geçilebilir).
 */
export async function scanLiveFixturesOnce(): Promise<{ liveCount: number; eventsSent: number }> {
  const date = todayIstanbulDate()
  const fixtures = await getFixturesByDate(date)
  const liveFixtures = fixtures.filter((f) => LIVE_OR_FINISHED.has(f.statusShort))

  if (liveFixtures.length === 0) {
    return { liveCount: 0, eventsSent: 0 }
  }

  const fixtureIds = liveFixtures.map((f) => String(f.id))
  const prevStates = await db
    .select()
    .from(liveFixtureNotificationState)
    .where(inArray(liveFixtureNotificationState.fixtureId, fixtureIds))
  const prevById = new Map(prevStates.map((s) => [s.fixtureId, s]))

  let eventsSent = 0

  for (const fixture of liveFixtures) {
    const idStr = String(fixture.id)
    const prev = prevById.get(idStr) ?? null
    const events = diffFixtureEvents(fixture, prev)

    if (events.length > 0) {
      const teamIds = [fixture.home.id, fixture.away.id]
      const favoriteRows = await db
        .select({ userId: favorite.userId })
        .from(favorite)
        .where(and(eq(favorite.type, "team"), inArray(favorite.itemId, teamIds)))
      const userIds = [...new Set(favoriteRows.map((r) => r.userId))]

      if (userIds.length > 0) {
        for (const payload of events) {
          await sendPushToUsers(userIds, payload)
          eventsSent++
        }
      }
    }

    // Durumu her taramada güncelle (olay olmasa da statusShort/skor senkron kalsın).
    await db
      .insert(liveFixtureNotificationState)
      .values({
        fixtureId: idStr,
        lastStatusShort: fixture.statusShort,
        lastHomeGoals: fixture.goalsHome ?? 0,
        lastAwayGoals: fixture.goalsAway ?? 0,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: liveFixtureNotificationState.fixtureId,
        set: {
          lastStatusShort: fixture.statusShort,
          lastHomeGoals: fixture.goalsHome ?? 0,
          lastAwayGoals: fixture.goalsAway ?? 0,
          updatedAt: new Date(),
        },
      })
  }

  return { liveCount: liveFixtures.length, eventsSent }
}
