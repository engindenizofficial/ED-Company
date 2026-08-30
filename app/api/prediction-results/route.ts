import { NextResponse } from "next/server"
import { getPredictionResults, getAllTimePredictionResults } from "@/lib/redis"

export const dynamic = "force-dynamic"

function todayTR(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" })
}

/** Tüm tahmin sonuçlarını döndürür (all=1 parametresiyle tüm zamanlar) */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const all = searchParams.get("all") === "1"

  if (all) {
    const results = await getAllTimePredictionResults()
    return NextResponse.json({ results })
  }

  const date = searchParams.get("date") ?? todayTR()
  const results = await getPredictionResults(date)
  return NextResponse.json({ date, results })
}

