import type { Metadata } from "next"
import { getServerLocale } from "@/lib/i18n/server-locale"
import { translate } from "@/lib/i18n/dictionaries"
import { LegalPageShell } from "@/components/legal-page-shell"

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  return {
    title: translate(locale, "meta.privacyPolicy.title"),
    description: translate(locale, "meta.privacyPolicy.description"),
  }
}

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell title="Gizlilik Politikası" updatedLabel="Son güncelleme: 2026">
      <p>
        ED Company (&quot;biz&quot;, &quot;bizim&quot;) olarak, edcompanyofficial.com adresinde sunduğumuz futbol
        analiz ve tahmin platformunu kullanan ziyaretçilerimizin gizliliğine önem veriyoruz. Bu politika, hangi
        verileri topladığımızı, bu verileri nasıl kullandığımızı ve reklam ortaklarımızın çerez kullanımını açıklar.
      </p>

      <h2>Topladığımız Veriler</h2>
      <p>
        Siteyi ziyaret ettiğinizde, hizmeti iyileştirmek amacıyla sınırlı ve anonimleştirilmiş kullanım verileri
        toplarız: ziyaret edilen sayfalar, cihaz/tarayıcı bilgisi, yaklaşık konum (ülke/şehir düzeyinde) ve site içi
        etkileşimler. Hesap oluşturduğunuzda ise ad, e-posta adresi ve favori takım/lig tercihleriniz gibi hesap
        bilgilerinizi işleriz.
      </p>

      <h2>Çerezler ve Analiz Araçları</h2>
      <p>
        Sitemiz, oturum yönetimi ve tercihlerinizin (tema, dil) hatırlanması için zorunlu çerezler kullanır. Ayrıca,
        site kullanımını anlamak için Google Analytics ve Vercel Analytics gibi analiz araçlarını kullanırız. Bu
        araçlar, tarayıcınıza anonim tanımlayıcılar içeren çerezler yerleştirebilir.
      </p>

      <h2>Reklamlar ve Google AdSense</h2>
      <p>
        Sitemizde Google AdSense aracılığıyla üçüncü taraf reklamlar gösterilmektedir. Google ve reklam ortakları,
        size ve diğer web sitelerine yaptığınız ziyaretlere dayanarak reklamlar sunmak için çerezler kullanabilir.
        Google&apos;ın reklam çerezlerinin kullanımı, Google&apos;ın{" "}
        <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener noreferrer">
          Reklam Politikaları
        </a>{" "}
        sayfasında açıklanmaktadır. Kişiselleştirilmiş reklamları devre dışı bırakmak isteyen kullanıcılar,{" "}
        <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer">
          Google Reklam Ayarları
        </a>{" "}
        sayfasını ziyaret edebilir.
      </p>

      <h2>Verilerin Paylaşımı</h2>
      <p>
        Kişisel verileriniz, yasal zorunluluklar dışında üçüncü taraflarla satılmaz veya paylaşılmaz. Analiz ve
        reklam hizmeti sağlayıcılarımız (Google gibi), yalnızca kendi gizlilik politikaları kapsamında ve hizmetin
        işleyişi için gerekli ölçüde veriye erişebilir.
      </p>

      <h2>Veri Güvenliği</h2>
      <p>
        Hesap verileriniz şifrelenmiş bağlantılar üzerinden iletilir ve güvenli veritabanı altyapısında saklanır.
        Şifreleriniz tek yönlü olarak hash&apos;lenir; hiçbir zaman düz metin olarak saklanmaz.
      </p>

      <h2>Haklarınız</h2>
      <p>
        Hesabınızla ilişkili kişisel verilerinizin görüntülenmesini, düzeltilmesini veya silinmesini talep etme
        hakkına sahipsiniz. Bu taleplerinizi{" "}
        <a href="/iletisim">iletişim sayfamız</a> üzerinden bize iletebilirsiniz.
      </p>

      <h2>Politika Değişiklikleri</h2>
      <p>
        Bu gizlilik politikası zaman zaman güncellenebilir. Önemli değişiklikler bu sayfa üzerinden
        yayınlanacaktır.
      </p>
    </LegalPageShell>
  )
}
