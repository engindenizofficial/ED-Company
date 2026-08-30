const SPECIAL_CHARACTERS: Record<string, string> = {
  ı: 'i', İ: 'i', ğ: 'g', Ğ: 'g', ş: 's', Ş: 's', ç: 'c', Ç: 'c',
  ö: 'o', Ö: 'o', ü: 'u', Ü: 'u', ł: 'l', Ł: 'l', đ: 'd', Đ: 'd',
  ø: 'o', Ø: 'o', æ: 'ae', Æ: 'ae', œ: 'oe', Œ: 'oe', ß: 'ss',
}

export function normalizeText(value: unknown): string {
  if (typeof value !== 'string') return ''
  const transliterated = [...value].map((character) => SPECIAL_CHARACTERS[character] ?? character).join('')
  return transliterated
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeDate(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return `${value.getUTCFullYear().toString().padStart(4, '0')}-${(value.getUTCMonth() + 1).toString().padStart(2, '0')}-${value.getUTCDate().toString().padStart(2, '0')}`
  }
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  const [, year, month, day] = match
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== `${year}-${month}-${day}`) return null
  return `${year}-${month}-${day}`
}
