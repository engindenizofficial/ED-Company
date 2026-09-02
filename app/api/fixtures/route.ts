import { NextResponse } from "next/server"
import { getFixturesResponse } from "@/lib/fixtures-server"
import {
  getRelativeDateKey,
  normalizeTimeZone,
  SERVER_TIME_ZONE,
} from "@/lib/fixture-datetime"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const timeZone = normalizeTimeZone(searchParams.get("timeZone"), SERVER_TIME_ZONE)
  const requested = searchParams.get("date")
  const today = getRelativeDateKey(0, timeZone)
  const yesterday = getRelativeDateKey(-1, timeZone)
  const tomorrow = getRelativeDateKey(1, timeZone)

  // İstek yalnızca ziyaretçinin yerel dün/bugün/yarın günlerinden biri olabilir.
  const date = requested === yesterday || requested === tomorrow ? requested : today
  const refresh = searchParams.get("refresh") === "1"
  const payload = await getFixturesResponse(date, refresh, timeZone)
  return NextResponse.json(payload)
}
