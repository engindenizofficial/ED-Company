import * as cheerio from "cheerio"

const BASE_URL = "https://www.transfermarkt.com"
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

async function fetchHtml(url: string): Promise<string | null> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    },
    redirect: "follow",
  })

  if (!response.ok) {
    if (response.status === 404) return null
    throw new Error(`HTTP ${response.status} ${response.statusText}`)
  }

  return response.text()
}

export interface ScrapedPlayerPosition {
  mainPosition: string | null
  secondaryPositions: string[]
}

/** Bir oyuncu profilindeki ana ve alternatif mevkileri okur. */
export async function scrapePlayerPosition(
  transfermarktPlayerId: string,
): Promise<ScrapedPlayerPosition | null> {
  const html = await fetchHtml(`${BASE_URL}/x/profil/spieler/${transfermarktPlayerId}`)
  if (!html) return null

  const $ = cheerio.load(html)
  let mainPosition: string | null = null
  const secondaryPositions: string[] = []
  let currentLabel: "main" | "other" | null = null

  $(".detail-position dt, .detail-position dd").each((_, element) => {
    const current = $(element)
    const tag = element.tagName?.toLowerCase()

    if (tag === "dt") {
      const label = current.text().trim().toLowerCase()
      currentLabel = label.startsWith("main position")
        ? "main"
        : label.startsWith("other position")
          ? "other"
          : null
      return
    }

    if (tag === "dd" && current.hasClass("detail-position__position")) {
      const text = current.text().trim()
      if (!text) return
      if (currentLabel === "main" && !mainPosition) mainPosition = text
      else if (currentLabel === "other") secondaryPositions.push(text)
    }
  })

  if (!mainPosition && secondaryPositions.length === 0) return null
  return { mainPosition, secondaryPositions }
}
