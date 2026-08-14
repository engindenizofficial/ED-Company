import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { AuthForm } from '@/components/auth-form'
import { getServerLocale } from '@/lib/i18n/server-locale'
import { translate } from '@/lib/i18n/dictionaries'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  return {
    title: translate(locale, 'meta.signIn.title'),
  }
}

export default async function SignInPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect('/')

  return <AuthForm mode="sign-in" />
}
