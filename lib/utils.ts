import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Futbol sezonunu döndürür.
 * Avrupa ligleri Ağustos'ta, Güney Amerika ligleri Ocak-Şubat'ta başlar.
 * Temmuz (ay=6) itibariyle yeni sezonu göster.
 */
export function currentSeason(): number {
  const now = new Date()
  // getMonth() 0-tabanlı: 6 = Temmuz
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
}
