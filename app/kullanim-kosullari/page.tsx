import type { Metadata } from "next"
import { getServerLocale } from "@/lib/i18n/server-locale"
import { translate } from "@/lib/i18n/dictionaries"
import { LegalPageShell } from "@/components/legal-page-shell"

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  return {
    title: translate(locale, "meta.termsOfUse.title"),
    description: translate(locale, "meta.termsOfUse.description"),
  }
}

export default function TermsOfUsePage() {
  return (
    <LegalPageShell title="Kullanım Koşulları" updatedLabel="Son güncelleme: 2026">
      <p>
        edcompanyofficial.com (&quot;Platform&quot;) adresine erişerek ve bu platformu kullanarak aşağıdaki
        kullanım koşullarını kabul etmiş sayılırsınız. Lütfen platformu kullanmadan önce bu koşulları dikkatlice
        okuyun.
      </p>

      <h2>Hizmetin Kapsamı</h2>
      <p>
        ED Company, yapay zeka destekli Monte Carlo simülasyonları kullanarak futbol maçları için istatistiksel
        skor tahminleri, kazanma olasılıkları ve taktiksel analizler sunar. Platform ayrıca oyuncu piyasa değeri
        ve mevki verilerini üçüncü taraf kaynaklardan derleyerek görüntüler.
      </p>

      <h2>Tahminler Yatırım veya Bahis Tavsiyesi Değildir</h2>
      <p>
        <strong>Platformda sunulan tüm tahminler, istatistikler ve analizler yalnızca bilgilendirme ve eğlence
        amaçlıdır.</strong> Bu içerikler kesinlik iddiası taşımaz, finansal yatırım tavsiyesi, bahis tavsiyesi veya
        herhangi bir garanti niteliğinde değildir. Kullanıcılar, bu bilgilere dayanarak alacakları her türlü
        kararın (bahis, yatırım veya başka bir eylem) sorumluluğunun tamamen kendilerine ait olduğunu kabul eder.
        ED Company, tahminlerin doğruluğu veya bu tahminlere dayanılarak oluşabilecek herhangi bir maddi/manevi
        kayıptan sorumlu tutulamaz.
      </p>

      <h2>Yaş Sınırı</h2>
      <p>
        Platform, 18 yaşın altındaki kullanıcılara yönelik değildir. Reklam ortaklarımızın sunduğu içerikler de
        ilgili yasal düzenlemelere uygun şekilde sunulur.
      </p>

      <h2>Hesap Sorumluluğu</h2>
      <p>
        Bir hesap oluşturduğunuzda, hesap bilgilerinizin gizliliğini korumak ve hesabınız üzerinden yapılan tüm
        işlemlerden sorumlu olmak sizin sorumluluğunuzdadır. Şüpheli bir etkinlik fark ederseniz bizimle iletişime
        geçmelisiniz.
      </p>

      <h2>Fikri Mülkiyet</h2>
      <p>
        Platformdaki tasarım, yazılım, algoritmalar ve özgün içerikler ED Company&apos;ye aittir ve telif hakkı
        yasalarıyla korunmaktadır. İçeriklerin izinsiz kopyalanması veya ticari amaçla yeniden dağıtılması yasaktır.
      </p>

      <h2>Üçüncü Taraf Bağlantılar ve Reklamlar</h2>
      <p>
        Platform, Google AdSense aracılığıyla üçüncü taraf reklamlar gösterebilir. Bu reklamların içeriğinden ED
        Company sorumlu değildir.
      </p>

      <h2>Hizmetin Değiştirilmesi</h2>
      <p>
        ED Company, platformun herhangi bir özelliğini önceden bildirimde bulunmaksızın değiştirme, kısıtlama veya
        durdurma hakkını saklı tutar.
      </p>

      <h2>İletişim</h2>
      <p>
        Bu koşullarla ilgili sorularınız için <a href="/iletisim">iletişim sayfamızı</a> kullanabilirsiniz.
      </p>
    </LegalPageShell>
  )
}
