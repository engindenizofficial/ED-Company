/**
 * Kullanıcı canlı bir maçı ana ekranda görüp siteden ayrıldığında (sekmeyi
 * kapatma, sayfayı yeniden yükleme, tarayıcıyı tamamen kapatıp yeniden açma
 * gibi React state'inin/ref'lerinin sıfırlandığı durumlar), "geri döndüğünde
 * kaçırdığın tek golü göster" özelliği için son görülen skoru localStorage'da
 * saklar.
 *
 * Kurallar (bkz. goal-celebration-overlay.tsx: useGoalCelebrationQueue):
 * - Kullanıcı geri döndüğünde toplam gol farkı TAM OLARAK 1 ise o golün
 *   kutlaması gösterilir.
 * - Fark 2 veya daha fazlaysa (kullanıcı birden fazla golü kaçırmışsa)
 *   hiçbir animasyon gösterilmez, skor sessizce güncellenir.
 * - Maç, kullanıcı geri döndüğünde zaten bitmişse, fark kaç olursa olsun
 *   animasyon gösterilmez ve kayıt silinir.
 * - Kayıtlar 24 saatten eskiyse otomatik olarak geçersiz sayılır ve silinir.
 */

const STORAGE_PREFIX = "v0:goalCatchup:"
const MAX_AGE_MS = 24 * 60 * 60 * 1000

interface StoredScore {
  home: number
  away: number
  savedAt: number
}

function storageKey(fixtureId: number): string {
  return `${STORAGE_PREFIX}${fixtureId}`
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

export function readStoredScore(fixtureId: number): StoredScore | null {
  if (!isBrowser()) return null
  try {
    const raw = window.localStorage.getItem(storageKey(fixtureId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredScore
    if (typeof parsed?.home !== "number" || typeof parsed?.away !== "number" || typeof parsed?.savedAt !== "number") {
      window.localStorage.removeItem(storageKey(fixtureId))
      return null
    }
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(storageKey(fixtureId))
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeStoredScore(fixtureId: number, home: number, away: number): void {
  if (!isBrowser()) return
  try {
    window.localStorage.setItem(storageKey(fixtureId), JSON.stringify({ home, away, savedAt: Date.now() }))
    pruneExpiredEntries()
  } catch {
    // localStorage dolu/erişilemez olabilir (gizli mod vb.) — sessizce yut,
    // bu özellik olmadan da uygulama normal çalışmaya devam eder.
  }
}

export function clearStoredScore(fixtureId: number): void {
  if (!isBrowser()) return
  try {
    window.localStorage.removeItem(storageKey(fixtureId))
  } catch {
    // yut
  }
}

/** Her yazma işleminde, 24 saati geçmiş eski kayıtları temizler; böylece
 * kullanıcı bir maça hiç geri dönmese bile localStorage sınırsız büyümez. */
function pruneExpiredEntries(): void {
  try {
    const now = Date.now()
    const keysToRemove: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue
      const raw = window.localStorage.getItem(key)
      if (!raw) continue
      try {
        const parsed = JSON.parse(raw) as StoredScore
        if (typeof parsed?.savedAt !== "number" || now - parsed.savedAt > MAX_AGE_MS) {
          keysToRemove.push(key)
        }
      } catch {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key))
  } catch {
    // yut
  }
}
