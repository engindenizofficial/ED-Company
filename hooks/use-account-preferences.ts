"use client"

import { useCallback } from "react"
import useSWR from "swr"
import {
  getAccountPreferences,
  updateAccountPreferences,
  type AccountPreferences,
} from "@/app/actions/account"
import { useSession } from "@/lib/auth-client"

export type AccountPreferencesPatch = Partial<
  Pick<AccountPreferences, "themeColor" | "locale" | "notificationsEnabled">
>

export function useAccountPreferences() {
  const { data: session, isPending: sessionPending } = useSession()
  const key = session?.user ? `account-preferences:${session.user.id}` : null
  const { data, error, isLoading, mutate } = useSWR<AccountPreferences>(key, getAccountPreferences, {
    revalidateOnFocus: false,
  })

  const update = useCallback(
    async (patch: AccountPreferencesPatch) => {
      if (!key) return
      await mutate(
        async (current) => {
          await updateAccountPreferences(patch)
          return {
            themeColor: current?.themeColor ?? "green",
            locale: current?.locale ?? "tr",
            notificationsEnabled: current?.notificationsEnabled ?? false,
            ...patch,
            exists: true,
          }
        },
        {
          optimisticData: (current) => ({
            themeColor: current?.themeColor ?? "green",
            locale: current?.locale ?? "tr",
            notificationsEnabled: current?.notificationsEnabled ?? false,
            ...patch,
            exists: true,
          }),
          rollbackOnError: true,
          revalidate: false,
        },
      )
    },
    [key, mutate],
  )

  return {
    preferences: data,
    error,
    isLoading: sessionPending || isLoading,
    isSignedIn: Boolean(session?.user),
    update,
  }
}
