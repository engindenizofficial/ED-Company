"use client"

import { Eye, EyeOff, KeyRound, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

export interface ApiKeys {
  apiFootballKey: string
  geminiKey: string
}

interface KeysModalProps {
  open: boolean
  onClose: () => void
  onSave: (keys: ApiKeys) => void
  initialKeys: ApiKeys
}

export function KeysModal({ open, onClose, onSave, initialKeys }: KeysModalProps) {
  const [apiFootballKey, setApiFootballKey] = useState(initialKeys.apiFootballKey)
  const [geminiKey, setGeminiKey] = useState(initialKeys.geminiKey)
  const [showApiFootball, setShowApiFootball] = useState(false)
  const [showGemini, setShowGemini] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Sync if parent re-opens with new initial values
  useEffect(() => {
    if (open) {
      setApiFootballKey(initialKeys.apiFootballKey)
      setGeminiKey(initialKeys.geminiKey)
    }
  }, [open, initialKeys.apiFootballKey, initialKeys.geminiKey])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  if (!open) return null

  const handleSave = () => {
    onSave({ apiFootballKey: apiFootballKey.trim(), geminiKey: geminiKey.trim() })
    onClose()
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose()
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="keys-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            <h2 id="keys-modal-title" className="text-base font-semibold text-foreground">
              API Anahtarları
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Kapat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-5 text-sm text-muted-foreground">
          Anahtarlar yalnızca tarayıcınızda saklanır ve hiçbir yere gönderilmez.
        </p>

        {/* API-Football Key */}
        <div className="mb-4 flex flex-col gap-1.5">
          <label htmlFor="api-football-key" className="text-xs font-medium text-foreground">
            API-Football Key
          </label>
          <div className="relative flex items-center">
            <input
              id="api-football-key"
              type={showApiFootball ? "text" : "password"}
              value={apiFootballKey}
              onChange={(e) => setApiFootballKey(e.target.value)}
              placeholder="x-apisports-key değeriniz"
              className="w-full rounded-lg border border-border bg-background py-2.5 pl-3 pr-10 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setShowApiFootball((v) => !v)}
              className="absolute right-2.5 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showApiFootball ? "Gizle" : "Göster"}
            >
              {showApiFootball ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Gemini Key */}
        <div className="mb-6 flex flex-col gap-1.5">
          <label htmlFor="gemini-key" className="text-xs font-medium text-foreground">
            Gemini API Key
          </label>
          <div className="relative flex items-center">
            <input
              id="gemini-key"
              type={showGemini ? "text" : "password"}
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="AIza... şeklindeki Gemini anahtarınız"
              className="w-full rounded-lg border border-border bg-background py-2.5 pl-3 pr-10 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setShowGemini((v) => !v)}
              className="absolute right-2.5 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showGemini ? "Gizle" : "Göster"}
            >
              {showGemini ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-border/80 hover:text-foreground"
          >
            İptal
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Kaydet
          </button>
        </div>
      </div>
    </div>
  )
}
