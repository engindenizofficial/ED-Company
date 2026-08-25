"use client"

import dynamic from "next/dynamic"

// Bu dört panel (Takım/Lig/Oyuncu/Maç) kök layout'ta her zaman render edilir
// ama kullanıcı bir şeye tıklamadığı sürece hepsi "if (!panel) return null"
// ile hiçbir şey göstermez. Buna karşın önceden statik import edildiklerinde
// JS'leri (özellikle MatchPanel'in içindeki ~2400 satırlık AnalysisPanel ve
// onun motion/html-to-image bağımlılıkları) HER sayfanın ana JS paketine
// gömülüyor, ilk yüklemede parse/hydrate edilip ana iş parçacığını bloke
// ediyordu (Lighthouse: "Ana iş parçacığı çalışması", "JS yürütme süresi",
// "Kullanılmayan JavaScript"). `next/dynamic` + `ssr: false`, App Router'da
// yalnızca Client Component içinde kullanılabildiği için bu dört paneli
// buraya (ayrı bir client wrapper) taşıyıp kök layout.tsx'ten (Server
// Component) tek bir <LazyPanels /> olarak render ediyoruz — görünüm ve
// davranış hiç değişmez, sadece kodları ayrı chunk'larda ve daha az
// öncelikli bir istek olarak yüklenir.
const TeamPanel = dynamic(() => import("@/components/team-panel").then((m) => m.TeamPanel), { ssr: false })
const LeaguePanel = dynamic(() => import("@/components/league-panel").then((m) => m.LeaguePanel), { ssr: false })
const PlayerPanel = dynamic(() => import("@/components/player-panel").then((m) => m.PlayerPanel), { ssr: false })
const MatchPanel = dynamic(() => import("@/components/match-panel").then((m) => m.MatchPanel), { ssr: false })

export function LazyPanels() {
  return (
    <>
      <TeamPanel />
      <LeaguePanel />
      <PlayerPanel />
      <MatchPanel />
    </>
  )
}
