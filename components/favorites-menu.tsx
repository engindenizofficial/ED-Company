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
import { ChevronLeft, ChevronRight, GripVertical, LogOut, Menu, Star, Trash2, User, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"
import { signOut, useSession } from "@/lib/auth-client"
import { useFavorites, type FavoriteItem } from "@/contexts/favorites-context"
import { useTeamPanel } from "@/contexts/team-context"
import { useLeaguePanel } from "@/contexts/league-context"
import { FavoriteSearchBar } from "@/components/favorite-search-bar"
import { cn } from "@/lib/utils"

type PanelView = "menu" | "favorites"

export function FavoritesMenu() {
  const { data: session } = useSession()
  const router = useRouter()
  const { openTeam } = useTeamPanel()
  const { openLeague } = useLeaguePanel()
  const { favorites, removeFavorite, reorderFavorites } = useFavorites()

  const [open, setOpen] = useState(false)
  const [view, setView] = useState<PanelView>("menu")
  const [signingOut, setSigningOut] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const close = useCallback(() => {
    setOpen(false)
    setView("menu")
  }, [])

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

  // Sadece giriş yapmış kullanıcılar için gösterilir.
  if (!session?.user) return null

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

      {open ? (
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
              {view === "favorites" ? (
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
                {view === "favorites" ? "Favorilerim" : "Menü"}
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
                {/* Hesabım — tıklanamaz */}
                <div className="flex cursor-default items-center gap-3 rounded-xl px-3 py-3 opacity-70">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold text-foreground">Hesabım</span>
                    <span className="truncate text-[11px] text-muted-foreground">{session.user.name}</span>
                  </div>
                </div>

                {/* Favorilerim */}
                <button
                  type="button"
                  onClick={() => setView("favorites")}
                  className="mt-1 flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-secondary"
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

                {/* Çıkış Yap — en altta */}
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
        </div>
      ) : null}
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
        className="flex h-8 w-6 shrink-0 cursor-grab items-center justify-center text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
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
