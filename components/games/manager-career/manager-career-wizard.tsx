"use client"

import { useEffect, useState, useTransition } from "react"
import Image from "next/image"
import { CheckCircle2, ChevronRight, ChevronLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useLanguage } from "@/contexts/language-context"
import { useSession } from "@/lib/auth-client"
import { openLoginModal } from "@/components/login-prompt-modal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DIFFICULTY_SETTINGS,
  MANAGER_DIFFICULTIES,
  CLUB_LOGO_FILES,
  type ManagerDifficulty,
} from "@/lib/games/manager-career"
import { DUEL_SELECTABLE_LEAGUES } from "@/lib/leagues"
import { formatMarketValueEur } from "@/lib/market-value-format"
import {
  createManagerCareer,
  deleteMyManagerCareer,
  getMyManagerCareer,
  type ManagerCareerSummary,
} from "@/app/actions/manager-career"
import { SquadBuilder, type SquadCompletionPayload } from "@/components/games/manager-career/squad-builder"
import { CareerHome } from "@/components/games/manager-career/career-home"
import { cn } from "@/lib/utils"

type WizardStep = "difficulty" | "logo" | "names" | "league" | "squad" | "done"
const STEP_ORDER: WizardStep[] = ["difficulty", "logo", "names", "league", "squad"]

const CREATE_ERROR_KEY: Record<string, string> = {
  budgetExceeded: "managerCareer.createFailedBudget",
  playerPriceUnavailable: "managerCareer.createFailedPrice",
  invalidNames: "managerCareer.createFailedNames",
}

export function ManagerCareerWizard() {
  const { t, locale } = useLanguage()
  const { data: session, isPending: sessionPending } = useSession()

  const [checkingExisting, setCheckingExisting] = useState(true)
  const [existingCareer, setExistingCareer] = useState<ManagerCareerSummary | null>(null)
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false)
  const [restarting, setRestarting] = useState(false)

  const [step, setStep] = useState<WizardStep>("difficulty")
  const [difficulty, setDifficulty] = useState<ManagerDifficulty | null>(null)
  const [logoFile, setLogoFile] = useState<string | null>(null)
  const [clubName, setClubName] = useState("")
  const [managerName, setManagerName] = useState("")
  const [leagueId, setLeagueId] = useState<number | null>(null)

  const [submitting, startSubmit] = useTransition()
  const [createdClubName, setCreatedClubName] = useState<string | null>(null)

  useEffect(() => {
    if (sessionPending) return
    if (!session?.user) {
      setCheckingExisting(false)
      return
    }
    let cancelled = false
    getMyManagerCareer()
      .then((career) => {
        if (!cancelled) setExistingCareer(career)
      })
      .catch(() => {
        if (!cancelled) setExistingCareer(null)
      })
      .finally(() => {
        if (!cancelled) setCheckingExisting(false)
      })
    return () => {
      cancelled = true
    }
  }, [sessionPending, session?.user])

  function resetWizard() {
    setStep("difficulty")
    setDifficulty(null)
    setLogoFile(null)
    setClubName("")
    setManagerName("")
    setLeagueId(null)
    setCreatedClubName(null)
  }

  function handleRestartConfirmed() {
    setRestarting(true)
    deleteMyManagerCareer()
      .then(() => {
        setExistingCareer(null)
        resetWizard()
      })
      .catch(() => {
        toast.error(t("managerCareer.createFailedGeneric"))
      })
      .finally(() => {
        setRestarting(false)
        setRestartConfirmOpen(false)
      })
  }

  function handleSquadComplete(payload: SquadCompletionPayload) {
    if (!difficulty || !logoFile || !leagueId) return

    if (!session?.user) {
      toast.error(t("managerCareer.signInRequired"))
      openLoginModal()
      return
    }

    startSubmit(async () => {
      const result = await createManagerCareer({
        difficulty,
        logoFile,
        clubName,
        managerName,
        leagueId,
        formation: payload.formation,
        squad: payload.squad,
      })

      if (result.ok) {
        setCreatedClubName(clubName)
        setStep("done")
      } else {
        const key = CREATE_ERROR_KEY[result.error] ?? "managerCareer.createFailedGeneric"
        toast.error(t(key))
      }
    })
  }

  const currentIndex = STEP_ORDER.indexOf(step === "done" ? "squad" : step)

  if (checkingExisting) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (existingCareer && existingCareer.status === "active" && step !== "done") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setRestartConfirmOpen(true)} className="text-muted-foreground">
            {t("managerCareer.restartCareer")}
          </Button>
        </div>

        <CareerHome />

        <AlertDialog open={restartConfirmOpen} onOpenChange={setRestartConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("managerCareer.restartConfirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("managerCareer.restartConfirmDesc", { clubName: existingCareer.clubName })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={restarting}>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRestartConfirmed}
                disabled={restarting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {restarting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("managerCareer.restartConfirmAction")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  if (step === "done") {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-emerald-500/30 bg-card p-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/30">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        </div>
        <h2 className="mt-4 text-xl font-black tracking-tight text-foreground">
          {t("managerCareer.createSuccessTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{createdClubName}</p>
      </div>
    )
  }

  const canGoNext =
    (step === "difficulty" && difficulty !== null) ||
    (step === "logo" && logoFile !== null) ||
    (step === "names" && clubName.trim().length >= 2 && managerName.trim().length >= 2) ||
    (step === "league" && leagueId !== null)

  function goNext() {
    const idx = STEP_ORDER.indexOf(step)
    if (idx < STEP_ORDER.length - 1) setStep(STEP_ORDER[idx + 1])
  }

  function goBack() {
    const idx = STEP_ORDER.indexOf(step)
    if (idx > 0) setStep(STEP_ORDER[idx - 1])
  }

  return (
    <div className="flex flex-col gap-6">
      {/* İlerleme çubuğu */}
      <div className="flex items-center gap-2">
        {STEP_ORDER.map((s, i) => (
          <div
            key={s}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i <= currentIndex ? "bg-emerald-500" : "bg-border/60",
            )}
          />
        ))}
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("managerCareer.stepOf", { current: currentIndex + 1, total: STEP_ORDER.length })}
      </p>

      {step === "difficulty" && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">{t("managerCareer.difficultyStepTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("managerCareer.difficultyStepDesc")}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {MANAGER_DIFFICULTIES.map((d) => {
              const setting = DIFFICULTY_SETTINGS[d]
              const selected = difficulty === d
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className={cn(
                    "flex flex-col gap-2 rounded-2xl border p-4 text-left transition-all",
                    selected
                      ? "border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/40"
                      : "border-border/60 bg-card hover:border-border",
                  )}
                >
                  <span className="text-base font-black text-foreground">{t(`managerCareer.${d}`)}</span>
                  <span className="text-xs text-muted-foreground">{t("managerCareer.budgetLabel")}</span>
                  <span className="text-sm font-bold text-emerald-500">
                    {formatMarketValueEur(setting.budgetEur, locale) ?? "-"}
                  </span>
                  <span className="mt-1 text-xs text-muted-foreground">
                    {t("managerCareer.opponentStrengthLabel")}: %{setting.opponentStrengthPercent}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {step === "logo" && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">{t("managerCareer.logoStepTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("managerCareer.logoStepDesc")}</p>
          </div>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
            {CLUB_LOGO_FILES.map((file) => {
              const selected = logoFile === file
              return (
                <button
                  key={file}
                  type="button"
                  onClick={() => setLogoFile(file)}
                  aria-pressed={selected}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-xl border p-2 transition-all",
                    selected
                      ? "border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/40"
                      : "border-border/60 bg-card hover:border-border",
                  )}
                >
                  <Image
                    src={`/images/manager-logos/${file}`}
                    alt=""
                    width={56}
                    height={56}
                    className="h-full w-full object-contain"
                  />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {step === "names" && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">{t("managerCareer.namesStepTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("managerCareer.namesStepDesc")}</p>
          </div>
          <FieldGroup className="max-w-sm">
            <Field>
              <FieldLabel htmlFor="club-name">{t("managerCareer.clubNameLabel")}</FieldLabel>
              <Input
                id="club-name"
                value={clubName}
                maxLength={40}
                onChange={(e) => setClubName(e.target.value)}
                placeholder={t("managerCareer.clubNamePlaceholder")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="manager-name">{t("managerCareer.managerNameLabel")}</FieldLabel>
              <Input
                id="manager-name"
                value={managerName}
                maxLength={40}
                onChange={(e) => setManagerName(e.target.value)}
                placeholder={t("managerCareer.managerNamePlaceholder")}
              />
            </Field>
          </FieldGroup>
        </div>
      )}

      {step === "league" && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">{t("managerCareer.leagueStepTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("managerCareer.leagueStepDesc")}</p>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {DUEL_SELECTABLE_LEAGUES.map((league) => {
              const selected = leagueId === league.id
              return (
                <button
                  key={league.id}
                  type="button"
                  onClick={() => setLeagueId(league.id)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-all",
                    selected
                      ? "border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/40"
                      : "border-border/60 bg-card hover:border-border",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={league.logo} alt="" className="h-7 w-7 shrink-0 object-contain" width={28} height={28} loading="lazy" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-xs font-semibold text-foreground">{league.name}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{league.country}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {step === "squad" && difficulty && (
        <SquadBuilder
          totalBudgetEur={DIFFICULTY_SETTINGS[difficulty].budgetEur}
          onBack={goBack}
          onComplete={handleSquadComplete}
          submitting={submitting}
        />
      )}

      {step !== "squad" && (
        <div className="flex items-center justify-between border-t border-border/60 pt-4">
          <Button variant="outline" onClick={goBack} disabled={currentIndex === 0}>
            <ChevronLeft className="h-4 w-4" data-icon="inline-start" />
            {t("managerCareer.back")}
          </Button>
          <Button onClick={goNext} disabled={!canGoNext}>
            {t("managerCareer.next")}
            <ChevronRight className="h-4 w-4" data-icon="inline-end" />
          </Button>
        </div>
      )}
    </div>
  )
}
