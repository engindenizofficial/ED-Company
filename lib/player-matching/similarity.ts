import { normalizeText } from './normalize'

export function levenshteinDistance(left: string, right: string): number {
  if (!left.length) return right.length
  if (!right.length) return left.length
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i++) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= right.length; j++) {
      const above = previous[j]
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1))
      diagonal = above
    }
  }
  return previous[right.length]
}

export function characterSimilarity(left: string, right: string): number {
  if (left === right) return 1
  if (!left.length || !right.length) return 0
  return 1 - levenshteinDistance(left, right) / Math.max(left.length, right.length)
}

export function tokenOverlap(left: string, right: string): number {
  const leftTokens = new Set(left.split(' ').filter(Boolean))
  const rightTokens = new Set(right.split(' ').filter(Boolean))
  if (!leftTokens.size || !rightTokens.size) return 0
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length
  return (2 * intersection) / (leftTokens.size + rightTokens.size)
}

export function nameSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizeText(left)
  const normalizedRight = normalizeText(right)
  if (normalizedLeft === normalizedRight && normalizedLeft.length > 0) return 1
  return Number((tokenOverlap(normalizedLeft, normalizedRight) * 0.6 + characterSimilarity(normalizedLeft, normalizedRight) * 0.4).toFixed(5))
}
