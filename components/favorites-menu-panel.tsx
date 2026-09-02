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
  Bell,
  BellOff,
  ChevronLeft,
  ChevronRight,
  Database,
  GripVertical,
  KeyRound,
  LogOut,
  Palette,
  Send,
  Star,
  Trash2,
  User,
  X,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"
import { createPortal } from "react-dom"
import { signOut, useSession } from "@/lib/auth-client"
import { useFavorites, type FavoriteItem } from "@/contexts/favorites-context"
import { useTeamPanel } from "@/contexts/team-context"
import { useLeaguePanel } from "@/contexts/league-context"
import { useThemeColor } from "@/contexts/theme-color-context"
import { ACCENT_COLORS } from "@/lib/accent-colors"
import { FavoriteSearchBar } from "@/components/favorite-search-bar"
import { ThemeColorPicker } from "@/components/theme-color-picker"
import { AccountSettingsPanel } from "@/components/account-settings-panel"
import { isAdminEmail } from "@/lib/admin"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/contexts/language-context"
import { LanguageSwitcher } from "@/components/language-switcher"
import { usePushNotifications } from "@/hooks/use-push-notifications"

type PanelView = "menu" | "favorites" | "theme" | "account" | "notifications"

// Bu bileşen, hamburger menüsüne tıklanana kadar HİÇ yüklenmez — bkz.
// components/favorites-menu.tsx'teki next/dynamic sarmalayıcısı. @dnd-kit
// (sürükle-bırak), ThemeColorPicker gibi ağır bağımlılıklar burada
// toplandığı için artık her sayfanın ana JS paketine gömülmüyorlar; bu
// Lighthouse'un "Kullanılmayan JavaScript" ve "Ana iş parçacığı çalışması"
// uyarılarına önemli bir katkısını ortadan kaldırır. Görünüm/davranış hiç
// değişmez, sadece kod ayrı bir chunk'ta ve sadece gerektiğinde yüklenir.
export function FavoritesMenuPanel({ onRequestClose }: { onRequestClose: () => void }) {
  const { t } = useLanguage()
  const { data: session } = useSession()
  const router = useRouter()
  const { openTeam } = useTeamPanel()
  const { openLeague } = useLeaguePanel()
  const { favorites, removeFavorite, reorderFavorites } = useFavorites()
  const { accentColor } = useThemeColor()
  const notifications = usePushNotifications(Boolean(session?.user))
  const activeAccent = ACCENT_COLORS.find((c) => c.id === accentColor) ?? ACCENT_COLORS[0]
  const isAdmin = isAdminEmail(session?.user?.email)

  const [view, setView] = useState<PanelView>("menu")
  const [signingOut, setSigningOut] = useState(false)
  const [testSent, setTestSent] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const close = useCallback(() => {
    setView("menu")
    onRequestClose()
  }, [onRequestClose])

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

  const handleSendTest = useCallback(async () => {
    setTestSent(false)
    await notifications.sendTest()
    setTestSent(true)
    setTimeout(() => setTestSent(false), 4000)
  }, [notifications])

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

  return createPortal(
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
        aria-label={t("menu.userMenu")}
        className="absolute left-0 top-0 flex h-full w-[86vw] max-w-[360px] animate-in slide-in-from-left flex-col border-r border-border/60 bg-background shadow-2xl duration-200"
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3.5">
          {view !== "menu" ? (
            <button
              type="button"
              onClick={() => setView("menu")}
              aria-label={t("common.back")}
              className="flex items-center justify-center rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          ) : null}
          <span className="flex-1 text-sm font-bold text-foreground">
            {view === "favorites"
              ? t("menu.myFavorites")
              : view === "theme"
                ? t("menu.themeColor")
                : view === "account"
                  ? t("menu.myAccount")
                  : view === "notifications"
                    ? t("menu.notifications")
                    : t("menu.title")}
          </span>
          {view === "menu" ? <LanguageSwitcher /> : null}
          <button
            type="button"
            onClick={close}
            aria-label={t("menu.closeMenu")}
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
                  <span className="truncate text-sm font-semibold text-foreground">{t("menu.myAccount")}</span>
                  <span className="truncate text-[11px] text-muted-foreground">{session.user.name}</span>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
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
              <span className="flex-1 text-sm font-semibold text-foreground">{t("menu.myFavorites")}</span>
              {favorites.length > 0 ? (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {favorites.length}
                </span>
              ) : null}
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
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
              <span className="flex-1 text-sm font-semibold text-foreground">{t("menu.themeColor")}</span>
              <span
                aria-hidden="true"
                className="h-4 w-4 shrink-0 rounded-full ring-1 ring-border"
                style={{ backgroundColor: activeAccent.swatch }}
              />
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </button>

            {/* Bildirimler — Tema Rengi'nin altında, hem misafir hem giriş yapmış kullanıcılarda */}
            <button
              type="button"
              onClick={() => setView("notifications")}
              className="mt-1 flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-secondary"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary">
                {notifications.status === "enabled" ? (
                  <Bell className="h-4 w-4 text-primary" />
                ) : (
                  <BellOff className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <span className="flex-1 text-sm font-semibold text-foreground">{t("menu.notifications")}</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </button>

            {isAdmin ? (
              <Link
                href="/yonetim/veri-aktarimi"
                onClick={close}
                className="mt-1 flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-secondary"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary">
                  <Database className="h-4 w-4 text-primary" />
                </div>
                <span className="flex-1 text-sm font-semibold text-foreground">Veri aktarımı</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            ) : null}

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
                <span className="text-sm font-semibold text-destructive">{t("menu.signOut")}</span>
              </button>
            ) : (
              <div className="mt-auto flex flex-col gap-1">
                <Link
                  href="/sign-up"
                  onClick={close}
                  className="flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-secondary"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">{t("menu.signUp")}</span>
                </Link>
                <Link
                  href="/sign-in"
                  onClick={close}
                  className="flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-secondary"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <KeyRound className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">{t("menu.signIn")}</span>
                </Link>
              </div>
            )}
          </div>
        ) : view === "theme" ? (
          <ThemeColorPicker />
        ) : view === "notifications" ? (
          <div className="flex flex-1 flex-col overflow-y-auto p-4">
            <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-5">
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  {notifications.status === "enabled" ? (
                    <Bell className="h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <BellOff className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="text-sm font-bold text-foreground">{t("notifications.goalAlertsTitle")}</span>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("notifications.goalAlertsDesc")}
                </p>
              </div>

              {notifications.status === "unsupported" ? (
                <p className="text-xs font-medium text-muted-foreground">{t("notifications.notSupported")}</p>
              ) : notifications.status === "enabled" ? (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={notifications.disable}
                    disabled={notifications.busy}
                    className="flex items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50"
                  >
                    <BellOff className="h-3.5 w-3.5" />
                    {notifications.busy ? t("notifications.disabling") : t("notifications.disable")}
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={handleSendTest}
                      disabled={notifications.busy}
                      className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-transparent px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {t("notifications.sendTest")}
                    </button>
                  )}
                  {testSent ? (
                    <p className="text-xs font-medium text-primary">{t("notifications.testSent")}</p>
                  ) : null}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={notifications.enable}
                  disabled={notifications.busy || notifications.status === "loading"}
                  className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  <Bell className="h-3.5 w-3.5" />
                  {notifications.busy ? t("notifications.enabling") : t("notifications.enable")}
                </button>
              )}

              {notifications.error ? (
                <p className="text-xs font-medium text-destructive">
                  {t(`notifications.${notifications.error}`)}
                </p>
              ) : null}

              <p className="text-[11px] leading-relaxed text-muted-foreground/80">{t("notifications.iosHint")}</p>
            </div>
          </div>
        ) : view === "account" ? (
          <AccountSettingsPanel />
        ) : (
          <div className="flex flex-1 flex-col overflow-y-auto p-4">
            <FavoriteSearchBar />

            <div className="mt-4 flex flex-col gap-1">
              {favorites.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/60 px-4 py-8 text-center">
                  <Star className="h-5 w-5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    {t("menu.noFavoritesYet")}
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
  const { t } = useLanguage()
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
        aria-label={t("menu.dragToReorder")}
        className="flex h-8 w-6 shrink-0 cursor-grab touch-none select-none items-center justify-center text-muted-foreground hover:text-muted-foreground active:cursor-grabbing"
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
            <img src={favorite.logo} alt="" className="h-6 w-6 object-contain rounded-full bg-white/95 p-0.5 ring-1 ring-black/5" width={24} height={24} loading="lazy" decoding="async" />
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
        aria-label={`${favorite.name} ${t("menu.removeFromFavorites")}`}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
