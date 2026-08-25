"use client"

import { useEffect, useRef, useState } from "react"
import { clearStoredScore, readStoredScore, writeStoredScore } from "@/lib/goal-catchup-storage"

/** Bir maçta gol olduğunda 5 saniyeliğine gösterilecek kutlama kuyruğunu
 * yönetir. Aynı anda hem ev hem konuk gol atarsa (nadir de olsa), ikisi üst
 * üste binmeden sırayla gösterilir. Hem ana sayfadaki maç kartında
 * (fixture-list.tsx) hem de maç panelinin başlığında (analysis-panel.tsx)
 * kullanılır.
 *
 * Bu hook, KASITLI OLARAK `goal-celebration-overlay.tsx`'ten (ki "motion"
 * kütüphanesini import eder) ayrı bir dosyada tutuluyor. Hook, her maç
 * kartında/panelde HER ZAMAN çalışır (gol olup olmadığını izlemek için),
 * ama görsel overlay bileşeni sadece gerçekten bir kutlama gösterilecekse
 * yüklenmeli. Hook burada, ağır animasyon bileşeni ise ayrı bir dosyada
 * olduğu için, ana sayfa JS paketine "motion" hiç girmiyor — sadece bir gol
 * olduğunda `next/dynamic` ile talep üzerine indiriliyor
 * (bkz. `components/goal-celebration-lazy.tsx`).
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
