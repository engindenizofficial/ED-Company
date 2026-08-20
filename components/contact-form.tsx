"use client"

import { useState, useTransition } from "react"
import { CheckCircle2, CircleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useLanguage } from "@/contexts/language-context"
import { sendContactMessage } from "@/app/actions/contact"

export function ContactForm() {
  const { t } = useLanguage()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [status, setStatus] = useState<"idle" | "success" | "error" | "invalid">("idle")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus("idle")

    if (name.trim().length < 2 || !email.includes("@") || message.trim().length < 10) {
      setStatus("invalid")
      return
    }

    startTransition(async () => {
      const result = await sendContactMessage({ name, email, message })
      if (result.success) {
        setStatus("success")
        setName("")
        setEmail("")
        setMessage("")
      } else {
        setStatus("error")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact-name">{t("contact.nameLabel")}</Label>
        <Input
          id="contact-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("contact.namePlaceholder")}
          maxLength={120}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact-email">{t("contact.emailFieldLabel")}</Label>
        <Input
          id="contact-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("contact.emailPlaceholder")}
          maxLength={200}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact-message">{t("contact.messageLabel")}</Label>
        <Textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("contact.messagePlaceholder")}
          maxLength={4000}
          rows={5}
          required
        />
      </div>

      {status === "success" && (
        <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {t("contact.success")}
        </p>
      )}
      {(status === "error" || status === "invalid") && (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <CircleAlert className="h-4 w-4 shrink-0" />
          {status === "invalid" ? t("contact.validationError") : t("contact.error")}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? t("contact.submitting") : t("contact.submit")}
      </Button>
    </form>
  )
}
