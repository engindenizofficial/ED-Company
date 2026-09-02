import { normalizeText } from './normalize'

function levenshteinDistance(left: string, right: string): number {
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

function characterSimilarity(left: string, right: string): number {
  if (left === right) return 1
  if (!left.length || !right.length) return 0
  return 1 - levenshteinDistance(left, right) / Math.max(left.length, right.length)
}

function tokenOverlap(left: string, right: string): number {
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

type NameEvidenceKind =
  | 'exact'
  | 'token_subset'
  | 'initial_and_surname'
  | 'shared_surname'
  | 'close_spelling'
  | 'insufficient'

export type NameEvidence = {
  kind: NameEvidenceKind
  rank: number
  score: number
  accepted: boolean
}

const particles = new Set(['al', 'bin', 'da', 'de', 'del', 'der', 'di', 'dos', 'du', 'el', 'la', 'le', 'van', 'von'])

function nameTokens(value: string) {
  return normalizeText(value).split(' ').filter(Boolean)
}

function significantTokens(value: string) {
  return nameTokens(value).filter((token) => token.length > 1 && !particles.has(token))
}

function isInitialFor(initial: string, token: string) {
  return initial.length === 1 && token.startsWith(initial)
}

export function analyzeNameEvidence(left: string, right: string): NameEvidence {
  const normalizedLeft = normalizeText(left)
  const normalizedRight = normalizeText(right)
  const score = nameSimilarity(normalizedLeft, normalizedRight)
  if (!normalizedLeft || !normalizedRight) return { kind: 'insufficient', rank: 0, score, accepted: false }
  if (normalizedLeft === normalizedRight) return { kind: 'exact', rank: 5, score, accepted: true }

  const leftTokens = significantTokens(normalizedLeft)
  const rightTokens = significantTokens(normalizedRight)
  const rightSet = new Set(rightTokens)
  const shared = leftTokens.filter((token) => rightSet.has(token))
  const shorter = leftTokens.length <= rightTokens.length ? leftTokens : rightTokens
  const longer = leftTokens.length <= rightTokens.length ? rightTokens : leftTokens

  if (shorter.length && shorter.every((token) => longer.includes(token))) {
    return { kind: 'token_subset', rank: 4, score, accepted: true }
  }

  const leftSurname = leftTokens.at(-1)
  const rightSurname = rightTokens.at(-1)
  const sameSurname = Boolean(leftSurname && rightSurname && leftSurname === rightSurname)
  const leftFirst = leftTokens[0]
  const rightFirst = rightTokens[0]
  const compatibleFirst = Boolean(
    leftFirst && rightFirst &&
      (leftFirst === rightFirst || isInitialFor(leftFirst, rightFirst) || isInitialFor(rightFirst, leftFirst)),
  )

  if (sameSurname && compatibleFirst) {
    return { kind: 'initial_and_surname', rank: 4, score, accepted: true }
  }
  if (sameSurname && shared.length >= 1 && (leftSurname?.length ?? 0) >= 4) {
    return { kind: 'shared_surname', rank: 3, score, accepted: true }
  }

  const distance = levenshteinDistance(normalizedLeft, normalizedRight)
  const allowedDistance = Math.max(normalizedLeft.length, normalizedRight.length) >= 12 ? 2 : 1
  if (distance <= allowedDistance) {
    return { kind: 'close_spelling', rank: 2, score, accepted: true }
  }

  return { kind: 'insufficient', rank: 0, score, accepted: false }
}
