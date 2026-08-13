"use client"

import { useRef, useState } from "react"
import { Check, Download, LoaderCircle, Share2 } from "lucide-react"
import type { Fixture, MatchPrediction } from "@/lib/types"
import { MatchSharePoster } from "./match-share-poster"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/contexts/language-context"

// ---------------------------------------------------------------------------
// MatchShareActions — "Paylaş" ve "İndir" butonları. Görünmez (ekran dışı)
// bir afiş render eder, html-to-image ile PNG'ye çevirir; ardından Web Share
// API (dosya paylaşımı) veya klasik indirme akışını tetikler.
// ---------------------------------------------------------------------------

type Status = "idle" | "sharing" | "downloading" | "downloaded" | "shared"

function fileNameFor(fixture: Fixture): string {
  const raw = `ed-analytics-${fixture.home.name}-vs-${fixture.away.name}`
  return (
    raw
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") + ".png"
  )
}

export function MatchShareActions({
  fixture,
  prediction,
}: {
  fixture: Fixture
  prediction: MatchPrediction
}) {
  const { t } = useLanguage()
  const posterRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<Status>("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const busy = status === "sharing" || status === "downloading"
  const shareSucceeded = status === "shared"

  async function renderPoster(): Promise<Blob> {
    if (!posterRef.current) throw new Error(t("matchShare.errorPrepareFailed"))
    const { toBlob } = await import("html-to-image")
    const blob = await toBlob(posterRef.current, {
      pixelRatio: 2,
      backgroundColor: "#f4f5f7",
    })
    if (!blob) throw new Error(t("matchShare.errorImageFailed"))
    return blob
  }

  function triggerDownload(blob: Blob) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = fileNameFor(fixture)
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }

  async function handleDownload() {
    setErrorMsg(null)
    setStatus("downloading")
    try {
      const blob = await renderPoster()
      triggerDownload(blob)
      setStatus("downloaded")
      setTimeout(() => setStatus("idle"), 1800)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t("matchShare.errorDownloadFailed"))
      setStatus("idle")
    }
  }

  async function handleShare() {
    setErrorMsg(null)
    setStatus("sharing")

    const shareText = `${fixture.home.name} - ${fixture.away.name} | ${t("matchShare.shareTextPrediction")}: ${prediction.homeScore}-${prediction.awayScore} · edcompanyofficial.com`
    const hasNavigatorShare = typeof navigator !== "undefined" && typeof navigator.share === "function"

    let blob: Blob
    try {
      blob = await renderPoster()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t("matchShare.errorPrepareFailed"))
      setStatus("idle")
      return
    }

    const file = new File([blob], fileNameFor(fixture), { type: "image/png" })

    // 1) Dosya + metni birlikte paylaşabilen tarayıcılar (mobil Safari/Chrome vb.)
    if (hasNavigatorShare) {
      let canShareFiles = false
      try {
        canShareFiles = typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })
      } catch {
        canShareFiles = false
      }

      if (canShareFiles) {
        try {
          await navigator.share({
            files: [file],
            title: t("matchShare.shareTitle"),
            text: shareText,
          })
          setStatus("shared")
          setTimeout(() => setStatus("idle"), 1800)
          return
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            setStatus("idle")
            return
          }
          // Dosya paylaşımı başarısız oldu; aşağıdaki yedek akışlara devam et.
        }
      }

      // 2) Dosya paylaşımı desteklenmiyor: en azından metin/link paylaşımını dene,
      // görseli de kullanıcı cihazına indir ki manuel olarak eklenebilsin.
      try {
        await navigator.share({ title: t("matchShare.shareTitle"), text: shareText })
        triggerDownload(blob)
        setErrorMsg(t("matchShare.errorShareFileUnsupported"))
        setStatus("idle")
        return
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setStatus("idle")
          return
        }
        // navigator.share tamamen başarısız oldu (örn. izin politikası); indirmeye düş.
      }
    }

    // 3) Web Share API hiç yok veya tüm denemeler başarısız oldu: kartı indir.
    triggerDownload(blob)
    setErrorMsg(t("matchShare.errorShareUnsupported"))
    setStatus("idle")
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleShare}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2.5 text-xs font-bold text-primary transition-all hover:bg-primary/20 active:scale-[0.98] disabled:opacity-60"
        >
          {status === "sharing" ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : shareSucceeded ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Share2 className="h-3.5 w-3.5" />
          )}
          {shareSucceeded ? t("matchShare.shared") : t("matchShare.button")}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={busy}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold transition-all active:scale-[0.98] disabled:opacity-60",
            status === "downloaded"
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-secondary text-foreground hover:bg-secondary/70",
          )}
        >
          {status === "downloading" ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : status === "downloaded" ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          {status === "downloaded" ? t("matchShare.downloaded") : t("matchShare.download")}
        </button>
      </div>

      {errorMsg && (
        <p className="rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-[11px] font-medium leading-snug text-foreground">
          {errorMsg}
        </p>
      )}

      {/* Ekran dışı afiş — sadece PNG üretimi için kullanılır, kullanıcıya gösterilmez */}
      <div
        aria-hidden="true"
        style={{ position: "fixed", top: 0, left: -99999, pointerEvents: "none" }}
      >
        <MatchSharePoster ref={posterRef} fixture={fixture} prediction={prediction} />
      </div>
    </div>
  )
}
