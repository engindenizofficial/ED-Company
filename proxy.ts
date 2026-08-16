import { NextRequest, NextResponse } from "next/server"

// Giriş yapmamış kullanıcılar da siteyi doğrudan ana ekrandan kullanabilir;
// bu proxy artık hiçbir sayfayı zorunlu giriş ekranına yönlendirmiyor.
// /sign-in ve /sign-up sayfaları isteyen kullanıcılar için erişilebilir
// kalıyor, sadece erişimi zorunlu kılmıyoruz.
export async function proxy(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
