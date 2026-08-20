import type { Metadata } from "next"
import { getServerLocale } from "@/lib/i18n/server-locale"
import { translate } from "@/lib/i18n/dictionaries"
import { LegalPageShell } from "@/components/legal-page-shell"

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  return {
    title: translate(locale, "meta.aboutUs.title"),
    description: translate(locale, "meta.aboutUs.description"),
  }
}

export default function AboutUsPage() {
  return (
    <LegalPageShell title="Hakkımızda">
      <p>
        ED Company, futbol tutkusunu veri bilimiyle birleştiren bir analiz platformudur. Amacımız, günün
        maçlarını sadece izlenen değil, <strong>anlaşılan</strong> bir deneyime dönüştürmek.
      </p>

      <h2>Vizyonumuz</h2>
      <p>
        Futbolun tahmin edilemez doğasını, istatistik ve yapay zekanın gücüyle daha okunabilir kılmayı
        hedefliyoruz. Her kullanıcının, sevdiği takımın maçına girmeden önce sağlam veriye dayalı bir bakış açısı
        edinebilmesini istiyoruz.
      </p>

      <h2>YZ Destekli Analiz Altyapımız</h2>
      <p>
        Platformumuzun kalbinde, her maç için binlerce senaryoyu simüle eden bir <strong>Monte Carlo motoru</strong>{" "}
        yer alır. Bu motor; takım formu, kadro gücü, geçmiş karşılaşmalar ve oyuncu bazlı verileri işleyerek skor
        olasılıklarını ve taktiksel eğilimleri ortaya çıkarır. Ayrıca oyuncu piyasa değerleri ve mevki verilerini
        düzenli olarak güncelleyerek analizlerimizi güncel tutarız.
      </p>

      <h2>Neler Sunuyoruz</h2>
      <ul>
        <li>Günün maçları için YZ destekli skor tahminleri ve kazanma olasılıkları</li>
        <li>Takım ve oyuncu bazlı detaylı istatistik panelleri</li>
        <li>Favori takım ve lig takibi</li>
        <li>Piyasa değeri ve mevki verilerine dayalı oyunlar</li>
      </ul>

      <p>
        ED Company olarak, şeffaflık ve doğruluk ilkelerinden ödün vermeden, futbolseverlere değer katan bir
        deneyim sunmaya devam ediyoruz.
      </p>
    </LegalPageShell>
  )
}
