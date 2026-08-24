import type { ReactNode } from "react"
import type { Locale } from "./dictionaries"

/**
 * Gizlilik Politikası, Kullanım Koşulları ve Hakkımızda sayfalarının zengin
 * (başlık/paragraf/liste/link içeren) içerikleri. `translate()` yalnızca düz
 * string döndürdüğü için bu içerikler ayrı bir dile-göre-JSX haritası olarak
 * tutulur ve ilgili sayfa bileşenlerinde `useLanguage()` ile seçilen locale'e
 * göre render edilir.
 */
export const legalContent: Record<
  Locale,
  {
    privacy: { title: string; body: ReactNode }
    terms: { title: string; body: ReactNode }
    about: { title: string; body: ReactNode }
  }
> = {
  tr: {
    privacy: {
      title: "Gizlilik Politikası",
      body: (
        <>
          <p>
            ED Company (&quot;biz&quot;, &quot;bizim&quot;) olarak, edcompanyofficial.com adresinde sunduğumuz futbol
            analiz ve tahmin platformunu kullanan ziyaretçilerimizin gizliliğine önem veriyoruz. Bu politika, hangi
            verileri topladığımızı, bu verileri nasıl kullandığımızı ve reklam ortaklarımızın çerez kullanımını
            açıklar.
          </p>

          <h2>Topladığımız Veriler</h2>
          <p>
            Siteyi ziyaret ettiğinizde, hizmeti iyileştirmek amacıyla sınırlı ve anonimleştirilmiş kullanım verileri
            toplarız: ziyaret edilen sayfalar, cihaz/tarayıcı bilgisi, yaklaşık konum (ülke/şehir düzeyinde) ve site
            içi etkileşimler. Hesap oluşturduğunuzda ise ad, e-posta adresi ve favori takım/lig tercihleriniz gibi
            hesap bilgilerinizi işleriz.
          </p>

          <h2>Çerezler ve Analiz Araçları</h2>
          <p>
            Sitemiz, oturum yönetimi ve tercihlerinizin (tema, dil) hatırlanması için zorunlu çerezler kullanır.
            Ayrıca, site kullanımını anlamak için Google Analytics ve Vercel Analytics gibi analiz araçlarını
            kullanırız. Bu araçlar, tarayıcınıza anonim tanımlayıcılar içeren çerezler yerleştirebilir.
          </p>

          <h2>Reklamlar ve Google AdSense</h2>
          <p>
            Sitemizde Google AdSense aracılığıyla üçüncü taraf reklamlar gösterilmektedir. Google ve reklam
            ortakları, size ve diğer web sitelerine yaptığınız ziyaretlere dayanarak reklamlar sunmak için çerezler
            kullanabilir. Google&apos;ın reklam çerezlerinin kullanımı, Google&apos;ın{" "}
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
            reklam hizmeti sağlayıcılarımız (Google gibi), yalnızca kendi gizlilik politikaları kapsamında ve
            hizmetin işleyişi için gerekli ölçüde veriye erişebilir.
          </p>

          <h2>Veri Güvenliği</h2>
          <p>
            Hesap verileriniz şifrelenmiş bağlantılar üzerinden iletilir ve güvenli veritabanı altyapısında
            saklanır. Şifreleriniz tek yönlü olarak hash&apos;lenir; hiçbir zaman düz metin olarak saklanmaz.
          </p>

          <h2>Haklarınız</h2>
          <p>
            Hesabınızla ilişkili kişisel verilerinizin görüntülenmesini, düzeltilmesini veya silinmesini talep etme
            hakkına sahipsiniz. Bu taleplerinizi <a href="/iletisim">iletişim sayfamız</a> üzerinden bize
            iletebilirsiniz.
          </p>

          <h2>Politika Değişiklikleri</h2>
          <p>
            Bu gizlilik politikası zaman zaman güncellenebilir. Önemli değişiklikler bu sayfa üzerinden
            yayınlanacaktır.
          </p>
        </>
      ),
    },
    terms: {
      title: "Kullanım Koşulları",
      body: (
        <>
          <p>
            edcompanyofficial.com (&quot;Platform&quot;) adresine erişerek ve bu platformu kullanarak aşağıdaki
            kullanım koşullarını kabul etmiş sayılırsınız. Lütfen platformu kullanmadan önce bu koşulları
            dikkatlice okuyun.
          </p>

          <h2>Hizmetin Kapsamı</h2>
          <p>
            ED Company, yapay zeka destekli Monte Carlo simülasyonları kullanarak futbol maçları için istatistiksel
            skor tahminleri, kazanma olasılıkları ve taktiksel analizler sunar. Platform ayrıca oyuncu piyasa
            değeri ve mevki verilerini üçüncü taraf kaynaklardan derleyerek görüntüler.
          </p>

          <h2>Tahminler Yatırım veya Bahis Tavsiyesi Değildir</h2>
          <p>
            <strong>
              Platformda sunulan tüm tahminler, istatistikler ve analizler yalnızca bilgilendirme ve eğlence
              amaçlıdır.
            </strong>{" "}
            Bu içerikler kesinlik iddiası taşımaz, finansal yatırım tavsiyesi, bahis tavsiyesi veya herhangi bir
            garanti niteliğinde değildir. Kullanıcılar, bu bilgilere dayanarak alacakları her türlü kararın (bahis,
            yatırım veya başka bir eylem) sorumluluğunun tamamen kendilerine ait olduğunu kabul eder. ED Company,
            tahminlerin doğruluğu veya bu tahminlere dayanılarak oluşabilecek herhangi bir maddi/manevi kayıptan
            sorumlu tutulamaz.
          </p>

          <h2>Yaş Sınırı</h2>
          <p>
            Platform, 18 yaşın altındaki kullanıcılara yönelik değildir. Reklam ortaklarımızın sunduğu içerikler de
            ilgili yasal düzenlemelere uygun şekilde sunulur.
          </p>

          <h2>Hesap Sorumluluğu</h2>
          <p>
            Bir hesap oluşturduğunuzda, hesap bilgilerinizin gizliliğini korumak ve hesabınız üzerinden yapılan
            tüm işlemlerden sorumlu olmak sizin sorumluluğunuzdadır. Şüpheli bir etkinlik fark ederseniz bizimle
            iletişime geçmelisiniz.
          </p>

          <h2>Fikri Mülkiyet</h2>
          <p>
            Platformdaki tasarım, yazılım, algoritmalar ve özgün içerikler ED Company&apos;ye aittir ve telif
            hakkı yasalarıyla korunmaktadır. İçeriklerin izinsiz kopyalanması veya ticari amaçla yeniden
            dağıtılması yasaktır.
          </p>

          <h2>Üçüncü Taraf Bağlantılar ve Reklamlar</h2>
          <p>
            Platform, Google AdSense aracılığıyla üçüncü taraf reklamlar gösterebilir. Bu reklamların içeriğinden
            ED Company sorumlu değildir.
          </p>

          <h2>Hizmetin Değiştirilmesi</h2>
          <p>
            ED Company, platformun herhangi bir özelliğini önceden bildirimde bulunmaksızın değiştirme, kısıtlama
            veya durdurma hakkını saklı tutar.
          </p>

          <h2>İletişim</h2>
          <p>
            Bu koşullarla ilgili sorularınız için <a href="/iletisim">iletişim sayfamızı</a> kullanabilirsiniz.
          </p>
        </>
      ),
    },
    about: {
      title: "Hakkımızda",
      body: (
        <>
          <p>
            ED Company, futbol tutkusunu veri bilimiyle birleştiren bir analiz platformudur. Amacımız, günün
            maçlarını sadece izlenen değil, <strong>anlaşılan</strong> bir deneyime dönüştürmek.
          </p>

          <h2>Vizyonumuz</h2>
          <p>
            Futbolun tahmin edilemez doğasını, istatistik ve yapay zekanın gücüyle daha okunabilir kılmayı
            hedefliyoruz. Her kullanıcının, sevdiği takımın maçına girmeden önce sağlam veriye dayalı bir bakış
            açısı edinebilmesini istiyoruz.
          </p>

          <h2>YZ Destekli Analiz Altyapımız</h2>
          <p>
            Platformumuzun kalbinde, her maç için binlerce senaryoyu simüle eden bir <strong>Monte Carlo motoru</strong>{" "}
            yer alır. Bu motor; takım formu, kadro gücü, geçmiş karşılaşmalar ve oyuncu bazlı verileri işleyerek
            skor olasılıklarını ve taktiksel eğilimleri ortaya çıkarır. Ayrıca oyuncu piyasa değerleri ve mevki
            verilerini düzenli olarak güncelleyerek analizlerimizi güncel tutarız.
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
        </>
      ),
    },
  },
  en: {
    privacy: {
      title: "Privacy Policy",
      body: (
        <>
          <p>
            At ED Company (&quot;we&quot;, &quot;our&quot;), we care about the privacy of visitors who use the
            football analysis and prediction platform we provide at edcompanyofficial.com. This policy explains
            what data we collect, how we use it, and how our advertising partners use cookies.
          </p>

          <h2>Data We Collect</h2>
          <p>
            When you visit the site, we collect limited and anonymized usage data to improve the service: pages
            visited, device/browser information, approximate location (at country/city level), and on-site
            interactions. When you create an account, we process account information such as your name, email
            address, and favorite team/league preferences.
          </p>

          <h2>Cookies and Analytics Tools</h2>
          <p>
            Our site uses essential cookies for session management and remembering your preferences (theme,
            language). We also use analytics tools such as Google Analytics and Vercel Analytics to understand how
            the site is used. These tools may place cookies containing anonymous identifiers in your browser.
          </p>

          <h2>Advertising and Google AdSense</h2>
          <p>
            Our site displays third-party ads via Google AdSense. Google and its advertising partners may use
            cookies to serve ads based on your visits to this and other websites. Google&apos;s use of advertising
            cookies is explained on Google&apos;s{" "}
            <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener noreferrer">
              Ads Policies
            </a>{" "}
            page. Users who want to opt out of personalized advertising can visit{" "}
            <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer">
              Google Ads Settings
            </a>
            .
          </p>

          <h2>Data Sharing</h2>
          <p>
            Your personal data is not sold or shared with third parties except where legally required. Our
            analytics and advertising service providers (such as Google) may only access data within the scope of
            their own privacy policies and to the extent necessary for the service to function.
          </p>

          <h2>Data Security</h2>
          <p>
            Your account data is transmitted over encrypted connections and stored on secure database
            infrastructure. Your passwords are hashed one-way and are never stored in plain text.
          </p>

          <h2>Your Rights</h2>
          <p>
            You have the right to request access to, correction of, or deletion of the personal data associated
            with your account. You can submit such requests through our{" "}
            <a href="/iletisim">contact page</a>.
          </p>

          <h2>Policy Changes</h2>
          <p>
            This privacy policy may be updated from time to time. Significant changes will be published on this
            page.
          </p>
        </>
      ),
    },
    terms: {
      title: "Terms of Use",
      body: (
        <>
          <p>
            By accessing and using edcompanyofficial.com (the &quot;Platform&quot;), you are deemed to have
            accepted the following terms of use. Please read these terms carefully before using the Platform.
          </p>

          <h2>Scope of the Service</h2>
          <p>
            ED Company provides statistical score predictions, win probabilities, and tactical analyses for
            football matches using AI-powered Monte Carlo simulations. The Platform also displays player market
            value and position data compiled from third-party sources.
          </p>

          <h2>Predictions Are Not Investment or Betting Advice</h2>
          <p>
            <strong>
              All predictions, statistics, and analyses provided on the Platform are for informational and
              entertainment purposes only.
            </strong>{" "}
            This content makes no claim of certainty and does not constitute financial investment advice, betting
            advice, or any kind of guarantee. Users acknowledge that they are solely responsible for any decisions
            (betting, investment, or otherwise) made based on this information. ED Company cannot be held
            responsible for the accuracy of predictions or for any material or non-material loss that may arise
            from reliance on them.
          </p>

          <h2>Age Restriction</h2>
          <p>
            The Platform is not intended for users under the age of 18. Content provided by our advertising
            partners is also presented in accordance with applicable legal regulations.
          </p>

          <h2>Account Responsibility</h2>
          <p>
            When you create an account, you are responsible for keeping your account information confidential and
            for all activity that occurs through your account. You should contact us if you notice any suspicious
            activity.
          </p>

          <h2>Intellectual Property</h2>
          <p>
            The design, software, algorithms, and original content on the Platform belong to ED Company and are
            protected by copyright law. Unauthorized copying or commercial redistribution of the content is
            prohibited.
          </p>

          <h2>Third-Party Links and Advertising</h2>
          <p>
            The Platform may display third-party ads via Google AdSense. ED Company is not responsible for the
            content of these ads.
          </p>

          <h2>Changes to the Service</h2>
          <p>
            ED Company reserves the right to modify, restrict, or discontinue any feature of the Platform without
            prior notice.
          </p>

          <h2>Contact</h2>
          <p>
            For questions regarding these terms, you can use our <a href="/iletisim">contact page</a>.
          </p>
        </>
      ),
    },
    about: {
      title: "About Us",
      body: (
        <>
          <p>
            ED Company is an analytics platform that combines a passion for football with data science. Our goal
            is to turn the day&apos;s matches into an experience that is not just watched, but{" "}
            <strong>understood</strong>.
          </p>

          <h2>Our Vision</h2>
          <p>
            We aim to make football&apos;s unpredictable nature more legible through the power of statistics and
            artificial intelligence. We want every user to be able to gain a data-driven perspective before their
            favorite team&apos;s match kicks off.
          </p>

          <h2>Our AI-Powered Analytics Infrastructure</h2>
          <p>
            At the heart of our platform is a <strong>Monte Carlo engine</strong> that simulates thousands of
            scenarios for every match. This engine processes team form, squad strength, past encounters, and
            player-level data to surface score probabilities and tactical tendencies. We also regularly update
            player market values and position data to keep our analyses current.
          </p>

          <h2>What We Offer</h2>
          <ul>
            <li>AI-powered score predictions and win probabilities for the day&apos;s matches</li>
            <li>Detailed team- and player-level statistics dashboards</li>
            <li>Favorite team and league tracking</li>
            <li>Games based on market value and position data</li>
          </ul>

          <p>
            At ED Company, we continue to deliver an experience that adds value for football fans without
            compromising on transparency and accuracy.
          </p>
        </>
      ),
    },
  },
}
