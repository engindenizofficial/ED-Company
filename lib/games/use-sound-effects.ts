"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Oyun ses efektleri — dış ses dosyası gerektirmez.
 * Web Audio API ile anlık olarak sentezlenir (osilatör + zarf), bu sayede
 * anında çalışır ve ek bir asset indirmeye gerek kalmaz.
 */

type SoundName = "tick" | "select" | "correct" | "wrong" | "combo" | "newRound"

const STORAGE_KEY = "duel-sound-muted"

type AudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext
}

function playTone(
  ctx: AudioContext,
  {
    freq,
    duration,
    type = "sine",
    delay = 0,
    gain = 0.18,
    slideTo,
  }: { freq: number; duration: number; type?: OscillatorType; delay?: number; gain?: number; slideTo?: number },
) {
  const osc = ctx.createOscillator()
  const gainNode = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, ctx.currentTime + delay)
  if (slideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + delay + duration)
  }
  gainNode.gain.setValueAtTime(0, ctx.currentTime + delay)
  gainNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + delay + 0.015)
  gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + duration)
  osc.connect(gainNode)
  gainNode.connect(ctx.destination)
  osc.start(ctx.currentTime + delay)
  osc.stop(ctx.currentTime + delay + duration + 0.02)
}

function playNoise(ctx: AudioContext, { duration, delay = 0, gain = 0.15 }: { duration: number; delay?: number; gain?: number }) {
  const bufferSize = ctx.sampleRate * duration
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)
  }
  const source = ctx.createBufferSource()
  source.buffer = buffer
  const gainNode = ctx.createGain()
  gainNode.gain.setValueAtTime(gain, ctx.currentTime + delay)
  gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + duration)
  const filter = ctx.createBiquadFilter()
  filter.type = "lowpass"
  filter.frequency.value = 1800
  source.connect(filter)
  filter.connect(gainNode)
  gainNode.connect(ctx.destination)
  source.start(ctx.currentTime + delay)
}

export function useSoundEffects() {
  const ctxRef = useRef<AudioContext | null>(null)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null
    if (stored === "1") queueMicrotask(() => setMuted(true))
  }, [])

  const getCtx = useCallback(() => {
    if (typeof window === "undefined") return null
    if (!ctxRef.current) {
      const AudioCtx = window.AudioContext || (window as AudioWindow).webkitAudioContext
      if (!AudioCtx) return null
      ctxRef.current = new AudioCtx()
    }
    if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume().catch(() => {})
    }
    return ctxRef.current
  }, [])

  const play = useCallback(
    (name: SoundName) => {
      if (muted) return
      const ctx = getCtx()
      if (!ctx) return

      switch (name) {
        case "select":
          // Kart seçimi: kısa, kararlı "tık".
          playTone(ctx, { freq: 520, duration: 0.09, type: "triangle", gain: 0.14 })
          break
        case "tick":
          playTone(ctx, { freq: 880, duration: 0.05, type: "square", gain: 0.06 })
          break
        case "correct":
          // Yükselen zafer arpeji.
          playTone(ctx, { freq: 523.25, duration: 0.14, type: "sine", gain: 0.16 })
          playTone(ctx, { freq: 659.25, duration: 0.14, delay: 0.09, type: "sine", gain: 0.16 })
          playTone(ctx, { freq: 783.99, duration: 0.22, delay: 0.18, type: "sine", gain: 0.18 })
          break
        case "wrong":
          // Kalın, düşen "buzzer" — sarsıntıyla senkron.
          playTone(ctx, { freq: 180, duration: 0.32, type: "sawtooth", gain: 0.16, slideTo: 70 })
          playNoise(ctx, { duration: 0.18, gain: 0.12 })
          break
        case "combo":
          playTone(ctx, { freq: 700, duration: 0.1, type: "square", gain: 0.13 })
          playTone(ctx, { freq: 1050, duration: 0.16, delay: 0.07, type: "square", gain: 0.14 })
          break
        case "newRound":
          playTone(ctx, { freq: 340, duration: 0.16, type: "sine", gain: 0.1, slideTo: 460 })
          break
      }
    },
    [muted, getCtx],
  )

  const toggleMuted = useCallback(() => {
    setMuted((prev) => {
      const next = !prev
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0")
      }
      return next
    })
  }, [])

  return { play, muted, toggleMuted }
}
