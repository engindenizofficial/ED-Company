import { CheckCircle2, XCircle } from "lucide-react"
import Link from "next/link"

export default async function DeleteAccountStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const success = status === "success"

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-border/60 bg-card p-8 text-center shadow-sm">
        {success ? (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>
            <h1 className="text-lg font-bold text-foreground">Hesabınız silindi</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Hesabınız ve tüm verileriniz (favoriler, tahmin geçmişi, profil bilgileri) kalıcı olarak silindi.
            </p>
          </>
        ) : (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <XCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
            </div>
            <h1 className="text-lg font-bold text-foreground">Link geçersiz veya süresi dolmuş</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Bu silme linki artık kullanılamıyor. Hesabınızı silmek isterseniz menüden yeni bir talep
              oluşturabilirsiniz.
            </p>
          </>
        )}
        <Link
          href="/"
          className="mt-2 flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Ana Sayfaya Dön
        </Link>
      </div>
    </main>
  )
}
