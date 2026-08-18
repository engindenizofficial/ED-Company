"use client"

// Özel bir ses dosyasına bağımlı olmadan, Web Audio API osilatörleriyle
// anlık olarak "gol kornası" tarzı kısa, yükselen çift tonlu bir efekt
// üretir. Bildirim, uygulama ön plandayken (sekme/PWA açıkken) service
// worker'dan gelen mesajla tetiklenir.
//
// NOT: Bu yalnızca uygulama açıkken çalışır. Web Push spesifikasyonu artık
// arka plan bildirimleri için özel ses dosyalarını desteklemiyor — tarayıcı/
// işletim sistemi arka planda her zaman kendi varsayılan bildirim sesini
// çalar; bu davranış JS koduyla değiştirilemez.
let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null
  const Ctor = window.AudioContext || (window as any).webkitAudioContext
  if (!Ctor) return null
  if (!audioContext || audioContext.state === "closed") {
    audioContext = new Ctor()
  }
  return audioContext
}

function playTone(ctx: AudioContext, startTime: number, frequency: number, duration: number, gainPeak = 0.22) {
  const oscillator = ctx.createOscillator()
  const gainNode = ctx.createGain()

  oscillator.type = "triangle"
  oscillator.frequency.setValueAtTime(frequency, startTime)

  gainNode.gain.setValueAtTime(0, startTime)
  gainNode.gain.linearRampToValueAtTime(gainPeak, startTime + 0.02)
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration)

  oscillator.connect(gainNode)
  gainNode.connect(ctx.destination)

  oscillator.start(startTime)
  oscillator.stop(startTime + duration)
}

/** Gol bildirimi için kısa, yükselen iki tonlu bir "korna" sesi çalar. */
export function playGoalSound() {
  const ctx = getAudioContext()
  if (!ctx) return

  const resume = ctx.state === "suspended" ? ctx.resume() : Promise.resolve()

  resume
    .then(() => {
      const now = ctx.currentTime
      playTone(ctx, now, 523.25, 0.16) // C5
      playTone(ctx, now + 0.14, 783.99, 0.26) // G5
    })
    .catch(() => {
      // Otomatik oynatma engellenmiş olabilir (kullanıcı etkileşimi yok);
      // sessizce yok say, bildirim yine de görsel olarak gösterilecek.
    })
}
