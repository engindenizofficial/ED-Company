// ---------------------------------------------------------------------------
// ISO 3166-1 alpha-2 ülke kodundan, API-Football'ın Erkek A Milli Takım için
// kullandığı takım ismine (İngilizce) genel bir eşleştirme sağlar.
//
// API-Football'da milli takımlar, kulüplerden ayrı; isim doğrudan ülke ismi
// ile aynıdır (örn. "Turkey", "Indonesia", "Brazil"). Gençlik/kadın takımları
// ise ek son ek taşır (örn. "Turkey U21", "Turkey W") — bu yüzden TAM isim
// eşleşmesi otomatik olarak sadece A Milli Takım'ı seçer.
//
// Genel çözüm: `Intl.DisplayNames` ile ISO koddan İngilizce ülke ismi
// üretiyoruz (yeni bir ülke eklemek için kod değişikliği gerekmez). Ancak
// API-Football bazı ülkelerde farklı bir isim kullanıyor (örn. "South Korea"
// değil "Korea Republic", "USA" değil "United States") — bu istisnalar için
// küçük bir override tablosu tutuyoruz.
// ---------------------------------------------------------------------------

const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  US: "USA",
  KR: "Korea Republic",
  KP: "Korea DPR",
  CI: "Ivory Coast",
  CD: "DR Congo",
  CG: "Congo",
  CZ: "Czech Republic",
  AE: "United Arab Emirates",
  GB: "England", // navigator "en-GB" -> İngiliz kullanıcıları için en yaygın milli takım
  VA: "Vatican",
  BA: "Bosnia and Herzegovina",
  MK: "North Macedonia",
  TL: "East Timor",
  SZ: "Eswatini",
  CV: "Cape Verde",
  BN: "Brunei",
  LA: "Laos",
  VE: "Venezuela",
  SY: "Syria",
  MM: "Myanmar",
  RU: "Russia",
  TW: "Chinese Taipei",
}

let regionDisplayNames: Intl.DisplayNames | null = null
function getRegionDisplayNames(): Intl.DisplayNames | null {
  if (typeof Intl === "undefined" || typeof Intl.DisplayNames === "undefined") return null
  if (!regionDisplayNames) {
    try {
      regionDisplayNames = new Intl.DisplayNames(["en"], { type: "region" })
    } catch {
      return null
    }
  }
  return regionDisplayNames
}

/**
 * Verilen ISO 3166-1 alpha-2 ülke kodu için API-Football'daki Erkek A Milli
 * Takım isminin (İngilizce, örn. "Turkey") ne olduğunu döner. Bulunamazsa
 * null döner.
 */
export function getNationalTeamName(countryCode: string | null | undefined): string | null {
  if (!countryCode) return null
  const code = countryCode.toUpperCase()
  if (DISPLAY_NAME_OVERRIDES[code]) return DISPLAY_NAME_OVERRIDES[code]

  const display = getRegionDisplayNames()
  if (!display) return null
  try {
    const name = display.of(code)
    if (!name || name === code) return null
    return name
  } catch {
    return null
  }
}
