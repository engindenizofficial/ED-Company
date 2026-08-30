import { timingSafeEqual } from "node:crypto"

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET

  if (!secret) {
    return process.env.NODE_ENV === "development"
  }

  const authorization = request.headers.get("authorization") ?? ""
  const prefix = "Bearer "
  if (!authorization.startsWith(prefix)) return false

  return safeEqual(secret, authorization.slice(prefix.length))
}
