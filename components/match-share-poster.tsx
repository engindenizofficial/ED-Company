"use client"

import { forwardRef } from "react"
import { Sparkles } from "lucide-react"
import type { Fixture, MatchPrediction } from "@/lib/types"
import { useLanguage } from "@/contexts/language-context"

// ---------------------------------------------------------------------------
// MatchSharePoster — sosyal medyada paylaşılabilir, afiş kalitesinde PNG
// kartı. Bu bileşen her zaman AÇIK (light) temayla ve sitenin marka
// renkleriyle render edilir — kullanıcının aktif site temasından bağımsız
// olarak, sitenin ":root" (light) design token değerlerine denk gelen sabit
// hex/rgba değerleri kullanır (app/globals.css ile görsel olarak senkron).
//
// Not: Burada BİLİNÇLİ olarak oklch()/color-mix() KULLANILMAZ — PNG'ye
// dönüştürme sırasında (html-to-image) bu modern renk fonksiyonları düzgün
// serileştirilemeyebilir ve arka planın siyah, yazıların görünmez çıkmasına
// sebep olabilir. Bu yüzden tüm renkler sabit hex/rgba olarak tanımlanır.
// ---------------------------------------------------------------------------

const PALETTE = {
  bg: "#f5f6f7",
  card: "#ffffff",
  surface1: "#eef0f1",
  surface2: "#e4e7e9",
  border: "#d9dbde",
  borderStrong: "#c9ccd0",
  foreground: "#1a1c22",
  muted: "#6a6f79",
  mutedSoft: "#8a8f98",
  brandFrom: "#1fae63",
  brandTo: "#3b5fe0",
  primary: "#1f9d5c",
  primaryForeground: "#f6fdf9",
  primarySoft: "rgba(31,157,92,0.12)",
  primaryBorder: "rgba(31,157,92,0.4)",
  accent: "#3b5fe0",
}

function winnerLabel(
  prediction: MatchPrediction,
  homeName: string,
  awayName: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (prediction.winner === "home") return t("matchShare.winnerWins", { team: homeName })
  if (prediction.winner === "away") return t("matchShare.winnerWins", { team: awayName })
  return t("matchShare.draw")
}

export const MatchSharePoster = forwardRef<
  HTMLDivElement,
  { fixture: Fixture; prediction: MatchPrediction }
>(function MatchSharePoster({ fixture, prediction }, ref) {
  const { locale, t } = useLanguage()
  const dateLocale = locale === "tr" ? "tr-TR" : "en-US"
  const { home, away, league } = fixture
  const winner = winnerLabel(prediction, home.name, away.name, t)
  const factors = prediction.keyFactors.slice(0, 2)
  const generatedAt = new Date(prediction.cachedAt || fixture.date)
  const generatedDate = generatedAt.toLocaleDateString(dateLocale, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
  const generatedTime = generatedAt.toLocaleTimeString(dateLocale, {
    hour: "2-digit",
    minute: "2-digit",
  })
  const kickoffAt = new Date(fixture.date)
  const kickoffDate = kickoffAt.toLocaleDateString(dateLocale, {
    day: "2-digit",
    month: "long",
  })
  const kickoffTime = kickoffAt.toLocaleTimeString(dateLocale, {
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
          background: "radial-gradient(circle, rgba(31,174,99,0.14) 0%, rgba(31,174,99,0) 70%)",
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
          background: "radial-gradient(circle, rgba(59,95,224,0.1) 0%, rgba(59,95,224,0) 70%)",
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
            <span style={{ width: 1, height: 16, background: PALETTE.border }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: PALETTE.foreground }}>
              {kickoffDate} · {kickoffTime}
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
            {t("matchShare.predictionLabel")}
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
            <span style={{ fontSize: 17, fontWeight: 600, color: PALETTE.muted }}>{t("matchShare.confidenceLabel")}</span>
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
            {t("matchShare.analysisLabel")}
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
              {t("matchShare.generatedAt", { time: generatedTime })}
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
