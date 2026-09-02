"use client"

import {
  CalendarDays,
  CheckCircle2,
  KeyRound,
  Link2,
  Mail,
  MonitorOff,
  Pencil,
  ShieldCheck,
  TriangleAlert,
  User,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { type FormEvent, useMemo, useState } from "react"
import useSWR from "swr"
import { requestAccountDeletion } from "@/app/actions/account"
import { useLanguage } from "@/contexts/language-context"
import { authClient, useSession } from "@/lib/auth-client"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { AccountOverviewCard } from "@/components/account-overview-card"
import { AccountPreferencesCard } from "@/components/account-preferences-card"
import { AccountDataExportCard } from "@/components/account-data-export-card"

type AccountMethod = {
  id: string
  providerId: string
  accountId: string
}

export function AccountSettingsPanel() {
  const { t, locale } = useLanguage()
  const { data: session, refetch } = useSession()
  const router = useRouter()
  const user = session?.user

  const [name, setName] = useState(user?.name ?? "")
  const [nameError, setNameError] = useState<string | null>(null)
  const [nameSuccess, setNameSuccess] = useState(false)
  const [savingName, setSavingName] = useState(false)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

  const [revokingSessions, setRevokingSessions] = useState(false)
  const [sessionsMessage, setSessionsMessage] = useState<"success" | "error" | null>(null)

  const [sendingDelete, setSendingDelete] = useState(false)
  const [deleteSentTo, setDeleteSentTo] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const {
    data: accounts,
    error: accountsError,
    isLoading: accountsLoading,
  } = useSWR<AccountMethod[]>(
    user ? `account-methods:${user.id}` : null,
    async () => {
      const result = await authClient.listAccounts()
      if (result.error) throw new Error("Could not load account methods")
      return (result.data ?? []) as AccountMethod[]
    },
    { revalidateOnFocus: false },
  )

  const hasCredentialAccount = accounts?.some((account) => account.providerId === "credential") ?? false
  const providers = useMemo(() => {
    const providerIds = new Set(accounts?.map((account) => account.providerId) ?? [])
    return [
      { id: "credential", label: t("menu.emailAndPassword"), icon: Mail },
      { id: "google", label: "Google", icon: Link2 },
    ].map((provider) => ({ ...provider, connected: providerIds.has(provider.id) }))
  }, [accounts, t])

  if (!user) return null

  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
  const joinedAt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(user.createdAt))

  async function handleNameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const cleanName = name.trim()
    setNameSuccess(false)

    if (cleanName.length < 2 || cleanName.length > 60) {
      setNameError(t("menu.nameValidation"))
      return
    }

    setSavingName(true)
    setNameError(null)
    const result = await authClient.updateUser({ name: cleanName })
    setSavingName(false)

    if (result.error) {
      setNameError(t("menu.accountUpdateError"))
      return
    }

    setName(cleanName)
    setNameSuccess(true)
    await refetch()
    router.refresh()
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPasswordSuccess(false)

    if (newPassword.length < 8) {
      setPasswordError(t("menu.passwordLength"))
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t("menu.passwordMismatch"))
      return
    }

    setChangingPassword(true)
    setPasswordError(null)
    const result = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    })
    setChangingPassword(false)

    if (result.error) {
      setPasswordError(t("menu.passwordChangeError"))
      return
    }

    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
    setPasswordSuccess(true)
  }

  async function handleRevokeOtherSessions() {
    if (revokingSessions) return
    setRevokingSessions(true)
    setSessionsMessage(null)
    const result = await authClient.revokeOtherSessions()
    setRevokingSessions(false)
    setSessionsMessage(result.error ? "error" : "success")
  }

  async function handleRequestAccountDeletion() {
    if (sendingDelete) return
    setSendingDelete(true)
    setDeleteError(null)
    try {
      const { email } = await requestAccountDeletion(locale)
      setDeleteSentTo(email)
    } catch {
      setDeleteError(t("common.error"))
    } finally {
      setSendingDelete(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 [&>[data-slot=card]]:shrink-0">
      <Card size="sm">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Avatar size="lg">
              {user.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
              <AvatarFallback>{initials || <User aria-hidden="true" />}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
              <CardTitle className="max-w-full truncate">{user.name}</CardTitle>
              <CardDescription className="max-w-full truncate">{user.email}</CardDescription>
              <Badge variant={user.emailVerified ? "default" : "secondary"}>
                {user.emailVerified ? t("menu.verified") : t("menu.unverified")}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays aria-hidden="true" />
            <span>{t("menu.memberSince", { date: joinedAt })}</span>
          </div>
          <Separator />
          <form onSubmit={handleNameSubmit} noValidate>
            <FieldGroup>
              <Field data-invalid={Boolean(nameError)}>
                <FieldLabel htmlFor="account-display-name">{t("menu.displayName")}</FieldLabel>
                <Input
                  id="account-display-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={60}
                  autoComplete="name"
                  aria-invalid={Boolean(nameError)}
                />
                <FieldDescription>{t("menu.displayNameDescription")}</FieldDescription>
                <FieldError>{nameError}</FieldError>
              </Field>
              <Button type="submit" disabled={savingName || name.trim() === user.name}>
                {savingName ? <Spinner data-icon="inline-start" /> : <Pencil data-icon="inline-start" />}
                {savingName ? t("menu.saving") : t("menu.saveName")}
              </Button>
              {nameSuccess ? (
                <p className="flex items-center gap-2 text-xs font-medium text-primary" role="status">
                  <CheckCircle2 aria-hidden="true" />
                  {t("menu.nameSaved")}
                </p>
              ) : null}
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <AccountOverviewCard />
      <AccountPreferencesCard />

      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 aria-hidden="true" />
            {t("menu.signInMethods")}
          </CardTitle>
          <CardDescription>{t("menu.signInMethodsDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {accountsLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
              <Spinner />
              {t("menu.loadingMethods")}
            </div>
          ) : accountsError ? (
            <p className="text-xs text-destructive" role="alert">{t("menu.methodsLoadError")}</p>
          ) : (
            providers.map(({ id, label, icon: Icon, connected }) => (
              <div key={id} className="flex items-center gap-3 rounded-lg bg-secondary/60 px-3 py-2.5">
                <Icon aria-hidden="true" />
                <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{label}</span>
                <Badge variant={connected ? "default" : "outline"}>
                  {connected ? t("menu.connected") : t("menu.notConnected")}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck aria-hidden="true" />
            {t("menu.security")}
          </CardTitle>
          <CardDescription>{t("menu.securityDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {accountsLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
              <Spinner />
              {t("menu.loadingMethods")}
            </div>
          ) : hasCredentialAccount ? (
            <form onSubmit={handlePasswordSubmit} noValidate>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="current-password">{t("menu.currentPassword")}</FieldLabel>
                  <Input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </Field>
                <Field data-invalid={Boolean(passwordError)}>
                  <FieldLabel htmlFor="new-password">{t("menu.newPassword")}</FieldLabel>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    aria-invalid={Boolean(passwordError)}
                  />
                </Field>
                <Field data-invalid={Boolean(passwordError)}>
                  <FieldLabel htmlFor="confirm-password">{t("menu.confirmPassword")}</FieldLabel>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    aria-invalid={Boolean(passwordError)}
                  />
                  <FieldError>{passwordError}</FieldError>
                </Field>
                <Button type="submit" disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}>
                  {changingPassword ? <Spinner data-icon="inline-start" /> : <KeyRound data-icon="inline-start" />}
                  {changingPassword ? t("menu.changingPassword") : t("menu.changePassword")}
                </Button>
                {passwordSuccess ? (
                  <p className="flex items-center gap-2 text-xs font-medium text-primary" role="status">
                    <CheckCircle2 aria-hidden="true" />
                    {t("menu.passwordChanged")}
                  </p>
                ) : null}
              </FieldGroup>
            </form>
          ) : accountsError ? null : (
            <p className="text-xs leading-relaxed text-muted-foreground">{t("menu.socialPasswordManaged")}</p>
          )}

          <Separator />

          <div className="flex flex-col gap-2">
            <p className="text-xs leading-relaxed text-muted-foreground">{t("menu.revokeSessionsDescription")}</p>
            <Button type="button" variant="outline" onClick={handleRevokeOtherSessions} disabled={revokingSessions}>
              {revokingSessions ? <Spinner data-icon="inline-start" /> : <MonitorOff data-icon="inline-start" />}
              {revokingSessions ? t("menu.revokingSessions") : t("menu.revokeOtherSessions")}
            </Button>
            {sessionsMessage ? (
              <p
                className={sessionsMessage === "success" ? "text-xs font-medium text-primary" : "text-xs font-medium text-destructive"}
                role={sessionsMessage === "success" ? "status" : "alert"}
              >
                {sessionsMessage === "success" ? t("menu.sessionsRevoked") : t("menu.sessionsRevokeError")}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <AccountDataExportCard />

      <Card size="sm" className="ring-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <TriangleAlert aria-hidden="true" />
            {t("menu.dangerousZone")}
          </CardTitle>
          <CardDescription>{t("menu.dangerousZoneDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-foreground">{t("menu.deleteAccount")}</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">{t("menu.deleteAccountDesc1")}</p>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("menu.deleteAccountDesc2")}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("menu.deleteAccountDesc3")}</p>
          {deleteSentTo ? (
            <div className="flex items-center gap-2.5 rounded-lg bg-secondary px-3 py-2.5">
              <Mail aria-hidden="true" />
              <p className="text-xs leading-relaxed text-foreground">
                <span className="font-semibold">{deleteSentTo}</span> {t("menu.deleteAccountSentTo")}
              </p>
            </div>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button type="button" variant="destructive" disabled={sendingDelete}>
                    {sendingDelete ? <Spinner data-icon="inline-start" /> : <TriangleAlert data-icon="inline-start" />}
                    {sendingDelete ? t("menu.deleteAccountSending") : t("menu.deleteAccount")}
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogMedia>
                    <TriangleAlert aria-hidden="true" />
                  </AlertDialogMedia>
                  <AlertDialogTitle>{t("menu.confirmDeleteTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("menu.confirmDeleteDescription")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={handleRequestAccountDeletion}
                    disabled={sendingDelete}
                  >
                    {sendingDelete ? <Spinner data-icon="inline-start" /> : null}
                    {t("menu.sendDeleteLink")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {deleteError ? <p className="text-xs font-medium text-destructive" role="alert">{deleteError}</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}
