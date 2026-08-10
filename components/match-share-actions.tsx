"use client"

import { useRef, useState } from "react"
import { Check, Download, LoaderCircle, Share2 } from "lucide-react"
import type { Fixture, MatchPrediction } from "@/lib/types"
import { MatchSharePoster } from "./match-share-poster"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// MatchShareActions — "Paylaş" ve "İndir" butonları. Görünmez (ekran dışı)
// bir afiş render eder, html-to-image ile PNG'ye çevirir; ardından Web Share
// API (dosya paylaşımı) veya klasik indirme akışını tetikler.
// ---------------------------------------------------------------------------

type Status = "idle" | "sharing" | "downloading" | "downloaded"

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
  const posterRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<Status>("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const busy = status === "sharing" || status === "downloading"

  async function renderPoster(): Promise<Blob> {
    if (!posterRef.current) throw new Error("Kart hazırlanamadı")
    const { toBlob } = await import("html-to-image")
    const blob = await toBlob(posterRef.current, {
      pixelRatio: 2,
      backgroundColor: "#080b12",
    })
    if (!blob) throw new Error("Görsel oluşturulamadı")
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
      setErrorMsg(err instanceof Error ? err.message : "Kart indirilemedi")
      setStatus("idle")
    }
  }

  async function handleShare() {
    setErrorMsg(null)
    setStatus("sharing")
    try {
      const blob = await renderPoster()
      const shareText = `${fixture.home.name} - ${fixture.away.name} | AI Tahmini: ${prediction.homeScore}-${prediction.awayScore} · edcompanyofficial.com`
      const file = new File([blob], fileNameFor(fixture), { type: "image/png" })

      const canShareFiles =
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })

      if (canShareFiles) {
        await navigator.share({
          files: [file],
          title: "ED Analytics — AI Maç Tahmini",
          text: shareText,
        })
      } else if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title: "ED Analytics — AI Maç Tahmini", text: shareText })
        triggerDownload(blob)
      } else {
        triggerDownload(blob)
        setErrorMsg("Tarayıcınız doğrudan paylaşımı desteklemiyor, kart cihazınıza indirildi.")
      }
      setStatus("idle")
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setStatus("idle")
        return
      }
      setErrorMsg(err instanceof Error ? err.message : "Paylaşım başarısız oldu")
      setStatus("idle")
    }
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
          ) : (
            <Share2 className="h-3.5 w-3.5" />
          )}
          Paylaş
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
          {status === "downloaded" ? "İndirildi" : "İndir"}
        </button>
      </div>

      {errorMsg && <p className="text-[11px] text-muted-foreground">{errorMsg}</p>}

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
