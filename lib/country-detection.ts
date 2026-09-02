import { getCountry, getCountryForTimezone } from 'countries-and-timezones'

export type CountryDetectionSource = 'ip' | 'language'

export type CountryDetection = {
  countryCode: string | null
  source: CountryDetectionSource | null
}

export function normalizeCountryCode(value: string | null | undefined): string | null {
  const code = value?.trim().toUpperCase()
  if (!code || !/^[A-Z]{2}$/.test(code)) return null
  return getCountry(code)?.id ?? null
}

export function detectCountryFromLanguageTag(languageTag: string | null | undefined): string | null {
  const tag = languageTag?.trim()
  if (!tag || tag === '*') return null

  try {
    return normalizeCountryCode(new Intl.Locale(tag).maximize().region)
  } catch {
    return null
  }
}

export function detectCountryFromLanguages(languages: readonly string[]): string | null {
  for (const language of languages) {
    const countryCode = detectCountryFromLanguageTag(language)
    if (countryCode) return countryCode
  }
  return null
}

export function detectCountryFromAcceptLanguage(value: string | null | undefined): string | null {
  if (!value) return null

  const languages = value
    .split(',')
    .map((entry, index) => {
      const [tag = '', ...parameters] = entry.trim().split(';')
      const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith('q='))
      const parsedQuality = qualityParameter ? Number.parseFloat(qualityParameter.trim().slice(2)) : 1
      return {
        tag,
        quality: Number.isFinite(parsedQuality) ? parsedQuality : 0,
        index,
      }
    })
    .filter(({ quality }) => quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map(({ tag }) => tag)

  return detectCountryFromLanguages(languages)
}

export function detectCountryFromTimeZone(timeZone: string | null | undefined): string | null {
  if (!timeZone) return null

  try {
    return normalizeCountryCode(getCountryForTimezone(timeZone)?.id)
  } catch {
    return null
  }
}

export function detectServerCountry(requestHeaders: Pick<Headers, 'get'>): CountryDetection {
  const ipCountry = normalizeCountryCode(requestHeaders.get('x-vercel-ip-country'))
  if (ipCountry) return { countryCode: ipCountry, source: 'ip' }

  const languageCountry = detectCountryFromAcceptLanguage(requestHeaders.get('accept-language'))
  if (languageCountry) return { countryCode: languageCountry, source: 'language' }

  return { countryCode: null, source: null }
}
