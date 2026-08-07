import { NextRequest, NextResponse } from "next/server"

const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/api/auth", "/verify-email"]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/") ||
    pathname.includes(".")
  ) {
    return NextResponse.next()
  }

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Kullanıcı "Giriş yapmadan devam et" seçtiyse geç
  const guest = request.cookies.get("guest_mode")?.value
  if (guest === "1") return NextResponse.next()

  const sessionToken =
    request.cookies.get("better-auth.session_token")?.value ??
    request.cookies.get("__Secure-better-auth.session_token")?.value

  if (!sessionToken) {
    const signInUrl = new URL("/sign-in", request.url)
    return NextResponse.redirect(signInUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
