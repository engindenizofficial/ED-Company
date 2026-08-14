import { cn } from "@/lib/utils"
import { useLanguage } from "@/contexts/language-context"

export function FormBadge({ form }: { form: string }) {
  const { t } = useLanguage()

  if (!form) {
    return <span className="text-xs text-muted-foreground">{t("formBadge.noData")}</span>
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
          title={r === "W" ? t("formBadge.win") : r === "D" ? t("formBadge.draw") : t("formBadge.loss")}
        >
          {r === "W" ? t("formBadge.winLetter") : r === "D" ? t("formBadge.drawLetter") : t("formBadge.lossLetter")}
        </span>
      ))}
    </div>
  )
}
