"use client"

import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  KeyRound,
  LogOut,
  Mail,
  Menu,
  Palette,
  ShieldCheck,
  Star,
  Trash2,
  TriangleAlert,
  User,
  X,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { signOut, useSession } from "@/lib/auth-client"
import { useFavorites, type FavoriteItem } from "@/contexts/favorites-context"
import { useTeamPanel } from "@/contexts/team-context"
import { useLeaguePanel } from "@/contexts/league-context"
import { useThemeColor } from "@/contexts/theme-color-context"
import { ACCENT_COLORS } from "@/lib/accent-colors"
import { FavoriteSearchBar } from "@/components/favorite-search-bar"
import { ThemeColorPicker } from "@/components/theme-color-picker"
import { requestAccountDeletion } from "@/app/actions/account"
import { isAdminEmail } from "@/lib/admin"
import { cn } from "@/lib/utils"

type PanelView = "menu" | "favorites" | "theme" | "account"

export function FavoritesMenu() {
  const { data: session } = useSession()
  const router = useRouter()
  const { openTeam } = useTeamPanel()
  const { openLeague } = useLeaguePanel()
  const { favorites, removeFavorite, reorderFavorites } = useFavorites()
  const { accentColor } = useThemeColor()
  const activeAccent = ACCENT_COLORS.find((c) => c.id === accentColor) ?? ACCENT_COLORS[0]
  const isAdmin = isAdminEmail(session?.user?.email)

  const [open, setOpen] = useState(false)
  const [view, setView] = useState<PanelView>("menu")
  const [signingOut, setSigningOut] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [sendingDelete, setSendingDelete] = useState(false)
  const [deleteSentTo, setDeleteSentTo] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const close = useCallback(() => {
    setOpen(false)
    setView("menu")
    setDeleteSentTo(null)
    setDeleteError(null)
  }, [])

  const handleRequestAccountDeletion = useCallback(async () => {
    if (sendingDelete) return
    setSendingDelete(true)
    setDeleteError(null)
    try {
      const { email } = await requestAccountDeletion()
      setDeleteSentTo(email)
    } catch {
      setDeleteError("Bir şeyler ters gitti. Lütfen daha sonra tekrar deneyin.")
    } finally {
      setSendingDelete(false)
    }
  }, [sendingDelete])

  const handleSignOut = useCallback(async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      await signOut()
      close()
      router.push("/")
      router.refresh()
    } finally {
      setSigningOut(false)
    }
  }, [signingOut, close, router])

  const handleFavoriteClick = useCallback(
    (fav: FavoriteItem) => {
      close()
      if (fav.type === "team") {
        openTeam({ id: fav.itemId, name: fav.name, logo: fav.logo ?? "" })
      } else {
        openLeague({
          id: fav.itemId,
          name: fav.name,
          logo: fav.logo ?? "",
          country: fav.country ?? "",
          flagUrl: fav.flagUrl,
        })
      }
    },
    [close, openTeam, openLeague],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const oldIndex = favorites.findIndex((f) => f.id === active.id)
      const newIndex = favorites.findIndex((f) => f.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return
      const reordered = arrayMove(favorites, oldIndex, newIndex)
      reorderFavorites(reordered.map((f) => f.id))
    },
    [favorites, reorderFavorites],
  )

  // Menü hem giriş yapmış hem misafir kullanıcılar için gösterilir —
  // favorilere erişmek için hesap açmak zorunlu değildir.

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Menüyü aç"
        className="flex items-center justify-center rounded-lg p-2 -ml-1 text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && mounted
        ? createPortal(
          <div className="fixed inset-0 z-[100]">
          {/* Overlay */}
          <div
            className="absolute inset-0 animate-in fade-in bg-black/50 duration-200"
            onClick={close}
            aria-hidden="true"
          />

          {/* Panel */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Kullanıcı menüsü"
            className="absolute left-0 top-0 flex h-full w-[86vw] max-w-[360px] animate-in slide-in-from-left flex-col border-r border-border/60 bg-background shadow-2xl duration-200"
          >
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3.5">
              {view !== "menu" ? (
                <button
                  type="button"
                  onClick={() => setView("menu")}
                  aria-label="Geri"
                  className="flex items-center justify-center rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              ) : null}
              <span className="flex-1 text-sm font-bold text-foreground">
                {view === "favorites"
                  ? "Favorilerim"
                  : view === "theme"
                    ? "Tema Rengi"
                    : view === "account"
                      ? "Hesabım"
                      : "Menü"}
              </span>
              <button
                type="button"
                onClick={close}
                aria-label="Menüyü kapat"
                className="flex items-center justify-center rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            {view === "menu" ? (
              <div className="flex flex-1 flex-col overflow-y-auto p-2">
                {/* Hesabım — sadece giriş yapmış kullanıcılarda gösterilir, en üstte */}
                {session?.user ? (
                  <button
                    type="button"
                    onClick={() => setView("account")}
                    className="flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-secondary"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold text-foreground">Hesabım</span>
                      <span className="truncate text-[11px] text-muted-foreground">{session.user.name}</span>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                  </button>
                ) : null}

                {/* Yönetim Paneli — sadece admin e-postasıyla giriş yapılmışsa, Hesabım'ın altında */}
                {isAdmin ? (
                  <Link
                    href="/admin/market-value-review"
                    onClick={close}
                    className="mt-1 flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-secondary"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                    </div>
                    <span className="flex-1 text-sm font-semibold text-foreground">Yönetim Paneli</span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                  </Link>
                ) : null}

                {/* Favorilerim — giriş yapmışsa Hesabım'ın altında, misafirse en üstte */}
                <button
                  type="button"
                  onClick={() => setView("favorites")}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-secondary ${session?.user ? "mt-1" : ""}`}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <Star className="h-4 w-4 text-primary" />
                  </div>
                  <span className="flex-1 text-sm font-semibold text-foreground">Favorilerim</span>
                  {favorites.length > 0 ? (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                      {favorites.length}
                    </span>
                  ) : null}
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                </button>

                {/* Tema Rengi — Favorilerim'in altında, hem misafir hem giriş yapmış kullanıcılarda */}
                <button
                  type="button"
                  onClick={() => setView("theme")}
                  className="mt-1 flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-secondary"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <Palette className="h-4 w-4 text-primary" />
                  </div>
                  <span className="flex-1 text-sm font-semibold text-foreground">Tema Rengi</span>
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 rounded-full ring-1 ring-border"
                    style={{ backgroundColor: activeAccent.swatch }}
                  />
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                </button>

                {/* Çıkış Yap (giriş yapmışsa) / Giriş Yap daveti (misafirse) — en altta */}
                {session?.user ? (
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={signingOut}
                    className="mt-auto flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-destructive/10 disabled:opacity-50"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary">
                      <LogOut className="h-4 w-4 text-destructive" />
                    </div>
                    <span className="text-sm font-semibold text-destructive">Çıkış Yap</span>
                  </button>
                ) : (
                  <Link
                    href="/sign-in"
                    onClick={close}
                    className="mt-auto flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-secondary"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary">
                      <KeyRound className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-sm font-semibold text-foreground">Giriş Yap</span>
                  </Link>
                )}
              </div>
            ) : view === "theme" ? (
              <ThemeColorPicker />
            ) : view === "account" ? (
              <div className="flex flex-1 flex-col overflow-y-auto p-4">
                <div className="flex flex-col gap-4 rounded-2xl border border-destructive/30 bg-card p-5">
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-2">
                      <TriangleAlert className="h-4 w-4 shrink-0 text-destructive" />
                      <span className="text-sm font-bold text-foreground">Hesabımı Sil</span>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Hesabınızı sildiğinizde profil bilgileriniz, favori takım/liglerinizi ve tüm tahmin
                      geçmişiniz kalıcı olarak silinir.
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Bu işlem geri alınamaz. Devam etmek için e-posta adresinize bir onay linki göndereceğiz.
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      E-postadaki linke tıkladığınız anda hesabınız kalıcı olarak silinir.
                    </p>
                  </div>

                  {deleteSentTo ? (
                    <div className="flex items-center gap-2.5 rounded-xl bg-secondary px-3 py-2.5">
                      <Mail className="h-4 w-4 shrink-0 text-primary" />
                      <p className="text-xs leading-relaxed text-foreground">
                        <span className="font-semibold">{deleteSentTo}</span> adresine silme linki gönderildi.
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleRequestAccountDeletion}
                      disabled={sendingDelete}
                      className="flex items-center justify-center rounded-xl bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
                    >
                      {sendingDelete ? "Gönderiliyor..." : "Hesabımı Sil"}
                    </button>
                  )}

                  {deleteError ? <p className="text-xs font-medium text-destructive">{deleteError}</p> : null}
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col overflow-y-auto p-4">
                <FavoriteSearchBar />

                <div className="mt-4 flex flex-col gap-1">
                  {favorites.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/60 px-4 py-8 text-center">
                      <Star className="h-5 w-5 text-muted-foreground/30" />
                      <p className="text-xs text-muted-foreground">
                        Henüz favori eklemediniz. Yukarıdan takım veya lig arayın.
                      </p>
                    </div>
                  ) : (
                    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                      <SortableContext
                        items={favorites.map((f) => f.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {favorites.map((fav, index) => (
                          <SortableFavoriteRow
                            key={fav.id}
                            favorite={fav}
                            index={index}
                            onSelect={() => handleFavoriteClick(fav)}
                            onRemove={() => removeFavorite(fav.id)}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
              </div>
            )}
          </div>
          </div>,
          document.body,
        )
        : null}
    </>
  )
}

function SortableFavoriteRow({
  favorite,
  index,
  onSelect,
  onRemove,
}: {
  favorite: FavoriteItem
  index: number
  onSelect: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: favorite.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-2 rounded-xl border border-border/60 bg-card px-2 py-2 transition-colors",
        isDragging ? "z-10 opacity-90 shadow-lg" : "hover:border-border",
      )}
    >
      {/* Drag handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Sürükleyerek sıralamayı değiştir"
        className="flex h-8 w-6 shrink-0 cursor-grab touch-none select-none items-center justify-center text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Position */}
      <span className="w-5 shrink-0 text-center text-xs font-black tabular-nums text-primary">{index + 1}-</span>

      {/* Row content */}
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <div className="relative h-6 w-6 shrink-0">
          {favorite.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={favorite.logo} alt="" className="h-6 w-6 object-contain" />
          ) : (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-[10px] font-black text-muted-foreground">
              {favorite.name.charAt(0)}
            </div>
          )}
        </div>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground group-hover:text-primary transition-colors">
          {favorite.name}
        </span>
      </button>

      {/* Trash */}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${favorite.name} favorilerden kaldır`}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
