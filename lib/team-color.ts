"use client"

// Bir takımın logosundan, canvas ile piksel analizi yaparak baskın rengi
// otomatik çıkarır. Böylece elle hiçbir renk tanımlamadan (binlerce takım
// dahil) her takım gol animasyonunda kendine özgü bir renkte görünür.
//
// Aynı logo için sonuç bir kere hesaplanıp bellekte (Promise cache) saklanır,
// bu sayede bir takımın ikinci golünde tekrar hesaplama yapılmaz.

const FALLBACK_COLOR = "hsl(var(--primary))"

const colorCache = new Map<string, Promise<string>>()

/** Neredeyse beyaz, siyah veya gri (doygunluğu düşük) pikselleri eler —
 * bunlar genelde logo zemini/kenar çizgisi olur, takımın "rengi" değildir. */
function isMeaningfulColor(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2
  const saturation = max - min
  if (lightness > 235 || lightness < 20) return false
  if (saturation < 24) return false
  return true
}

function extractDominantColor(img: HTMLImageElement): string {
  const size = 32
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return FALLBACK_COLOR

  ctx.drawImage(img, 0, 0, size, size)
  const { data } = ctx.getImageData(0, 0, size, size)

  // Yakın renkleri aynı "kovaya" toplayıp en kalabalık kovayı seçiyoruz —
  // tek bir pikseli değil, logodaki en yaygın rengi buluyoruz.
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>()
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]
    if (a < 200) continue
    if (!isMeaningfulColor(r, g, b)) continue

    const key = `${Math.round(r / 24)}-${Math.round(g / 24)}-${Math.round(b / 24)}`
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.count += 1
      bucket.r += r
      bucket.g += g
      bucket.b += b
    } else {
      buckets.set(key, { count: 1, r, g, b })
    }
  }

  let best: { count: number; r: number; g: number; b: number } | null = null
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) best = bucket
  }
  if (!best) return FALLBACK_COLOR

  const r = Math.round(best.r / best.count)
  const g = Math.round(best.g / best.count)
  const b = Math.round(best.b / best.count)
  return `rgb(${r}, ${g}, ${b})`
}

/** Verilen logo URL'inden takımın baskın rengini çözümler. Logo yoksa,
 * CORS/ağ hatası olursa veya anlamlı bir renk bulunamazsa uygulamanın
 * varsayılan marka rengine (--primary) düşer. */
export function getTeamAccentColor(logoUrl: string | null | undefined): Promise<string> {
  if (!logoUrl) return Promise.resolve(FALLBACK_COLOR)

  const cached = colorCache.get(logoUrl)
  if (cached) return cached

  const promise = new Promise<string>((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      try {
        resolve(extractDominantColor(img))
      } catch {
        resolve(FALLBACK_COLOR)
      }
    }
    img.onerror = () => resolve(FALLBACK_COLOR)
    img.src = logoUrl
  })

  colorCache.set(logoUrl, promise)
  return promise
}
