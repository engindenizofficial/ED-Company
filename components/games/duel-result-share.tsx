"use client"

import { forwardRef, useRef, useState } from "react"
import { Check, Download, LoaderCircle, Share2, Swords } from "lucide-react"
import { useLanguage } from "@/contexts/language-context"

export interface DuelShareResult {
  mode: "normal" | "daily"
  dayKey?: string
  rank?: number | null
  score: number
  accuracy: number
  correctCount: number
  playedRounds: number
  remainingLives: number
  bestStreak: number
}

export const DuelResultPoster = forwardRef<HTMLDivElement, { result: DuelShareResult }>(function DuelResultPoster({ result }, ref) {
  const { t } = useLanguage()
  return <div ref={ref} className="flex h-[630px] w-[1080px] flex-col justify-between bg-background p-20 text-foreground">
    <div className="flex items-center justify-between"><div className="flex items-center gap-4"><span className="flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><Swords /></span><div><p className="text-3xl font-black">ED Analytics</p><p className="text-xl text-muted-foreground">Market Value Duel</p></div></div><p className="text-2xl font-bold text-primary">{result.mode === "daily" ? `${t("duel.posterDaily")} · ${result.dayKey}` : t("duel.normalGame")}</p></div>
    <div className="flex items-end justify-between gap-12"><div><p className="text-3xl font-bold uppercase tracking-widest text-muted-foreground">{t("duel.posterScore")}</p><p className="text-9xl font-black italic text-primary">{result.score}</p>{result.rank && <p className="mt-4 text-4xl font-black">{t("duel.posterGlobalRank", { rank: result.rank })}</p>}</div><div className="grid grid-cols-2 gap-5 text-right"><PosterStat label={t("duel.accuracy")} value={`${result.accuracy}%`} /><PosterStat label={t("duel.posterCorrect")} value={`${result.correctCount}/${result.playedRounds}`} /><PosterStat label={t("duel.lives")} value={`${result.remainingLives}/3`} /><PosterStat label={t("duel.posterBestStreak")} value={String(result.bestStreak)} /></div></div>
    <p className="text-2xl font-semibold text-muted-foreground">edcompanyofficial.com</p>
  </div>
})

function PosterStat({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-muted p-6 text-foreground"><p className="text-5xl font-black text-foreground">{value}</p><p className="mt-2 text-xl font-bold uppercase tracking-wider text-muted-foreground">{label}</p></div> }

export function DuelResultShare({ result }: { result: DuelShareResult }) {
  const { t } = useLanguage()
  const posterRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<"idle" | "busy" | "done">("idle")
  async function createBlob() { const { toBlob } = await import("html-to-image"); const blob = posterRef.current ? await toBlob(posterRef.current, { pixelRatio: 1, backgroundColor: "#101114" }) : null; if (!blob) throw new Error("image"); return blob }
  function download(blob: Blob) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `market-value-duel-${result.dayKey ?? "result"}.png`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 4000) }
  async function act(share: boolean) { setStatus("busy"); try { const blob = await createBlob(); const file = new File([blob], "market-value-duel.png", { type: "image/png" }); if (share && navigator.share && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: "Market Value Duel", text: t("duel.shareText", { score: result.score, accuracy: result.accuracy }) }); else download(blob); setStatus("done"); window.setTimeout(() => setStatus("idle"), 1800) } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setStatus("idle") } }
  return <><div className="flex w-full max-w-md gap-2"><button type="button" disabled={status === "busy"} onClick={() => void act(true)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60">{status === "busy" ? <LoaderCircle className="animate-spin" /> : status === "done" ? <Check /> : <Share2 />}{t("duel.shareResult")}</button><button type="button" disabled={status === "busy"} onClick={() => void act(false)} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-bold text-card-foreground"><Download />{t("duel.downloadResult")}</button></div><div aria-hidden="true" className="fixed left-[-99999px] top-0"><DuelResultPoster ref={posterRef} result={result} /></div></>
}
