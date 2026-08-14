import type { Locale } from "./dictionaries"

/**
 * Hesap silme e-postası, kullanıcının o an uygulamada seçili olan diline göre
 * (tarayıcı diline değil — kullanıcı arayüzde elle değiştirmiş olabilir)
 * gönderilir. Bu yüzden `lib/i18n/dictionaries.ts`'teki genel `t()` sistemini
 * kullanmak yerine, doğrudan bir `locale` parametresi alan ayrı bir şablon
 * fonksiyonu tanımlıyoruz.
 */
export function getAccountDeletionEmail(locale: Locale, userName: string, deleteUrl: string) {
  if (locale === "en") {
    return {
      subject: "Your account deletion request",
      html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f172a;border-radius:12px;">
        <img src="{{LOGO_URL}}" alt="ED Analytics" width="40" height="40" style="border-radius:8px;margin-bottom:16px;display:block;" />
        <h2 style="color:#f8fafc;font-size:20px;margin-bottom:8px;">Account Deletion Request</h2>
        <p style="color:#94a3b8;font-size:14px;margin-bottom:20px;">Hi ${userName},</p>
        <p style="color:#cbd5e1;font-size:14px;margin-bottom:8px;">You requested to permanently delete your account.</p>
        <p style="color:#cbd5e1;font-size:14px;margin-bottom:24px;">
          Clicking the button below will <strong>instantly and permanently delete</strong> your account, including your
          profile information, favorite teams/leagues, and your entire prediction history. This action cannot be undone.
          This link is valid for <strong>1 hour</strong>.
        </p>
        <a href="${deleteUrl}" style="display:inline-block;background:#ef4444;color:#fff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;">Permanently Delete My Account</a>
        <p style="color:#475569;font-size:12px;margin-top:24px;">If you did not make this request, you can safely ignore this email — no changes will be made to your account.</p>
      </div>
    `,
    }
  }

  return {
    subject: "Hesap silme talebiniz",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f172a;border-radius:12px;">
        <img src="{{LOGO_URL}}" alt="ED Analytics" width="40" height="40" style="border-radius:8px;margin-bottom:16px;display:block;" />
        <h2 style="color:#f8fafc;font-size:20px;margin-bottom:8px;">Hesap Silme Talebi</h2>
        <p style="color:#94a3b8;font-size:14px;margin-bottom:20px;">Merhaba ${userName},</p>
        <p style="color:#cbd5e1;font-size:14px;margin-bottom:8px;">Hesabınızı kalıcı olarak silme talebinde bulundunuz.</p>
        <p style="color:#cbd5e1;font-size:14px;margin-bottom:24px;">
          Aşağıdaki butona tıkladığınızda hesabınız; profil bilgileriniz, favori takım/liglerinizi ve tüm tahmin
          geçmişinizle birlikte <strong>anında ve kalıcı olarak silinir</strong>. Bu işlem geri alınamaz. Bu link
          <strong>1 saat</strong> geçerlidir.
        </p>
        <a href="${deleteUrl}" style="display:inline-block;background:#ef4444;color:#fff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;">Hesabımı Kalıcı Olarak Sil</a>
        <p style="color:#475569;font-size:12px;margin-top:24px;">Bu talebi siz oluşturmadıysanız bu e-postayı görmezden gelebilirsiniz, hesabınızda herhangi bir değişiklik yapılmaz.</p>
      </div>
    `,
  }
}
