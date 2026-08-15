import { headers } from "next/headers"
import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { isAdminEmail } from "@/lib/admin"
import { ManagerCareerHero } from "@/components/games/manager-career/manager-career-hero"
import { getServerLocale } from "@/lib/i18n/server-locale"
import { translate } from "@/lib/i18n/dictionaries"

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  const title = translate(locale, "meta.managerCareer.title")
  const description = translate(locale, "meta.managerCareer.description")
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  }
}

export const dynamic = "force-dynamic"

// Bu oyun henüz yayına hazır değil — sadece admin hesabı erişebilir.
// Doğrudan URL ile de olsa normal kullanıcılar buraya giremez.
export default async function ManagerCareerPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!isAdminEmail(session?.user?.email)) {
    redirect("/oyunlar")
  }

  return <ManagerCareerHero />
}
