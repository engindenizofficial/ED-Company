"use client"

import { Download } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { useLanguage } from "@/contexts/language-context"

export function AccountDataExportCard() {
  const { t } = useLanguage()
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState(false)

  async function handleDownload() {
    if (downloading) return
    setDownloading(true)
    setError(false)

    try {
      const response = await fetch("/api/account/export", { credentials: "same-origin" })
      if (!response.ok) throw new Error("Export failed")

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      const disposition = response.headers.get("content-disposition")
      const filename = disposition?.match(/filename="([^"]+)"/)?.[1] ?? "ed-analytics-data.json"
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError(true)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download aria-hidden="true" />
          {t("menu.yourData")}
        </CardTitle>
        <CardDescription>{t("menu.yourDataDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Button type="button" variant="outline" onClick={handleDownload} disabled={downloading}>
          {downloading ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" />}
          {downloading ? t("menu.downloadingData") : t("menu.downloadData")}
        </Button>
        {error ? <p className="text-xs text-destructive" role="alert">{t("menu.downloadDataError")}</p> : null}
      </CardContent>
    </Card>
  )
}
