import { NextRequest, NextResponse } from 'next/server'

// Korumasız (herkese açık) rotalar
const PUBLIC_PATHS = ['/sign-in', '/sign-up', '/api/auth']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Statik dosyalar ve API rotaları için geç (auth API hariç)
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Herkese açık sayfalara her zaman izin ver
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Better Auth session cookie'sini kontrol et
  const sessionToken =
    request.cookies.get('better-auth.session_token')?.value ??
    request.cookies.get('__Secure-better-auth.session_token')?.value

  if (!sessionToken) {
    const signInUrl = new URL('/sign-in', request.url)
    return NextResponse.redirect(signInUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
