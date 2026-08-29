// ---------------------------------------------------------------------------
// Core entities
// ---------------------------------------------------------------------------

export interface TeamInfo {
  id: number
  name: string
  logo: string
  country?: string
  flagUrl?: string | null
}

export interface LeagueInfo {
  id: number
  name: string
  country: string
  logo: string
  season: number
  round?: string
}

export interface Fixture {
  id: number
  date: string
  timestamp: number
  status: string
  statusShort: string
  // Live elapsed minute (only present while the match is being played).
  elapsed: number | null
  // Uzatma süresi (örn. 90+3 → extra=3). Sadece uzatma döneminde dolu.
  elapsedExtra: number | null
  venue: string | null
  league: LeagueInfo
  home: TeamInfo
  away: TeamInfo
  goalsHome: number | null
  goalsAway: number | null
  /** Hakem adı (API'de mevcutsa) */
  referee: string | null
  /** Hakemin ülkesi (bayrak için) */
  refereeCountry: string | null
}

/** A fixture as sent to the client list. */
export type FixtureWithPrediction = Fixture

// ---------------------------------------------------------------------------
// Live / raw API-Football data (refreshable)
// ---------------------------------------------------------------------------

export interface MatchEvent {
  minute: number
  extra: number | null
  team: string
  player: string | null
  playerId: number | null
  assist: string | null
  assistId: number | null
  type: string
  detail: string
}

export interface StatItem {
  type: string
  home: string | number | null
  away: string | number | null
}

export interface LineupPlayer {
  id: number | null
  number: number | null
  name: string
  pos: string | null
  grid: string | null
}

export interface TeamLineup {
  team: string
  formation: string | null
  coach: string | null
  startXI: LineupPlayer[]
  substitutes: LineupPlayer[]
}

export interface StandingRow {
  rank: number
  team: string
  teamId: number
  teamLogo: string
  points: number
  played: number
  win: number
  draw: number
  lose: number
  goalsFor: number
  goalsAgainst: number
  form: string | null
  group: string
  /**
   * Harici veri sağlayıcısından alınan toplam kadro piyasa değeri (tam euro). Sadece lig
   * puan durumu (standings) sekmesinde doldurulur; diğer üreticilerde (maç
   * detayı, takım sayfası) alan atlanır ve undefined kalır.
   */
  marketValueEur?: number | null
}

export interface InjuryItem {
  team: string
  player: string
  playerId: number | null
  reason: string
  type: string
}

export interface FormGame {
  opponent: string
  scored: number
  conceded: number
  result: "W" | "D" | "L"
  home: boolean
  date: string
  /** H2H için gerçek takım adları */
  homeTeam?: string
  awayTeam?: string
  /** H2H maçları için gerçek fixture ID'si — maç paneline link vermek için (bkz. analysis-panel.tsx H2HSection). Normal form (son 5 maç) girdilerinde boş kalır. */
  fixtureId?: number
  /** H2H maçları için turnuva/lig id'si (API-Football league.id). Çift ayaklı
   * eleme turlarında "ilk ayak" tespitinin AYNI TURNUVADAKİ maçla sınırlı
   * kalması için gerekli — aksi halde iki takım aynı hafta içinde farklı bir
   * turnuvada (örn. kendi liglerinde) karşılaşmışsa o maç yanlışlıkla ilk
   * ayak sanılabilir. Normal form (son 5 maç) girdilerinde boş kalır. */
  leagueId?: number
  }

export interface TeamSeasonStats {
  team: TeamInfo
  formString: string
  played: number
  wins: number
  draws: number
  losses: number
  goalsForAvg: number
  goalsAgainstAvg: number
  cleanSheets: number
  failedToScore: number
  recent: FormGame[]
  /**
   * Ev/deplasman ayrımlı istatistikler — API-Football'un
   * /teams/statistics response'undaki fixtures/goals .home ve .away
   * alanlarından. Bu ayrım tahmin promptunda kullanılır: bir takımın
   * genel ortalaması iyi olsa da deplasman formu çok daha zayıf olabilir.
   * Yetersiz veri durumunda (örn. hiç deplasman maçı oynamamış) null olur.
   */
  home: HomeAwaySplit | null
  away: HomeAwaySplit | null
}

export interface HomeAwaySplit {
  played: number
  wins: number
  draws: number
  losses: number
  goalsForAvg: number
  goalsAgainstAvg: number
}

/** Everything we pulled live from API-Football for the detail panel. */
export interface LiveMatchData {
  fixture: Fixture
  events: MatchEvent[]
  statistics: StatItem[]
  lineups: TeamLineup[]
  standings: StandingRow[]
  injuries: InjuryItem[]
  h2h: FormGame[]
  homeStats: TeamSeasonStats | null
  awayStats: TeamSeasonStats | null
  odds: { home: number | null; draw: number | null; away: number | null; source: string | null }
  homeSquad: SquadPlayer[]
  awaySquad: SquadPlayer[]
}

// ---------------------------------------------------------------------------
// Player data
// ---------------------------------------------------------------------------

export interface PlayerProfile {
  id: number
  name: string
  firstname: string
  lastname: string
  age: number | null
  birthDate: string | null
  birthPlace: string | null
  birthCountry: string | null
  nationality: string | null
  height: string | null
  weight: string | null
  photo: string | null
  position: string | null
  number: number | null
  injured: boolean
  /** Current team */
  team: TeamInfo | null
  /** Current league */
  league: { id: number; name: string; country: string; logo: string; season: number } | null
  /** Harici veri sağlayıcısından alınan piyasa değeri (tam euro). DB'de eşleşme yoksa null. */
  marketValueEur: number | null
}

export interface PlayerSeasonStats {
  season: number
  /** O sezon en çok dakika aldığı takım (birincil takım, gösterim amaçlı). */
  team: TeamInfo
  /** O sezon forma giydiği tüm takımlar (transfer olduysa birden fazla). */
  teams: TeamInfo[]
  /** O sezon en çok dakika aldığı turnuva (birincil lig, logo gösterimi amaçlı). */
  league: { id: number; name: string; country: string; logo: string }
  /** O sezon oynadığı tüm turnuvaların isimleri (lig, kupa, Şampiyonlar Ligi vb. birleştirilmiş). */
  leagueNames: string[]
  appearances: number | null
  lineups: number | null
  minutes: number | null
  goals: number | null
  assists: number | null
  yellowCards: number | null
  redCards: number | null
  yellowRedCards: number | null
  rating: string | null
  // Shots
  shotsTotal: number | null
  shotsOn: number | null
  // Passes
  passesTotal: number | null
  passesKey: number | null
  passesAccuracy: string | null
  // Tackles
  tacklesTotal: number | null
  interceptions: number | null
  blockedShots: number | null
  // Duels
  duelsTotal: number | null
  duelsWon: number | null
  // Dribbles
  dribblesAttempted: number | null
  dribblesSuccess: number | null
  // Fouls
  foulsDrawn: number | null
  foulsCommitted: number | null
  // Offsides
  offsides: number | null
  // Penalty
  penaltyWon: number | null
  penaltyScored: number | null
  penaltyMissed: number | null
  penaltySaved: number | null
}

export interface Transfer {
  date: string | null
  type: string
  teamFrom: TeamInfo
  teamTo: TeamInfo
}

export interface Trophy {
  league: string
  country: string
  season: string
  place: string
}

export interface TopScorer {
  player: { id: number; name: string; photo: string | null; nationality: string | null }
  team: TeamInfo
  goals: number | null
  assists: number | null
  yellowCards: number | null
  redCards: number | null
  appearances: number | null
  rating: string | null
}

export interface FixturePlayerStat {
  team: string
  teamId: number
  player: { id: number; name: string; photo: string | null; number: number | null; pos: string | null }
  rating: string | null
  minutes: number | null
  goals: number | null
  assists: number | null
  yellowCard: boolean
  redCard: boolean
  shots: number | null
  shotsOn: number | null
  passes: number | null
  passesAccuracy: string | null
  tackles: number | null
  dribbles: number | null
  captain: boolean
  substitute: boolean
  /** Kalecinin yaptığı kurtarış sayısı (goals.saves) — mevkiye özel form kriterleri için. */
  saves: number | null
  /** Kalecinin/takımın yediği gol sayısı (goals.conceded) — mevkiye özel form kriterleri için. */
  goalsConceded: number | null
  /** Kilit pas sayısı (passes.key) — orta saha/kanat form kriterleri için. */
  keyPasses: number | null
  /** Top kesme sayısı (tackles.interceptions) — defans form kriterleri için. */
  interceptions: number | null
  /** Blok sayısı (tackles.blocks) — defans form kriterleri için. */
  blocks: number | null
  /** Toplam ikili mücadele (duels.total) */
  duelsTotal: number | null
  /** Kazanılan ikili mücadele (duels.won) — defans/orta saha form kriterleri için. */
  duelsWon: number | null
  /** Başarılı çalım sayısı (dribbles.success) — kanat/hücum form kriterleri için. */
  dribblesSuccess: number | null
}

export interface SidelinedEntry {
  type: string
  start: string | null
  end: string | null
}

// ---------------------------------------------------------------------------
// API responses
// ---------------------------------------------------------------------------

export interface FixturesResponse {
  date: string
  fixtures: Fixture[]
  cachedAt: number
  stale?: boolean
}

/** Tek bir modelin oy/tahmin verisi */
export interface ModelVote {
  /** Model tanımlayıcısı, örn: "openai/gpt-4o" */
  model: string
  /** Modelin tahmini kazanan */
  winner: "home" | "away" | "draw"
  /** Tahmini ev sahibi skoru */
  homeScore: number
  /** Tahmini deplasman skoru */
  awayScore: number
  /** 0-100 güven skoru */
  confidence: number
  /** İki takım da gol atar mı */
  btts: boolean
  /** 2.5 üstü / altı */
  overUnder: "over" | "under"
  /** Bu modelin öne çıkardığı anahtar faktörler */
  keyFactors: string[]
  /**
   * Self-consistency anlaşma oranı (0-1): modelden alınan N örneklemenin
   * kaçı çoğunluk kazananıyla hemfikir. 1.0 = tüm örnekler aynı sonucu verdi
   * (kararlı tahmin), düşük değer = model örnekler arasında tutarsız kaldı.
   */
  agreement: number
}

export interface MatchPrediction {
  fixtureId: number
  homeScore: number
  awayScore: number
  /** "home" | "away" | "draw" */
  winner: "home" | "away" | "draw"
  /** 0-100 arası güven skoru (ağırlıklı ortalama, geçmiş isabet oranına göre kalibre edilmiş) */
  confidence: number
  /** Kalibrasyon öncesi ham ensemble güven skoru — şeffaflık amaçlı, sadece admin panelinde gösterilir */
  rawConfidence?: number
  /** Kısa Türkçe analiz özeti */
  summary: string
  /** En önemli 1-5 etken (tüm modellerden birleştirilmiş) */
  keyFactors: string[]
  /** `summary`'nin İngilizce çevirisi — tek bir ek AI çağrısıyla üretilir (en-US kullanıcılar için) */
  summaryEn?: string
  /** `keyFactors`'ın İngilizce çevirisi */
  keyFactorsEn?: string[]
  /** İki takım da gol atar mı */
  btts: boolean
  /** 2.5 üstü / altı */
  overUnder: "over" | "under"
  /** Her modelin bireysel oyu — UI'da göstermek için */
  modelVotes: ModelVote[]
  /** Gün sonuna kadar cache'de kalır (TR gece yarısı) */
  cachedAt: number
  /** Ev sahibi takım adı (başarı paneli karşılaştırması için) */
  homeName?: string
  /** Deplasman takım adı (başarı paneli karşılaştırması için) */
  awayName?: string
  /** AI modellerine prompt'ta verilen bahis oranları — panelde şeffaflık için gösterilir */
  odds?: { home: number | null; draw: number | null; away: number | null }
  /**
   * Eleme usulü (knockout) tur bilgisi — sadece `league.round` bir eleme
   * turuna işaret ediyorsa dolu olur (bkz. lib/knockout.ts). Lig/grup usulü
   * maçlarda undefined kalır.
   */
  tie?: {
    /** Bu maçın kaçıncı ayak olduğu (1, 2, 3...) — bilinmiyorsa/tek maçlıksa null */
    leg: number | null
    /** Bu turun eleme (beraberliğin nihai sonuç olamayacağı) bir tur olduğu */
    isKnockout: boolean
    /** Bu maçın turun kararının verildiği (deciding) maç olup olmadığı —
     * true ise 90 dk sonunda agregat berabere kalırsa uzatma/penaltı hesaplanır */
    isDeciding: boolean
    /** İlk ayak sonucu (varsa) — o maçtaki gerçek ev/deplasman etiketleriyle */
    firstLeg?: { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number; date: string }
    /** Toplam skor (agregat) — bu maçın ev sahibi/deplasman etiketine göre.
     * `isDeciding` true ve berabereyse uzatma/penaltı golleri dahil edilmiştir. */
    aggregateHome?: number
    aggregateAway?: number
    /** 90 dakika sonunda agregat berabere kalıp uzatmaya gidildi mi */
    wentToExtraTime?: boolean
    /** Uzatmada da berabere kalıp penaltılara gidildi mi */
    wentToPenalties?: boolean
    /** Turu geçen taraf (bu maçın ev/deplasman etiketine göre) — sadece `isDeciding` true ise dolu */
    advancing?: "home" | "away"
    /** Penaltı atışları skoru — sadece `wentToPenalties` true ise dolu.
     * Not: LLM ensemble'ından değil, koddaki deterministik istatistiksel
     * skor dağılımından üretilir (bkz. lib/knockout.ts generatePenaltyScore). */
    penaltyHome?: number
    penaltyAway?: number
  }
}

/** Bitmiş maç için tahmin-gerçek sonuç karşılaştırması */
export interface PredictionResult {
  fixtureId: number
  homeName: string
  awayName: string
  /** Tahmin edilen skor */
  predictedHome: number
  predictedAway: number
  /** Tahmin edilen kazanan */
  predictedWinner: "home" | "away" | "draw"
  /** Gerçek skor */
  actualHome: number
  actualAway: number
  /** Gerçek kazanan */
  actualWinner: "home" | "away" | "draw"
  /** Skor tahmini tam tuttu mu */
  scoreCorrect: boolean
  /** Taraf tahmini (ev/deplasman/beraberlik) tuttu mu */
  sideCorrect: boolean
  /** Güven skoru */
  confidence: number
  /** Kaydedilme zamanı */
  savedAt: number
  /** Her modelin bireysel tahmin sonuçları — per-AI başarı için */
  modelResults?: Array<{
    model: string
    label: string
    winner: "home" | "away" | "draw"
    sideCorrect: boolean
    homeScore: number
    awayScore: number
    scoreCorrect: boolean
  }>
}

// ---------------------------------------------------------------------------
// Taraftar oylaması — "kim kazanır" çubuğu
// ---------------------------------------------------------------------------

export type VoteChoice = "home" | "draw" | "away"

export interface VoteCounts {
  home: number
  draw: number
  away: number
}

export interface VoteState {
  fixtureId: number
  counts: VoteCounts
  total: number
  myVote: VoteChoice | null
}

export interface AnalysisResponse {
  live: LiveMatchData
  playerStats: FixturePlayerStat[]
  liveCachedAt: number
  stale?: boolean
  prediction?: MatchPrediction | null
}

export interface LeagueSeasonStats {
  /** Toplam maç sayısı */
  totalMatches: number
  /** Toplam gol */
  totalGoals: number
  /** Maç başı ortalama gol */
  avgGoalsPerMatch: number
  /** Toplam sarı kart */
  yellowCards: number
  /** Toplam kırmızı kart */
  redCards: number
  /** Harici veri sağlayıcısından alınan, ligdeki tüm takımların toplam kadro piyasa değeri (tam euro). Hiçbir takım eşleşmemişse null. */
  totalMarketValueEur: number | null
}

export interface LeagueTopScorer {
  player: { id: number; name: string; photo: string | null; nationality: string | null }
  team: TeamInfo
  goals: number
  assists: number
  appearances: number
  rating: string | null
  yellowCards: number
  redCards: number
  pos: string | null
}

export interface LeagueTopAssist {
  player: { id: number; name: string; photo: string | null; nationality: string | null }
  team: TeamInfo
  assists: number
  goals: number
  appearances: number
  rating: string | null
}

export interface LeagueTopCard {
  player: { id: number; name: string; photo: string | null; nationality: string | null }
  team: TeamInfo
  yellow: number
  red: number
  appearances: number
}

// Lig paneli açıldığında sadece bu hafif özet çekilir (header için isim/logo/
// ülke/sezon). Puan durumu, gol krallığı, maçlar vb. tüm diğer veriler
// sekmelere tıklandığında ayrı ayrı çekilir — bkz. /api/league/section.
export interface LeagueBasicInfo {
  league: { id: number; name: string; country: string; logo: string; flagUrl: string | null }
  season: number
}

export interface SquadPlayer {
  id: number
  name: string
  age: number | null
  number: number | null
  pos: string | null
  photo: string | null
  /** Harici veri sağlayıcısından alınan piyasa değeri (tam euro). DB'de eşleşme yoksa null. */
  marketValueEur: number | null
}

export interface TeamTransfer {
  date: string | null
  type: string
  teamFrom: TeamInfo
  teamTo: TeamInfo
  player: { id: number; name: string; photo: string | null }
}

export interface TeamTrophy {
  league: string
  country: string
  season: string
  place: string
}

export interface TeamCoach {
  id: number
  name: string
  photo: string | null
  nationality: string | null
  age: number | null
  career: { team: TeamInfo; start: string | null; end: string | null }[]
}

export interface TeamTopScorer {
  player: { id: number; name: string; photo: string | null }
  goals: number
  assists: number
  appearances: number
  rating: string | null
  yellowCards: number
  redCards: number
  pos: string | null
}

export interface TeamPageData {
  team: TeamInfo
  venue: { name: string | null; city: string | null; capacity: number | null; image: string | null }
  currentSeason: number
  stats: TeamSeasonStats | null
  squad: SquadPlayer[]
  recentFixtures: Fixture[]
  standings: StandingRow[]
  transfers: TeamTransfer[]
  trophies: TeamTrophy[]
  coach: TeamCoach | null
  topScorers: TeamTopScorer[]
  fetchedAt: number
}

/** Takım panelinin header'ı için hafif, tek istekle gelen özet bilgi. */
export interface TeamBasicInfo {
  team: TeamInfo
  venue: { name: string | null; city: string | null; capacity: number | null; image: string | null }
  currentSeason: number
  /** Harici veri sağlayıcısından alınan toplam kadro piyasa değeri (tam euro). DB'de eşleşme yoksa null. */
  marketValueEur: number | null
}

/** Sadece "Sezon İstatistikleri" sekmesi için (form/maç listesi hariç). */
export type TeamStatsSummary = Omit<TeamSeasonStats, "recent">

/** "Son Form" sekmesi için — maç listesi ve fallback form string'i ayrı çekilir. */
export interface TeamFormData {
  recent: FormGame[]
  formString: string
}
