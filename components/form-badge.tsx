import { cn } from "@/lib/utils"

export function FormBadge({ form }: { form: string }) {
  if (!form) {
    return <span className="text-xs text-muted-foreground">Veri yok</span>
  }
  return (
    <div className="flex items-center gap-1">
      {form.split("").map((r, i) => (
        <span
          key={i}
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold",
            r === "W" && "bg-primary text-primary-foreground",
            r === "D" && "bg-muted text-muted-foreground",
            r === "L" && "bg-destructive text-primary-foreground",
          )}
          title={r === "W" ? "Galibiyet" : r === "D" ? "Beraberlik" : "Mağlubiyet"}
        >
          {r === "W" ? "G" : r === "D" ? "B" : "M"}
        </span>
      ))}
    </div>
  )
}
