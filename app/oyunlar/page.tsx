import { headers } from "next/headers"
import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { isAdminEmail } from "@/lib/admin"
import { GamesHubContent } from "@/components/games/games-hub-content"
import { getServerLocale } from "@/lib/i18n/server-locale"
import { translate } from "@/lib/i18n/dictionaries"

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  const title = translate(locale, "meta.games.title")
  const description = translate(locale, "meta.games.description")
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  }
}

export const dynamic = "force-dynamic"

export default async function GamesHubPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  const isAdmin = isAdminEmail(session?.user?.email)

  return <GamesHubContent isAdmin={isAdmin} />
}
