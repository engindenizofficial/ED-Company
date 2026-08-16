// ---------------------------------------------------------------------------
// Menajer kariyeri — sezon fikstürü üretimi. Saf fonksiyonlar, DB'ye/API'ye
// dokunmaz (bkz. app/actions/manager-fixtures.ts, gerçek veri kaynaklarını
// bu modüle besleyen server action'lar için).
// ---------------------------------------------------------------------------

export interface RoundRobinTeam {
  /** API-Football takım id'si; null => kullanıcının kulübü. */
  id: number | null
  name: string
  logo: string | null
}

export interface RoundRobinFixture {
  matchday: number
  home: RoundRobinTeam
  away: RoundRobinTeam
}

/**
 * Verilen takım listesinden ("circle method") çift devreli (rövanşlı) bir
 * lig takvimi üretir. Tek sayıda takım varsa her turda bir takım rotasyonla
 * "bay" (o hafta maçsız) geçer — o takımın olduğu eşleşme o tura hiç
 * eklenmez.
 *
 * N takım için: N çift ise 2*(N-1) hafta, N tek ise 2*N hafta (her turda 1
 * takım bay) üretilir. Her takım rakibiyle bir kez evinde, bir kez
 * deplasmanda oynar.
 */
export function buildDoubleRoundRobinCalendar(teams: RoundRobinTeam[]): RoundRobinFixture[] {
  const n = teams.length
  if (n < 2) return []

  const hasBye = n % 2 !== 0
  const list: (RoundRobinTeam | null)[] = hasBye ? [...teams, null] : [...teams]
  const size = list.length
  const numRounds = size - 1
  const half = size / 2

  const firstLeg: RoundRobinFixture[] = []
  let current = list.slice()

  for (let round = 0; round < numRounds; round++) {
    for (let i = 0; i < half; i++) {
      const a = current[i]
      const b = current[size - 1 - i]
      if (a && b) {
        // Ev sahipliğini tur+sıra bazında alterne et ki bir takım hep aynı tarafta kalmasın.
        const isFirstTeamHome = (round + i) % 2 === 0
        firstLeg.push({
          matchday: round + 1,
          home: isFirstTeamHome ? a : b,
          away: isFirstTeamHome ? b : a,
        })
      }
    }
    // Rotasyon: ilk eleman sabit, kalanlar bir sağa kayar (circle method).
    const fixed = current[0]
    const rest = current.slice(1)
    const last = rest.pop()
    if (last !== undefined) rest.unshift(last)
    current = [fixed, ...rest]
  }

  const secondLeg: RoundRobinFixture[] = firstLeg.map((f) => ({
    matchday: f.matchday + numRounds,
    home: f.away,
    away: f.home,
  }))

  return [...firstLeg, ...secondLeg]
}
