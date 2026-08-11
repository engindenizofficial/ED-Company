/**
 * Admin yetkisi, tek bir hesap için e-posta bazlı sabit bir liste ile
 * kontrol edilir. Şu an için ekstra bir "role" alanı/migration gerektirmez;
 * ileride birden fazla admin gerekirse burası genişletilebilir.
 */
const ADMIN_EMAILS = ["denizefasanevi7777@gmail.com"]

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.toLowerCase())
}
