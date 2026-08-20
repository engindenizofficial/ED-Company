// Kullanıcının kişiselleştirebileceği site vurgu (tema) renkleri.
// Her giriş, globals.css içindeki `:root[data-accent="id"]` /
// `.dark[data-accent="id"]` blokları ile birebir eşleşmelidir.
//
// `swatch`, seçim panelindeki yuvarlak renk butonunun rengidir (light-mode
// primary tonuyla aynıdır) — kullanıcı butona bakınca gerçek sonucu görür.
//
// Renk isimleri burada SABİT metin olarak tutulmaz — dil bağımsız olması
// gerekir. Görüntülenecek isim, `id` anahtarıyla
// `themeColorPicker.colors.<id>` sözlük anahtarından (lib/i18n/dictionaries.ts)
// okunur, böylece İngilizce arayüzde de İngilizce renk adı gösterilir.

export interface AccentColor {
  id: string
  swatch: string
}

export const DEFAULT_ACCENT_COLOR = "green"

export const ACCENT_COLORS: AccentColor[] = [
  { id: "green", swatch: "oklch(0.52 0.18 152)" },
  { id: "blue", swatch: "oklch(0.55 0.19 255)" },
  { id: "indigo", swatch: "oklch(0.5 0.2 275)" },
  { id: "purple", swatch: "oklch(0.53 0.22 300)" },
  { id: "pink", swatch: "oklch(0.58 0.22 350)" },
  { id: "red", swatch: "oklch(0.55 0.22 18)" },
  { id: "orange", swatch: "oklch(0.62 0.19 55)" },
  { id: "amber", swatch: "oklch(0.72 0.17 85)" },
  { id: "teal", swatch: "oklch(0.55 0.15 195)" },
  { id: "emerald", swatch: "oklch(0.5 0.16 165)" },
]

const ACCENT_IDS = new Set(ACCENT_COLORS.map((c) => c.id))

export function isValidAccentColor(value: unknown): value is string {
  return typeof value === "string" && ACCENT_IDS.has(value)
}
