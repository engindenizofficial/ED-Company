"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
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
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null)

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const [favorites, setFavorites] = useState<FavoriteItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!session?.user) {
      setFavorites([])
      return
    }
    let cancelled = false
    setLoading(true)
    getFavorites()
      .then((data) => {
        if (!cancelled) setFavorites(data)
      })
      .catch(() => {
        if (!cancelled) setFavorites([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [session?.user])

  const addFavorite = useCallback(async (input: NewFavoriteInput) => {
    try {
      const updated = await addFavoriteAction(input)
      setFavorites(updated)
    } catch {
      // sessizce geç
    }
  }, [])

  const removeFavorite = useCallback(async (id: string) => {
    // Optimistic: hemen listeden çıkar
    setFavorites((prev) => prev.filter((f) => f.id !== id))
    try {
      const updated = await removeFavoriteAction(id)
      setFavorites(updated)
    } catch {
      // sessizce geç
    }
  }, [])

  const reorderFavorites = useCallback(async (orderedIds: string[]) => {
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
  }, [])

  const isFavorite = useCallback(
    (type: "team" | "league", itemId: number) => favorites.some((f) => f.type === type && f.itemId === itemId),
    [favorites],
  )

  return (
    <FavoritesContext.Provider
      value={{ favorites, loading, addFavorite, removeFavorite, reorderFavorites, isFavorite }}
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
