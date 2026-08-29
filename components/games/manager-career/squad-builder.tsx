"use client"

import { useEffect, useMemo, useState } from "react"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { ChevronLeft, Loader2, Plus, X } from "lucide-react"
import { toast } from "sonner"
import { useLanguage } from "@/contexts/language-context"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { formatMarketValueEur } from "@/lib/market-value-format"
import {
  BENCH_SIZE,
  DEFAULT_FORMATION_ID,
  FORMATIONS,
  getFormationSlots,
  type FormationSlot,
  type PlayerRole,
} from "@/lib/games/manager-career"
import { PlayerSearchDialog } from "@/components/games/manager-career/player-search-dialog"
import { PowerBadge } from "@/components/games/manager-career/power-badge"
import type { ManagerPlayerSearchResult } from "@/app/api/games/manager-career/players/search/route"
import type { SquadPlayerInput } from "@/app/actions/manager-career"
import { cn } from "@/lib/utils"
import { ratingAtPosition, positionLabel, type PositionProfile } from "@/lib/player-positions"

export interface SquadEntry {
  playerId: number
  playerName: string
  photo: string | null
  teamName: string | null
  teamLogo: string | null
  role: PlayerRole
  priceEur: number
  /** Oyuncu güç motorunun ürettiği 1-99 puan (bkz. lib/player-power.ts) — sadece gösterim amaçlı, kadroya kaydedilmez. */
  power: number | null
  /** Harici veri sağlayıcısından alınan alt mevki profili — slota göre reyting düşürmek için kullanılır. */
  position: PositionProfile | null
}

export interface SquadCompletionPayload {
  formation: string
  squad: SquadPlayerInput[]
}

interface SquadBuilderProps {
  totalBudgetEur: number
  onBack: () => void
  onComplete: (payload: SquadCompletionPayload) => void
  submitting: boolean
}

const ROLE_LABEL_KEY: Record<PlayerRole, string> = {
  Goalkeeper: "goalkeeper",
  Defender: "defender",
  Midfielder: "midfielder",
  Attacker: "attacker",
}

const ROLE_ABBR: Record<PlayerRole, string> = {
  Goalkeeper: "GK",
  Defender: "DEF",
  Midfielder: "MID",
  Attacker: "FWD",
}

type SearchTarget = { kind: "starting"; slot: FormationSlot } | { kind: "bench"; index: number }

type SlotId = { kind: "starting"; key: string } | { kind: "bench"; index: number }

const STARTING_ID_PREFIX = "starting__"
const BENCH_ID_PREFIX = "bench__"

function startingSlotId(key: string): string {
  return `${STARTING_ID_PREFIX}${key}`
}

function benchSlotId(index: number): string {
  return `${BENCH_ID_PREFIX}${index}`
}

function parseSlotId(id: string): SlotId {
  if (id.startsWith(STARTING_ID_PREFIX)) {
    return { kind: "starting", key: id.slice(STARTING_ID_PREFIX.length) }
  }
  return { kind: "bench", index: Number(id.slice(BENCH_ID_PREFIX.length)) }
}

export function SquadBuilder({ totalBudgetEur, onBack, onComplete, submitting }: SquadBuilderProps) {
  const { t, locale } = useLanguage()

  const [formation, setFormation] = useState(DEFAULT_FORMATION_ID)
  const [starting, setStarting] = useState<Record<string, SquadEntry>>({})
  const [bench, setBench] = useState<(SquadEntry | null)[]>(Array(BENCH_SIZE).fill(null))
  const [searchTarget, setSearchTarget] = useState<SearchTarget | null>(null)
  const [pendingFormation, setPendingFormation] = useState<string | null>(null)
  const [draggingEntry, setDraggingEntry] = useState<SquadEntry | null>(null)

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const slots = useMemo(() => getFormationSlots(formation), [formation])

  const spentEur = useMemo(() => {
    const startingSum = Object.values(starting).reduce((sum, e) => sum + e.priceEur, 0)
    const benchSum = bench.reduce((sum, e) => sum + (e?.priceEur ?? 0), 0)
    return startingSum + benchSum
  }, [starting, bench])

  const remainingEur = totalBudgetEur - spentEur
  const spentPercent = totalBudgetEur > 0 ? Math.min(100, (spentEur / totalBudgetEur) * 100) : 0

  const excludePlayerIds = useMemo(() => {
    const ids = new Set<number>()
    Object.values(starting).forEach((e) => ids.add(e.playerId))
    bench.forEach((e) => e && ids.add(e.playerId))
    return ids
  }, [starting, bench])

  const startingFilledCount = Object.keys(starting).length
  const benchFilledCount = bench.filter((e) => e !== null).length
  const isComplete = startingFilledCount === slots.length && benchFilledCount === BENCH_SIZE

  function handleFormationSelect(nextFormationId: string | null) {
    if (!nextFormationId || nextFormationId === formation) return
    if (Object.keys(starting).length > 0) {
      setPendingFormation(nextFormationId)
    } else {
      setFormation(nextFormationId)
    }
  }

  function confirmFormationChange() {
    if (!pendingFormation) return
    setFormation(pendingFormation)
    setStarting({})
    setPendingFormation(null)
  }

  function handleSelectPlayer(result: ManagerPlayerSearchResult) {
    if (!searchTarget) return
    const entry: SquadEntry = {
      playerId: result.id,
      playerName: result.name,
      photo: result.photo,
      teamName: result.teamName,
      teamLogo: result.teamLogo,
      role: result.role,
      priceEur: result.priceEur,
      power: result.power,
      position: result.position,
    }
    if (searchTarget.kind === "starting") {
      setStarting((prev) => ({ ...prev, [searchTarget.slot.key]: entry }))
    } else {
      setBench((prev) => {
        const next = [...prev]
        next[searchTarget.index] = entry
        return next
      })
    }
    setSearchTarget(null)
  }

  function handleRemoveStarting(slotKey: string) {
    setStarting((prev) => {
      const next = { ...prev }
      delete next[slotKey]
      return next
    })
  }

  function handleRemoveBench(index: number) {
    setBench((prev) => {
      const next = [...prev]
      next[index] = null
      return next
    })
  }

  function handleDragStart(event: DragStartEvent) {
    const source = parseSlotId(String(event.active.id))
    const entry = source.kind === "starting" ? starting[source.key] : bench[source.index]
    setDraggingEntry(entry ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingEntry(null)
    const { active, over } = event
    if (!over) return

    const sourceId = String(active.id)
    const targetId = String(over.id)
    if (sourceId === targetId) return

    const source = parseSlotId(sourceId)
    const target = parseSlotId(targetId)

    const sourceEntry = source.kind === "starting" ? starting[source.key] : bench[source.index]
    const targetEntry = target.kind === "starting" ? starting[target.key] : bench[target.index]
    if (!sourceEntry) return

    if (source.kind === "starting" && target.kind === "starting") {
      setStarting((prev) => {
        const next = { ...prev }
        if (targetEntry) next[source.key] = targetEntry
        else delete next[source.key]
        next[target.key] = sourceEntry
        return next
      })
    } else if (source.kind === "bench" && target.kind === "bench") {
      setBench((prev) => {
        const next = [...prev]
        next[source.index] = targetEntry ?? null
        next[target.index] = sourceEntry
        return next
      })
    } else if (source.kind === "starting" && target.kind === "bench") {
      setStarting((prev) => {
        const next = { ...prev }
        if (targetEntry) next[source.key] = targetEntry
        else delete next[source.key]
        return next
      })
      setBench((prev) => {
        const next = [...prev]
        next[target.index] = sourceEntry
        return next
      })
    } else if (source.kind === "bench" && target.kind === "starting") {
      setBench((prev) => {
        const next = [...prev]
        next[source.index] = targetEntry ?? null
        return next
      })
      setStarting((prev) => ({ ...prev, [target.key]: sourceEntry }))
    }
  }

  function handleCompleteClick() {
    if (!isComplete) {
      const emptyCount = slots.length - startingFilledCount + (BENCH_SIZE - benchFilledCount)
      toast.error(t("managerCareer.squadIncomplete", { count: emptyCount }))
      return
    }

    const squad: SquadPlayerInput[] = [
      ...slots.map((slot) => {
        const entry = starting[slot.key]
        return {
          playerId: entry.playerId,
          playerName: entry.playerName,
          photo: entry.photo,
          realTeamName: entry.teamName,
          realTeamLogo: entry.teamLogo,
          role: entry.role,
          clientPriceEur: entry.priceEur,
          slot: { kind: "starting" as const, slotKey: slot.key },
        }
      }),
      ...bench.map((entry, index) => ({
        playerId: entry!.playerId,
        playerName: entry!.playerName,
        photo: entry!.photo,
        realTeamName: entry!.teamName,
        realTeamLogo: entry!.teamLogo,
        role: entry!.role,
        clientPriceEur: entry!.priceEur,
        slot: { kind: "bench" as const, benchIndex: index },
      })),
    ]

    onComplete({ formation, squad })
  }

  const searchDialogOpen = searchTarget !== null
  const searchRole = searchTarget?.kind === "starting" ? searchTarget.slot.role : null

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-bold text-foreground">{t("managerCareer.squadStepTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("managerCareer.squadStepDesc")}</p>
      </div>

      {/* Diziliş seçimi + bütçe özeti */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">{t("managerCareer.formationLabel")}</span>
          <Select value={formation} onValueChange={handleFormationSelect}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORMATIONS.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1 sm:w-64">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t("managerCareer.budgetRemaining")}</span>
            <span className={cn("font-bold tabular-nums", remainingEur < 0 ? "text-destructive" : "text-emerald-500")}>
              {formatMarketValueEur(remainingEur, locale) ?? "€0"}
            </span>
          </div>
          <Progress value={spentPercent} />
        </div>
      </div>

      <DndContext sensors={dndSensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {/* Yarı saha */}
        <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-2xl border-2 border-white/25 bg-[repeating-linear-gradient(180deg,oklch(0.42_0.09_150)_0%,oklch(0.42_0.09_150)_10%,oklch(0.38_0.09_150)_10%,oklch(0.38_0.09_150)_20%)]">
          {/* orta hat çizgisi (üst kenar) */}
          <div className="absolute inset-x-0 top-0 h-[2px] bg-white/40" />
          {/* orta yuvarlağın alt yarısı */}
          <div className="absolute left-1/2 top-0 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/30" />
          {/* ceza sahası (alt kenar, kale çizgisine yakın) */}
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
            <div className="h-[22%] w-[62%] border-2 border-b-0 border-white/30" />
          </div>
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
            <div className="h-[9%] w-[32%] border-2 border-b-0 border-white/30" />
          </div>
          {/* kale çizgisi */}
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/50" />

          {slots.map((slot) => (
            <PitchSlot
              key={slot.key}
              slot={slot}
              entry={starting[slot.key]}
              onOpen={() => setSearchTarget({ kind: "starting", slot })}
              onRemove={() => handleRemoveStarting(slot.key)}
            />
          ))}
        </div>

        {/* Yedekler */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">{t("managerCareer.benchTitle")}</span>
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">
              {t("managerCareer.benchCount", { filled: benchFilledCount, total: BENCH_SIZE })}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {bench.map((entry, index) => (
              <BenchSlot
                key={index}
                index={index}
                entry={entry}
                onOpen={() => setSearchTarget({ kind: "bench", index })}
                onRemove={() => handleRemoveBench(index)}
              />
            ))}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {draggingEntry ? <DraggedPlayerPreview entry={draggingEntry} /> : null}
        </DragOverlay>
      </DndContext>

      <div className="flex items-center justify-between border-t border-border/60 pt-4">
        <Button variant="outline" onClick={onBack} disabled={submitting}>
          <ChevronLeft className="h-4 w-4" data-icon="inline-start" />
          {t("managerCareer.back")}
        </Button>
        <Button onClick={handleCompleteClick} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-600/90">
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" data-icon="inline-start" />
              {t("managerCareer.creatingCareer")}
            </>
          ) : (
            t("managerCareer.completeSquad")
          )}
        </Button>
      </div>

      <PlayerSearchDialog
        open={searchDialogOpen}
        onOpenChange={(o) => !o && setSearchTarget(null)}
        role={searchRole}
        targetPosition={searchTarget?.kind === "starting" ? searchTarget.slot.position : null}
        budgetRemainingEur={remainingEur}
        excludePlayerIds={excludePlayerIds}
        onSelect={handleSelectPlayer}
      />

      <AlertDialog open={pendingFormation !== null} onOpenChange={(o) => !o && setPendingFormation(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("managerCareer.formationLabel")}</AlertDialogTitle>
            <AlertDialogDescription>{t("managerCareer.squadStepDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmFormationChange}>{t("common.confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/**
 * Kadro oluşturucudaki dairesel oyuncu avatarı — fotoğraf URL'i geçersiz/bozuksa
 * (404, hotlink engeli vb.) otomatik olarak isim baş harfine düşer.
 */
function SquadAvatar({ photo, name }: { photo: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  if (photo && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photo} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
    )
  }
  return <span className="text-xs font-bold text-neutral-900">{name.charAt(0)}</span>
}

function PitchSlot({
  slot,
  entry,
  onOpen,
  onRemove,
}: {
  slot: FormationSlot
  entry?: SquadEntry
  onOpen: () => void
  onRemove: () => void
}) {
  const { t } = useLanguage()
  const id = startingSlotId(slot.key)
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id })
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id, disabled: !entry })

  // Slota göre uyarlanmış reyting: oyuncunun mevkisi bu slotla tam uyuşmuyorsa
  // (örn. bir stoper orta sahaya konursa) gösterilen puan gerçekten düşer —
  // bkz. lib/player-positions.ts ratingAtPosition()/fit().
  const displayedPower = entry && entry.power !== null ? ratingAtPosition(entry.power, entry.position, slot.position) : entry?.power ?? null

  return (
    <div
      ref={setDropRef}
      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
      style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
    >
      <span
        title={positionLabel(slot.position)}
        className="rounded bg-black/60 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white/90"
      >
        {slot.position}
      </span>
      {entry ? (
        <div className={cn("relative flex flex-col items-center gap-1", isDragging && "opacity-30")}>
          <button
            ref={setDragRef}
            {...listeners}
            {...attributes}
            type="button"
            onClick={onOpen}
            className={cn(
              "flex h-11 w-11 cursor-grab touch-none items-center justify-center overflow-hidden rounded-full border-2 bg-white shadow-md active:cursor-grabbing sm:h-13 sm:w-13",
              isOver ? "border-primary" : "border-white",
            )}
          >
            <SquadAvatar photo={entry.photo} name={entry.playerName} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            aria-label={t("managerCareer.removePlayerAria", { name: entry.playerName })}
            className="absolute -right-1 -top-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow"
          >
            <X className="h-2.5 w-2.5" />
          </button>
          <div className="flex max-w-20 items-center gap-1 rounded bg-black/70 px-1 py-0.5">
            <span className="min-w-0 truncate text-[9px] font-semibold text-white">{entry.playerName}</span>
            <PowerBadge power={displayedPower} />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          aria-label={t("managerCareer.emptySlot")}
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed text-white transition-colors sm:h-13 sm:w-13",
            isOver ? "border-primary bg-primary/20" : "border-white/70 bg-white/10 hover:bg-white/20",
          )}
        >
          <Plus className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

function DraggedPlayerPreview({ entry }: { entry: SquadEntry }) {
  return (
    <div className="flex h-11 w-11 cursor-grabbing items-center justify-center overflow-hidden rounded-full border-2 border-primary bg-white shadow-lg">
      <SquadAvatar photo={entry.photo} name={entry.playerName} />
    </div>
  )
}

function BenchSlot({
  index,
  entry,
  onOpen,
  onRemove,
}: {
  index: number
  entry: SquadEntry | null
  onOpen: () => void
  onRemove: () => void
}) {
  const { t } = useLanguage()
  const id = benchSlotId(index)
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id })
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id, disabled: !entry })

  if (!entry) {
    return (
      <button
        ref={setDropRef}
        type="button"
        onClick={onOpen}
        aria-label={t("managerCareer.emptyBenchSlot")}
        className={cn(
          "flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-muted-foreground transition-colors",
          isOver ? "border-primary bg-primary/10" : "border-border/60 bg-card hover:border-border",
        )}
      >
        <Plus className="h-4 w-4" />
      </button>
    )
  }

  return (
    <div
      ref={setDropRef}
      className={cn(
        "relative flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border p-1.5",
        isDragging && "opacity-30",
        isOver ? "border-primary bg-primary/5" : "border-border/60 bg-card",
      )}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        aria-label={t("managerCareer.removePlayerAria", { name: entry.playerName })}
        className="absolute -right-1.5 -top-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow"
      >
        <X className="h-2.5 w-2.5" />
      </button>
      <div>
        <button
          ref={setDragRef}
          {...listeners}
          {...attributes}
          type="button"
          onClick={onOpen}
          className="flex h-9 w-9 cursor-grab touch-none items-center justify-center overflow-hidden rounded-full bg-secondary active:cursor-grabbing"
        >
          <SquadAvatar photo={entry.photo} name={entry.playerName} />
        </button>
      </div>
      <div className="flex max-w-full items-center gap-1">
        <span className="truncate text-[9px] font-semibold text-foreground">{entry.playerName}</span>
        <PowerBadge power={entry.power} />
      </div>
      <span
        title={entry.position?.primary ? positionLabel(entry.position.primary) : undefined}
        className="text-[8px] font-bold uppercase tracking-wide text-muted-foreground"
      >
        {entry.position?.primary ?? ROLE_ABBR[entry.role]}
      </span>
    </div>
  )
}
