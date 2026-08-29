import type { NextRequest } from "next/server"
import { GET as searchPlayers } from "@/app/api/players/search/route"

export const dynamic = "force-dynamic"

export interface HomeSearchPlayerResult {
  id: number
  name: string
  photo: string | null
  nationality: string | null
  age: number | null
  teamId: number | null
  teamName: string | null
  teamLogo: string | null
  marketValueEur?: number | null
}

export async function GET(request: NextRequest) {
  return searchPlayers(request)
}
