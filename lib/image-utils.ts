/**
 * Takım/lig logoları gibi dış kaynaklı küçük görselleri Next.js'in yerleşik
 * `/_next/image` optimizasyon proxy'sinden geçirir. Bu sayede kaynağın
 * (media.api-sports.io) gönderdiği büyük PNG/SVG dosyaları, sayfada
 * gösterilen gerçek piksel boyutuna küçültülüp modern bir formata
 * (WebP/AVIF) sıkıştırılarak indirilir — hem "resmi verimli kodlayın" hem de
 * "büyük ağ yükü" uyarılarının kaynağı olan fazladan KiB'ları ortadan
 * kaldırır. Yerel/placeholder görseller ve zaten proxy'lenmiş adresler
 * olduğu gibi bırakılır.
 *
 * `width` görselin ekranda gösterildiği CSS piksel genişliğidir; retina
 * ekranlar için otomatik olarak 2x istenir.
 */
export function optimizedLogoSrc(src: string | null | undefined, width: number): string {
  if (!src) return "/placeholder.svg"
  if (!src.startsWith("https://media.api-sports.io/")) return src
  const params = new URLSearchParams({ url: src, w: String(width * 2), q: "75" })
  return `/_next/image?${params.toString()}`
}
