"use client"

import { forwardRef } from "react"
import { Sparkles } from "lucide-react"
import type { Fixture, MatchPrediction } from "@/lib/types"

// ---------------------------------------------------------------------------
// MatchSharePoster — sosyal medyada paylaşılabilir, afiş kalitesinde PNG
// kartı. Bu bileşen her zaman AÇIK (light) temayla ve sitenin marka
// renkleriyle render edilir — kullanıcının aktif site temasından bağımsız
// olarak, sitenin ":root" (light) design token değerleri burada sabit olarak
// kopyalanmıştır (app/globals.css ile senkron tutulmalıdır).
// ---------------------------------------------------------------------------

const PALETTE = {
  bg: "oklch(0.97 0.005 240)",
  card: "oklch(1 0 0)",
  surface1: "oklch(0.96 0.006 240)",
  surface2: "oklch(0.92 0.008 240)",
  border: "oklch(0.88 0.01 240)",
  borderStrong: "oklch(0.82 0.012 240)",
  foreground: "oklch(0.14 0.02 250)",
  muted: "oklch(0.48 0.015 245)",
  mutedSoft: "oklch(0.6 0.012 245)",
  brandFrom: "oklch(0.58 0.2 152)",
  brandTo: "oklch(0.52 0.18 255)",
  primary: "oklch(0.52 0.18 152)",
  primaryForeground: "oklch(0.99 0.005 150)",
  primarySoft: "color-mix(in oklch, oklch(0.52 0.18 152) 10%, white)",
  primaryBorder: "color-mix(in oklch, oklch(0.52 0.18 152) 38%, white)",
  accent: "oklch(0.55 0.18 255)",
}

function winnerLabel(prediction: MatchPrediction, homeName: string, awayName: string): string {
  if (prediction.winner === "home") return `${homeName} kazanır`
  if (prediction.winner === "away") return `${awayName} kazanır`
  return "Beraberlik"
}

export const MatchSharePoster = forwardRef<
  HTMLDivElement,
  { fixture: Fixture; prediction: MatchPrediction }
>(function MatchSharePoster({ fixture, prediction }, ref) {
  const { home, away, league } = fixture
  const winner = winnerLabel(prediction, home.name, away.name)
  const factors = prediction.keyFactors.slice(0, 2)
  const generatedAt = new Date(prediction.cachedAt || fixture.date)
  const generatedDate = generatedAt.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
  const generatedTime = generatedAt.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    <div
      ref={ref}
      style={{
        width: 1080,
        height: 1350,
        backgroundColor: PALETTE.bg,
        color: PALETTE.foreground,
        fontFamily:
          "var(--font-sans), 'Geist', ui-sans-serif, system-ui, sans-serif",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Faint scoreboard grid texture */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(20,22,31,0.035) 0px, rgba(20,22,31,0.035) 1px, transparent 1px, transparent 64px)",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: -180,
          right: -180,
          width: 520,
          height: 520,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, color-mix(in oklch, oklch(0.52 0.18 152) 14%, transparent) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: -220,
          left: -160,
          width: 480,
          height: 480,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, color-mix(in oklch, oklch(0.55 0.18 255) 10%, transparent) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Top accent bar */}
      <div
        style={{
          height: 6,
          background: `linear-gradient(90deg, ${PALETTE.brandFrom}, ${PALETTE.brandTo})`,
          flexShrink: 0,
        }}
      />

      <div style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, padding: "56px 64px 48px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: `linear-gradient(135deg, ${PALETTE.brandFrom}, ${PALETTE.brandTo})`,
                display: "inline-block",
              }}
            />
            <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em", color: PALETTE.foreground }}>
              edcompanyofficial.com
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              border: `1.5px solid ${PALETTE.primaryBorder}`,
              background: PALETTE.primarySoft,
              borderRadius: 999,
              padding: "9px 20px",
            }}
          >
            <Sparkles width={16} height={16} color={PALETTE.primary} />
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: "0.08em", color: PALETTE.primary }}>
              ED ANALYTICS
            </span>
          </div>
        </div>

        {/* League strip */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 32 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              border: `1px solid ${PALETTE.border}`,
              borderRadius: 999,
              padding: "8px 20px",
              background: PALETTE.card,
            }}
          >
            {league.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={league.logo || "/placeholder.svg"}
                alt=""
                crossOrigin="anonymous"
                width={22}
                height={22}
                style={{ objectFit: "contain" }}
              />
            )}
            <span style={{ fontSize: 15, fontWeight: 600, color: PALETTE.muted }}>
              {league.name}
              {league.round ? ` · ${league.round}` : ""}
            </span>
          </div>
        </div>

        {/* Teams row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginTop: 44, gap: 16 }}>
          <TeamBlock name={home.name} logo={home.logo} />
          <div style={{ paddingTop: 44, fontSize: 24, fontWeight: 700, color: PALETTE.mutedSoft }}>VS</div>
          <TeamBlock name={away.name} logo={away.logo} align="right" />
        </div>

        {/* Hero prediction */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 40 }}>
          <span
            style={{
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: "0.16em",
              color: PALETTE.muted,
              textTransform: "uppercase",
            }}
          >
            Yapay Zekanın Tahmini
          </span>

          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 20,
              marginTop: 14,
              fontFamily: "var(--font-mono), 'Geist Mono', ui-monospace, monospace",
            }}
          >
            <span style={{ fontSize: 172, fontWeight: 800, lineHeight: 1, color: PALETTE.foreground }}>
              {prediction.homeScore}
            </span>
            <span style={{ fontSize: 84, fontWeight: 300, color: PALETTE.mutedSoft }}>:</span>
            <span style={{ fontSize: 172, fontWeight: 800, lineHeight: 1, color: PALETTE.foreground }}>
              {prediction.awayScore}
            </span>
          </div>

          <span
            style={{
              marginTop: 20,
              borderRadius: 999,
              border: `1.5px solid ${PALETTE.primaryBorder}`,
              background: PALETTE.primarySoft,
              color: PALETTE.primary,
              fontSize: 26,
              fontWeight: 800,
              padding: "12px 32px",
            }}
          >
            {winner}
          </span>

          {/* Confidence card */}
          <div
            style={{
              marginTop: 28,
              display: "flex",
              alignItems: "center",
              gap: 18,
              borderRadius: 20,
              border: `1px solid ${PALETTE.borderStrong}`,
              background: PALETTE.card,
              boxShadow: "0 1px 2px rgba(20,22,31,0.04)",
              padding: "18px 32px",
            }}
          >
            <span style={{ fontSize: 17, fontWeight: 600, color: PALETTE.muted }}>Doğruluk Oranı</span>
            <span
              style={{
                fontFamily: "var(--font-mono), 'Geist Mono', ui-monospace, monospace",
                fontSize: 40,
                fontWeight: 800,
                color: PALETTE.primary,
              }}
            >
              %{prediction.confidence}
            </span>
          </div>
        </div>

        {/* Key factors */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: "auto", paddingTop: 40 }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: PALETTE.mutedSoft,
            }}
          >
            AI Analiz Gerekçesi
          </span>
          {factors.length > 0 ? (
            factors.map((factor, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14,
                  borderRadius: 16,
                  border: `1px solid ${PALETTE.border}`,
                  background: PALETTE.card,
                  padding: "18px 22px",
                }}
              >
                <span
                  style={{
                    marginTop: 4,
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: PALETTE.primary,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 20, lineHeight: 1.45, fontWeight: 500, color: PALETTE.foreground }}>
                  {factor}
                </span>
              </div>
            ))
          ) : (
            <div
              style={{
                borderRadius: 16,
                border: `1px solid ${PALETTE.border}`,
                background: PALETTE.card,
                padding: "18px 22px",
                fontSize: 20,
                lineHeight: 1.45,
                color: PALETTE.foreground,
              }}
            >
              {prediction.summary}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 36,
            paddingTop: 24,
            borderTop: `1px solid ${PALETTE.border}`,
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 600, color: PALETTE.mutedSoft }}>edcompanyofficial.com</span>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: PALETTE.mutedSoft }}>{generatedDate}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: PALETTE.mutedSoft }}>
              Tahmin oluşturuldu · {generatedTime}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
})

function TeamBlock({ name, logo, align = "left" }: { name: string; logo: string; align?: "left" | "right" }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        width: 260,
        textAlign: "center",
      }}
    >
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo || "/placeholder.svg"}
          alt=""
          crossOrigin="anonymous"
          width={96}
          height={96}
          style={{ objectFit: "contain" }}
        />
      )}
      <span
        style={{
          fontSize: 24,
          fontWeight: 700,
          lineHeight: 1.25,
          color: PALETTE.foreground,
          textAlign: align === "left" ? "center" : "center",
        }}
      >
        {name}
      </span>
    </div>
  )
}
