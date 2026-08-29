import { headers } from "next/headers"
import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { isAdminEmail } from "@/lib/admin"
import { GameDataEmptyState } from "@/components/games/game-data-empty-state"
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

// "Kulübünü Kur" oyunu şu an sadece admin hesabına açık — yayına hazır
// olmadığı için diğer kullanıcılar (giriş yapmış olsalar da) ana sayfaya
// geri yönlendirilir. Alttaki server action'lar (app/actions/manager-career.ts)
// zaten aynı kontrolü tekrar yapıyor, burası sadece sayfanın kendisini kapatır.
export default async function ManagerCareerPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!isAdminEmail(session?.user?.email)) {
    redirect("/")
  }

  return (
    <GameDataEmptyState
      title="Kulübünü Kur"
      description="Kadro kurmak için gereken oyuncu değeri ve mevki verileri şu anda mevcut değil. Yeni veri kaynağı eklendiğinde özellik yeniden açılacak."
    />
  )
}
