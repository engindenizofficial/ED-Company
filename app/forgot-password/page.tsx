import type { Metadata } from 'next'
import { ForgotPasswordForm } from '@/components/forgot-password-form'
import { getServerLocale } from '@/lib/i18n/server-locale'
import { translate } from '@/lib/i18n/dictionaries'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  const title = translate(locale, 'meta.forgotPassword.title')
  const description = translate(locale, 'meta.forgotPassword.description')
  return {
    title,
    description,
    robots: { index: false, follow: false },
  }
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />
}
