"use client"

import { useEffect, useRef, useState } from "react"
import { motion } from "motion/react"
import { getTeamAccentColor } from "@/lib/team-color"
import { useLanguage } from "@/contexts/language-context"
import { clearStoredScore, readStoredScore, writeStoredScore } from "@/lib/goal-catchup-storage"

/** Bir maçta gol olduğunda 5 saniyeliğine gösterilecek kutlama kuyruğunu
 * yönetir. Aynı anda hem ev hem konuk gol atarsa (nadir de olsa), ikisi üst
 * üste binmeden sırayla gösterilir. Hem ana sayfadaki maç kartında
 * (fixture-list.tsx) hem de maç panelinin başlığında (analysis-panel.tsx)
 * kullanılır.
 *
 * "Geri dönüşte kaçırılan golü yakala" özelliği (sadece ana ekran):
 * fixtureId ve isLive parametreleri verilirse (fixture-list.tsx), bu hook
 * ayrıca kullanıcının bu maçta EN SON GÖRDÜĞÜ skoru localStorage'a yazar.
 * Kullanıcı siteyi kapatıp/yeniden yükleyip (React state sıfırlanır) ya da
 * sekmeyi arka plana alıp (state sıfırlanmaz ama veri güncellenmez) geri
 * döndüğünde, kaçırdığı skor farkı TAM OLARAK 1 golse o golün kutlamasını
 * gösterir; 2+ golse (birden fazla golü kaçırmışsa) hiçbir animasyon
 * göstermeden sessizce günceller; maç zaten bittiyse hiç göstermez. Bu iki
 * parametre verilmezse (analysis-panel.tsx) davranış tamamen eskisi gibi
 * kalır — hiçbir yakalama yapılmaz. */
let celebrationKeySeq = 0

export function useGoalCelebrationQueue(
  goalsHome: number | null,
  goalsAway: number | null,
  fixtureIdForCatchUp?: number,
  isLive?: boolean,
) {
  const prevRef = useRef<{ home: number | null; away: number | null }>({
    home: goalsHome,
    away: goalsAway,
  })
  const [queue, setQueue] = useState<Array<{ team: "home" | "away"; key: number; goalCount: number }>>([])
  const hydratedFromStorageRef = useRef(false)
  // Sekme arka plandayken (visibilitychange: hidden) true olur; sekme geri
  // görünür olduktan sonraki İLK gerçek skor değişikliğinde tüketilip false'a
  // döner. Bu sayede "arka planda tam olarak ne kadar zaman/veri geçti"
  // bilmemize gerek kalmaz — sadece "en son değişiklik bir gizli dönem sonrası
  // mı geldi" sorusuna bakarız.
  const wasHiddenRef = useRef(false)

  // Sayfa/kart yeniden yüklendiğinde (mount) React state'i sıfırlanır; bu
  // durumda "geri dönüş" bilgisini sadece localStorage'dan alabiliriz.
  useEffect(() => {
    if (fixtureIdForCatchUp === undefined || hydratedFromStorageRef.current) return

    if (isLive === false) {
      // Maç canlı değilse (henüz başlamadı ya da zaten bitti), kayıtlı eski
      // skor artık anlamsız ve hiçbir zaman gösterilmemeli.
      clearStoredScore(fixtureIdForCatchUp)
      hydratedFromStorageRef.current = true
      return
    }

    if (goalsHome === null || goalsAway === null) return // veri henüz gelmedi, bekle

    hydratedFromStorageRef.current = true
    const stored = readStoredScore(fixtureIdForCatchUp)
    if (stored) {
      const totalDiff = goalsHome + goalsAway - (stored.home + stored.away)
      if (totalDiff === 1) {
        if (goalsHome > stored.home) {
          setQueue((q) => [...q, { team: "home", key: celebrationKeySeq++, goalCount: goalsHome }])
        } else if (goalsAway > stored.away) {
          setQueue((q) => [...q, { team: "away", key: celebrationKeySeq++, goalCount: goalsAway }])
        }
      }
      // totalDiff === 0: kaçırılan bir şey yok. totalDiff >= 2: birden fazla
      // gol kaçırılmış, kasıtlı olarak hiçbir animasyon gösterilmiyor.
    }
    writeStoredScore(fixtureIdForCatchUp, goalsHome, goalsAway)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixtureIdForCatchUp, isLive, goalsHome, goalsAway])

  // Maç, sayfa açıkken bitti bilgisi geldiği an kaydı sil — kullanıcı bir
  // dahaki girişinde (maç bitmiş haldeyken) hiçbir şey görmemeli.
  useEffect(() => {
    if (fixtureIdForCatchUp === undefined) return
    if (isLive === false) clearStoredScore(fixtureIdForCatchUp)
  }, [fixtureIdForCatchUp, isLive])

  // Sekme görünürlüğünü izler: sekme gizlenirken bayrağı kaldırır, böylece
  // görünür olduktan sonraki ilk gerçek skor güncellemesi "geri dönüş"
  // kurallarıyla (fark tam 1 ise göster, 2+ ise gösterme) değerlendirilir.
  useEffect(() => {
    if (fixtureIdForCatchUp === undefined) return
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        wasHiddenRef.current = true
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [fixtureIdForCatchUp])

  useEffect(() => {
    const prev = prevRef.current
    const additions: Array<{ team: "home" | "away"; key: number; goalCount: number }> = []
    const returningFromBackground = wasHiddenRef.current
    wasHiddenRef.current = false

    // goalCount, o kutlamanın tam olarak takımın KAÇINCI golü olduğunu
    // taşır (ör. A takımının 2. golü -> goalCount: 2). Overlay bu sayıyı
    // events listesindeki index olarak kullanıp doğru golcüyü seçiyor;
    // "en son gelen gol" gibi kayabilen bir varsayıma dayanmıyor.
    if (prev.home !== null && prev.away !== null && goalsHome !== null && goalsAway !== null) {
      if (returningFromBackground) {
        // Sekme arka plandayken kaçırılan gol(ler): sadece toplam fark tam
        // olarak 1 ise göster, 2+ ise sessizce güncelle.
        const totalDiff = goalsHome + goalsAway - (prev.home + prev.away)
        if (totalDiff === 1) {
          if (goalsHome > prev.home) {
            additions.push({ team: "home", key: celebrationKeySeq++, goalCount: goalsHome })
          } else if (goalsAway > prev.away) {
            additions.push({ team: "away", key: celebrationKeySeq++, goalCount: goalsAway })
          }
        }
      } else {
        // Normal, canlı canlı izlenen akış: her artışı anında göster.
        if (goalsHome > prev.home) {
          additions.push({ team: "home", key: celebrationKeySeq++, goalCount: goalsHome })
        }
        if (goalsAway > prev.away) {
          additions.push({ team: "away", key: celebrationKeySeq++, goalCount: goalsAway })
        }
      }
    }
    if (additions.length > 0) {
      setQueue((q) => [...q, ...additions])
    }
    prevRef.current = { home: goalsHome, away: goalsAway }

    if (fixtureIdForCatchUp !== undefined && isLive !== false && goalsHome !== null && goalsAway !== null) {
      writeStoredScore(fixtureIdForCatchUp, goalsHome, goalsAway)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalsHome, goalsAway])

  const current = queue[0] ?? null
  const advance = () => setQueue((q) => q.slice(1))

  return { current, currentKey: current?.key ?? null, advance }
}

// Tam 5 saniyelik, sadece ilgili maç kartını kaplayan gol kutlama animasyonu.
// Tam ekran DEĞİL — kartın kendi rounded-xl sınırları içinde kalır. Kart
// genelde geniş ve alçak (yatay) olduğu için içerik de yatay bir şerit
// düzeninde kuruludur: sol tarafta takım logosu, ortada "GOL!" + takım adı,
// sağ tarafta (bulunabilirse) golü atan oyuncunun fotoğrafı ve adı. Takıma
// özgü his, logodan otomatik çıkarılan baskın renkten (lib/team-color.ts)
// geliyor; elle hiçbir takım için renk tanımlamadan her takım kendi rengini
// alıyor.
const DURATION_MS = 5000
const PARTICLE_COUNT = 26

interface Scorer {
  name: string
  photoUrl: string | null
}

interface GoalCelebrationOverlayProps {
  fixtureId: number
  teamName: string
  teamLogo: string
  /** Bu kutlamanın takımın kaçıncı golü olduğu (1 = ilk gol, 2 = ikinci gol...).
   * Golcüyü "events listesindeki en son gol" gibi kayabilen bir varsayımla
   * değil, doğrudan bu index ile seçmek için kullanılır. */
  goalCount: number
  onDone: () => void
}

export function GoalCelebrationOverlay({ fixtureId, teamName, teamLogo, goalCount, onDone }: GoalCelebrationOverlayProps) {
  const { t } = useLanguage()
  const [color, setColor] = useState("hsl(var(--primary))")
  const [scorer, setScorer] = useState<Scorer | null>(null)

  useEffect(() => {
    let active = true
    getTeamAccentColor(teamLogo).then((resolved) => {
      if (active) setColor(resolved)
    })
    return () => {
      active = false
    }
  }, [teamLogo])

  useEffect(() => {
    let active = true
    let cancelled = false

    // Events endpoint'i (dış API + kendi cache'imiz) bazen bu golü henüz
    // içermeyebilir. "Elimizdeki listenin en sonuncusu" varsayımı YANLIŞ
    // golcüyü gösterebiliyordu (ör. 2. gol için hâlâ 1. golün oyuncusu
    // görünüyordu). Bunun yerine bu kutlamanın TAM OLARAK kaçıncı gol
    // olduğunu (goalCount) index olarak kullanıyoruz; veri henüz o index'e
    // ulaşmadıysa kısa aralıklarla birkaç kez yeniden deniyoruz.
    const attempt = (retriesLeft: number) => {
      fetch(`/api/fixtures/${fixtureId}/goal-scorer`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { goals?: Array<{ team: string; player: string | null; playerId: number | null }> } | null) => {
          if (!active || cancelled) return
          const teamGoals = data?.goals?.filter((g) => g.team === teamName && g.player) ?? []
          const target = teamGoals[goalCount - 1]
          if (target?.player) {
            setScorer({
              name: target.player,
              photoUrl: target.playerId
                ? `https://media.api-sports.io/football/players/${target.playerId}.png`
                : null,
            })
            return
          }
          if (retriesLeft > 0) {
            setTimeout(() => {
              if (!cancelled) attempt(retriesLeft - 1)
            }, 1200)
          }
        })
        .catch(() => {})
    }

    attempt(3)

    return () => {
      active = false
      cancelled = true
    }
    // fixtureId, teamName ve goalCount bu overlay'in ömrü boyunca sabittir
    // (her gol için yeni bir key ile yeniden mount edilir), tek seferlik
    // deneme zinciri yeterli.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const timeout = setTimeout(onDone, DURATION_MS)
    return () => clearTimeout(timeout)
    // onDone kimliği her render'da değişmeyecek şekilde çağıran taraf useCallback
    // benzeri bir referansla veriyor; burada sadece ilk mount'ta zamanlayıcı kuruyoruz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Parçacıklar geniş/alçak kart alanına yayılacak şekilde daha çok yatayda,
  // az dikeyde saçılıyor (radyal patlama yerine yatay bir "şerit" hissi).
  const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const spread = (i / (PARTICLE_COUNT - 1)) * 2 - 1 // -1..1
    return {
      x: spread * 220 + (i % 2 === 0 ? -12 : 12),
      y: -18 - (i % 4) * 14,
      delay: (i % 8) * 0.05,
      size: 4 + (i % 3) * 2,
      driftX: spread * 60,
    }
  })

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="absolute inset-0 z-30 flex items-center overflow-hidden rounded-xl pointer-events-none"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    >
      {/* Metnin her renk üzerinde okunabilir kalması için karartma katmanı */}
      <div className="absolute inset-0 bg-black/35" />

      {/* Sol taraftan sağa kayan ışık huzmesi — "canlı yayın grafiği" hissi */}
      <motion.div
        className="absolute inset-y-0 w-1/3 skew-x-[-20deg] bg-white/15"
        initial={{ x: "-120%" }}
        animate={{ x: "320%" }}
        transition={{ duration: 1.4, ease: "easeInOut", delay: 0.15 }}
      />

      {particles.map((p, i) => (
        <motion.span
          key={i}
          className="absolute left-1/2 top-1/2 rounded-full bg-white"
          style={{ width: p.size, height: p.size }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
          animate={{ x: [0, p.driftX, p.x], y: [0, p.y, p.y + 46], opacity: [1, 1, 0], scale: [0, 1, 1] }}
          transition={{ duration: 1.3, delay: p.delay, ease: "easeOut" }}
        />
      ))}

      {/* Yatay içerik şeridi: logo — GOL!/takım adı — golcü */}
      <div className="relative z-10 flex w-full items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <motion.div
            initial={{ scale: 0, rotate: -18 }}
            animate={{ scale: [0, 1.2, 1], rotate: 0 }}
            transition={{ duration: 0.55, ease: "backOut" }}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white shadow-lg"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={teamLogo || "/placeholder.svg"} alt="" className="h-9 w-9 object-contain" />
          </motion.div>
          <div className="flex min-w-0 flex-col">
            <motion.span
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.35 }}
              className="text-base font-black uppercase leading-none tracking-wide text-white drop-shadow-sm"
            >
              {t("goalCelebration.title")}
            </motion.span>
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25, duration: 0.35 }}
              className="max-w-[160px] truncate text-xs font-semibold text-white/90"
            >
              {teamName}
            </motion.span>
          </div>
        </div>

        {/* Golcü bilgisi geldiğinde sağdan kayarak beliriyor */}
        {scorer ? (
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="flex min-w-0 shrink-0 items-center gap-2.5 rounded-full bg-black/25 pl-2.5 pr-3.5 py-1.5"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/20 ring-2 ring-white/70">
              {scorer.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={scorer.photoUrl || "/placeholder.svg"} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-sm font-bold text-white">{scorer.name.charAt(0)}</span>
              )}
            </div>
            <span className="max-w-[140px] truncate text-sm font-bold text-white drop-shadow-sm">{scorer.name}</span>
          </motion.div>
        ) : null}
      </div>
    </motion.div>
  )
}
