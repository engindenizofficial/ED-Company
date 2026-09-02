import { describe, expect, it } from 'vitest'
import {
  detectCountryFromAcceptLanguage,
  detectCountryFromLanguageTag,
  detectCountryFromTimeZone,
  detectServerCountry,
  normalizeCountryCode,
} from './country-detection'

describe('country detection', () => {
  it('normalizes and validates ISO country codes', () => {
    expect(normalizeCountryCode(' tr ')).toBe('TR')
    expect(normalizeCountryCode('XX')).toBeNull()
    expect(normalizeCountryCode('TUR')).toBeNull()
  })

  it('infers regions from both complete and language-only tags', () => {
    expect(detectCountryFromLanguageTag('tr-TR')).toBe('TR')
    expect(detectCountryFromLanguageTag('tr')).toBe('TR')
    expect(detectCountryFromLanguageTag('id')).toBe('ID')
    expect(detectCountryFromLanguageTag('not_a_locale')).toBeNull()
  })

  it('honors Accept-Language quality ordering', () => {
    expect(detectCountryFromAcceptLanguage('en-US;q=0.5, tr-TR;q=0.9')).toBe('TR')
    expect(detectCountryFromAcceptLanguage('tr;q=0, de-DE;q=0.8')).toBe('DE')
  })

  it('maps IANA time zones to their country', () => {
    expect(detectCountryFromTimeZone('Europe/Istanbul')).toBe('TR')
    expect(detectCountryFromTimeZone('Asia/Jakarta')).toBe('ID')
    expect(detectCountryFromTimeZone('Invalid/Zone')).toBeNull()
  })

  it('prefers Vercel IP geolocation over language', () => {
    const values = new Map([
      ['x-vercel-ip-country', 'TR'],
      ['accept-language', 'en-US,en;q=0.9'],
    ])
    const headers = { get: (name: string) => values.get(name) ?? null }

    expect(detectServerCountry(headers)).toEqual({ countryCode: 'TR', source: 'ip' })
  })

  it('falls back to Accept-Language when geolocation is unavailable', () => {
    const headers = { get: (name: string) => name === 'accept-language' ? 'tr,en;q=0.8' : null }

    expect(detectServerCountry(headers)).toEqual({ countryCode: 'TR', source: 'language' })
  })
})
