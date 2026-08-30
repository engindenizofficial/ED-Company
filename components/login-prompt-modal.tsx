"use client"

import { KeyRound, UserPlus, X } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { useCloseOnBackButton } from "@/hooks/use-close-on-back-button"
import { useLanguage } from "@/contexts/language-context"

// Global açma fonksiyonu — NavTabs'tan çağrılabilir
let _openLoginModal: (() => void) | null = null
export function openLoginModal() {
  _openLoginModal?.()
}

export function LoginPromptModal() {
  const { t } = useLanguage()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    _openLoginModal = () => setVisible(true)
    return () => {
      _openLoginModal = null
    }
  }, [])

  function handleDismiss() {
    setVisible(false)
  }

  useCloseOnBackButton(visible, handleDismiss)

  if (!visible) return null

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4",
        "animate-in fade-in duration-300"
      )}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleDismiss}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border/60 bg-background shadow-2xl p-6 animate-in slide-in-from-bottom-4 duration-300">
        {/* Kapat butonu */}
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t("common.close")}
        >
          <X className="h-4 w-4" />
        </button>

        {/* İkon */}
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <KeyRound className="h-5 w-5 text-primary" />
        </div>

        {/* Başlık */}
        <h2 className="text-center text-base font-bold text-foreground mb-1">
          {t("loginPrompt.title")}
        </h2>
        <p className="text-center text-sm text-muted-foreground mb-6">
          {t("loginPrompt.subtitle")}
        </p>

        {/* Butonlar */}
        <div className="flex flex-col gap-2">
          <Link
            href="/sign-in"
            onClick={handleDismiss}
            className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <KeyRound className="h-4 w-4" />
            {t("loginPrompt.signIn")}
          </Link>
          <Link
            href="/sign-up"
            onClick={handleDismiss}
            className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold border border-border/60 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            {t("loginPrompt.createAccount")}
          </Link>
          <button
            onClick={handleDismiss}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            {t("loginPrompt.continueForNow")}
          </button>
        </div>
      </div>
    </div>
  )
}
