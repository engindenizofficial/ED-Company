"use client"

import { useState } from "react"
import { UserRound } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Oyuncu profil fotoğrafını gösterir; API'den gelen `photo` alanı dolu olsa
 * bile görsel yüklenemezse (404, bozuk URL, hotlink engeli vb.) otomatik
 * olarak ikon içeren bir placeholder'a düşer. Bu component, "fotoğrafı olan
 * bir oyuncunun profil fotoğrafının boş gözükmesi" sorununu tüm kullanım
 * yerlerinde tek bir noktadan çözer.
 */
export function PlayerPhoto({
  photo,
  name,
  size = 24,
  rounded = "full",
  className,
  iconClassName,
}: {
  photo: string | null | undefined
  name?: string
  size?: number
  rounded?: "full" | "2xl"
  className?: string
  iconClassName?: string
}) {
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(photo) && !failed
  const roundedClass = rounded === "full" ? "rounded-full" : "rounded-2xl"

  if (showImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo as string}
        alt={name ?? ""}
        className={cn(roundedClass, "border border-border object-cover shrink-0", className)}
        style={{ width: size, height: size }}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <div
      className={cn(
        roundedClass,
        "flex shrink-0 items-center justify-center border border-border bg-secondary",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <UserRound
        className={cn("text-muted-foreground", iconClassName)}
        style={{ width: size * 0.45, height: size * 0.45 }}
      />
    </div>
  )
}
