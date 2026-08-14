"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { useSession } from "@/lib/auth-client"
import {
  addFavorite as addFavoriteAction,
  getFavorites,
  removeFavorite as removeFavoriteAction,
  reorderFavorites as reorderFavoritesAction,
  type FavoriteItem,
} from "@/app/actions/favorites"

export type { FavoriteItem }

export interface NewFavoriteInput {
  type: "team" | "league"
  itemId: number
  name: string
  logo: string | null
  country: string | null
  flagUrl: string | null
}

interface FavoritesContextValue {
  favorites: FavoriteItem[]
  loading: boolean
  addFavorite: (input: NewFavoriteInput) => Promise<void>
  removeFavorite: (id: string) => Promise<void>
  reorderFavorites: (orderedIds: string[]) => Promise<void>
  isFavorite: (type: "team" | "league", itemId: number) => boolean
  /** Favoriyse kaldırır, değilse ekler — yıldız butonları için tek çağrı. */
  toggleFavorite: (input: NewFavoriteInput) => Promise<void>
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null)

// Giriş yapmamış (misafir) kullanıcıların favorileri tarayıcıda saklanır,
// böylece hesap açmadan da favori özelliklerini kullanabilir ve
// siteye tekrar geldiklerinde favorileri kaybolmaz.
const GUEST_STORAGE_KEY = "ed-guest-favorites"

function readGuestFavorites(): FavoriteItem[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(GUEST_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as FavoriteItem[]
  } catch {
    return []
  }
}

function writeGuestFavorites(items: FavoriteItem[]) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(items))
  } catch {
    // sessizce geç (örn. localStorage dolu/kapalı)
  }
}

function clearGuestFavorites() {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(GUEST_STORAGE_KEY)
  } catch {
    // sessizce geç
  }
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { data: session, isPending: sessionPending } = useSession()
  const [favorites, setFavorites] = useState<FavoriteItem[]>([])
  const [loading, setLoading] = useState(false)

  // Misafirken eklenen favorileri, kullanıcı giriş yaptığında hesabına
  // bir defaya mahsus taşımak için hangi kullanıcıya taşındığını tutar.
  const mergedForUserRef = useRef<string | null>(null)

  useEffect(() => {
    // Session durumu netleşene kadar bekle — aksi halde login/logout anında
    // yanlış (bir önceki duruma ait) liste kısa süreliğine görünebilir.
    if (sessionPending) return

    const userId = session?.user?.id ?? null
    if (!userId) {
      setFavorites(readGuestFavorites())
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    async function loadAndMerge() {
      const guestItems = readGuestFavorites()
      if (guestItems.length > 0 && mergedForUserRef.current !== userId) {
        mergedForUserRef.current = userId
        for (const item of guestItems) {
          try {
            await addFavoriteAction({
              type: item.type,
              itemId: item.itemId,
              name: item.name,
              logo: item.logo,
              country: item.country,
              flagUrl: item.flagUrl,
            })
          } catch {
            // sessizce geç — o favori zaten kayıtlıysa veya hata olursa devam et
          }
        }
        clearGuestFavorites()
      }

      try {
        const data = await getFavorites()
        if (!cancelled) setFavorites(data)
      } catch {
        if (!cancelled) setFavorites([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadAndMerge()
    return () => {
      cancelled = true
    }
  }, [session?.user, sessionPending])

  const isGuest = !session?.user

  const addFavorite = useCallback(
    async (input: NewFavoriteInput) => {
      if (isGuest) {
        setFavorites((prev) => {
          if (prev.some((f) => f.type === input.type && f.itemId === input.itemId)) return prev
          const nextPosition = prev.length > 0 ? prev[prev.length - 1].position + 1 : 0
          const next: FavoriteItem[] = [
            ...prev,
            {
              id: crypto.randomUUID(),
              type: input.type,
              itemId: input.itemId,
              name: input.name,
              logo: input.logo,
              country: input.country,
              flagUrl: input.flagUrl,
              position: nextPosition,
            },
          ]
          writeGuestFavorites(next)
          return next
        })
        return
      }
      try {
        const updated = await addFavoriteAction(input)
        setFavorites(updated)
      } catch {
        // sessizce geç
      }
    },
    [isGuest],
  )

  const removeFavorite = useCallback(
    async (id: string) => {
      if (isGuest) {
        setFavorites((prev) => {
          const next = prev.filter((f) => f.id !== id)
          writeGuestFavorites(next)
          return next
        })
        return
      }
      // Optimistic: hemen listeden çıkar
      setFavorites((prev) => prev.filter((f) => f.id !== id))
      try {
        const updated = await removeFavoriteAction(id)
        setFavorites(updated)
      } catch {
        // sessizce geç
      }
    },
    [isGuest],
  )

  const reorderFavorites = useCallback(
    async (orderedIds: string[]) => {
      if (isGuest) {
        setFavorites((prev) => {
          const byId = new Map(prev.map((f) => [f.id, f]))
          const next = orderedIds
            .map((id, index) => {
              const item = byId.get(id)
              return item ? { ...item, position: index } : null
            })
            .filter((f): f is FavoriteItem => f !== null)
          writeGuestFavorites(next)
          return next
        })
        return
      }
      // Optimistic: yeni sırayı hemen uygula
      setFavorites((prev) => {
        const byId = new Map(prev.map((f) => [f.id, f]))
        return orderedIds
          .map((id, index) => {
            const item = byId.get(id)
            return item ? { ...item, position: index } : null
          })
          .filter((f): f is FavoriteItem => f !== null)
      })
      try {
        const updated = await reorderFavoritesAction(orderedIds)
        setFavorites(updated)
      } catch {
        // sessizce geç
      }
    },
    [isGuest],
  )

  const isFavorite = useCallback(
    (type: "team" | "league", itemId: number) => favorites.some((f) => f.type === type && f.itemId === itemId),
    [favorites],
  )

  const toggleFavorite = useCallback(
    async (input: NewFavoriteInput) => {
      const existing = favorites.find((f) => f.type === input.type && f.itemId === input.itemId)
      if (existing) {
        await removeFavorite(existing.id)
      } else {
        await addFavorite(input)
      }
    },
    [favorites, addFavorite, removeFavorite],
  )

  return (
    <FavoritesContext.Provider
      value={{ favorites, loading, addFavorite, removeFavorite, reorderFavorites, isFavorite, toggleFavorite }}
    >
      {children}
    </FavoritesContext.Provider>
  )
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext)
  if (!ctx) throw new Error("useFavorites must be used within FavoritesProvider")
  return ctx
}
