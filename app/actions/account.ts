"use server"

import { auth, baseURL } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  favorite,
  managerCareer,
  managerFixture,
  marketValueDuelDailyResult,
  marketValueDuelStats,
  userPreferences,
  verification,
} from "@/lib/db/schema"
import { and, eq, sql } from "drizzle-orm"
import { cookies, headers } from "next/headers"
import { Resend } from "resend"
import { z } from "zod"
import { isValidAccentColor, DEFAULT_ACCENT_COLOR } from "@/lib/accent-colors"
import { ACCENT_COOKIE, LOCALE_COOKIE, THEME_COOKIE } from "@/lib/theme-cookies"
import type { Locale } from "@/lib/i18n/dictionaries"
import { getAccountDeletionEmail } from "@/lib/i18n/email-templates"

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

const DELETE_TOKEN_TTL_MS = 1000 * 60 * 60

const preferencesSchema = z
  .object({
    themeMode: z.enum(["system", "light", "dark"]).optional(),
    themeColor: z.string().refine(isValidAccentColor).optional(),
    locale: z.enum(["tr", "en"]).optional(),
    notificationsEnabled: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one preference is required")

export type ThemeMode = "system" | "light" | "dark"

export type AccountPreferences = {
  themeMode: ThemeMode
  themeColor: string
  locale: Locale
  notificationsEnabled: boolean
  exists: boolean
}

export type AccountSummary = {
  favoriteCount: number
  gamesPlayed: number
  correctAnswers: number
  career: null | {
    clubName: string
    status: string
    playedMatches: number
  }
}

async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")
  return session.user
}

const accountPasswordSchema = z.string().min(8).max(128)

export async function setAccountPassword(newPassword: string): Promise<void> {
  accountPasswordSchema.parse(newPassword)
  const requestHeaders = await headers()
  const session = await auth.api.getSession({ headers: requestHeaders })
  if (!session?.user) throw new Error("Unauthorized")

  const accounts = await auth.api.listUserAccounts({ headers: requestHeaders })
  if (accounts.some((account) => account.providerId === "credential")) {
    throw new Error("Credential account already exists")
  }

  await auth.api.setPassword({
    body: { newPassword },
    headers: requestHeaders,
  })
}

export async function getAccountPreferences(): Promise<AccountPreferences> {
  const userId = (await getSessionUser()).id
  const rows = await db
    .select({
      themeMode: userPreferences.themeMode,
      themeColor: userPreferences.themeColor,
      locale: userPreferences.locale,
      notificationsEnabled: userPreferences.notificationsEnabled,
    })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1)

  const preference = rows[0]
  return preference
    ? {
        themeMode: preference.themeMode === "dark" || preference.themeMode === "light" ? preference.themeMode : "system",
        themeColor: isValidAccentColor(preference.themeColor) ? preference.themeColor : DEFAULT_ACCENT_COLOR,
        locale: preference.locale === "en" ? "en" : "tr",
        notificationsEnabled: preference.notificationsEnabled,
        exists: true,
      }
    : {
        themeMode: "system",
        themeColor: DEFAULT_ACCENT_COLOR,
        locale: "tr",
        notificationsEnabled: false,
        exists: false,
      }
}

export async function updateAccountPreferences(input: unknown): Promise<void> {
  const userId = (await getSessionUser()).id
  const values = preferencesSchema.parse(input)
  const now = new Date()
  const cookieStore = await cookies()
  const cookieTheme = cookieStore.get(THEME_COOKIE)?.value
  const cookieAccent = cookieStore.get(ACCENT_COOKIE)?.value
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value

  await db
    .insert(userPreferences)
    .values({
      userId,
      themeMode: values.themeMode ?? (cookieTheme === "dark" || cookieTheme === "light" ? cookieTheme : "system"),
      themeColor: values.themeColor ?? (isValidAccentColor(cookieAccent) ? cookieAccent : DEFAULT_ACCENT_COLOR),
      locale: values.locale ?? (cookieLocale === "en" ? "en" : "tr"),
      notificationsEnabled: values.notificationsEnabled ?? false,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { ...values, updatedAt: now },
    })
}

export async function getAccountSummary(): Promise<AccountSummary> {
  const userId = (await getSessionUser()).id

  const [favoriteRows, normalRows, dailyRows, careerRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(favorite)
      .where(eq(favorite.userId, userId)),
    db
      .select({
        gamesPlayed: sql<number>`coalesce(sum(${marketValueDuelStats.gamesPlayed}), 0)::int`,
        correctAnswers: sql<number>`coalesce(sum(${marketValueDuelStats.totalCorrect}), 0)::int`,
      })
      .from(marketValueDuelStats)
      .where(eq(marketValueDuelStats.userId, userId)),
    db
      .select({
        gamesPlayed: sql<number>`count(*)::int`,
        correctAnswers: sql<number>`coalesce(sum(${marketValueDuelDailyResult.correctCount}), 0)::int`,
      })
      .from(marketValueDuelDailyResult)
      .where(eq(marketValueDuelDailyResult.userId, userId)),
    db
      .select({ id: managerCareer.id, clubName: managerCareer.clubName, status: managerCareer.status })
      .from(managerCareer)
      .where(eq(managerCareer.userId, userId))
      .limit(1),
  ])

  const career = careerRows[0]
  let playedMatches = 0
  if (career) {
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(managerFixture)
      .where(and(eq(managerFixture.careerId, career.id), eq(managerFixture.status, "played")))
    playedMatches = rows[0]?.count ?? 0
  }

  return {
    favoriteCount: favoriteRows[0]?.count ?? 0,
    gamesPlayed: (normalRows[0]?.gamesPlayed ?? 0) + (dailyRows[0]?.gamesPlayed ?? 0),
    correctAnswers: (normalRows[0]?.correctAnswers ?? 0) + (dailyRows[0]?.correctAnswers ?? 0),
    career: career ? { clubName: career.clubName, status: career.status, playedMatches } : null,
  }
}

export async function requestAccountDeletion(locale: Locale = "tr"): Promise<{ email: string }> {
  const user = await getSessionUser()
  const identifier = `delete-account:${user.id}`

  await db.delete(verification).where(eq(verification.identifier, identifier))

  const token = crypto.randomUUID()
  await db.insert(verification).values({
    id: crypto.randomUUID(),
    identifier,
    value: token,
    expiresAt: new Date(Date.now() + DELETE_TOKEN_TTL_MS),
  })

  const url = `${baseURL}/api/account/delete?token=${token}`
  const { subject, html } = getAccountDeletionEmail(locale, user.name ?? user.email, url)

  const { error } = await getResend().emails.send(
    {
      from: "ED Analytics <no-reply@edcompanyofficial.com>",
      to: user.email,
      subject,
      html: html.replace("{{LOGO_URL}}", `${baseURL}/icon-512.png`),
    },
    { idempotencyKey: `delete-account/${user.id}/${token}` },
  )
  if (error) throw new Error(`Account deletion email failed: ${error.message}`)

  return { email: user.email }
}
