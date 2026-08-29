import { pgTable, text, timestamp, boolean, integer, numeric, jsonb } from 'drizzle-orm/pg-core'

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
})

// ---------------------------------------------------------------------------
// App tables
// ---------------------------------------------------------------------------

/** Kullanıcının favori takım/lig listesi. Sıralama `position` alanı ile korunur. */
export const favorite = pgTable('favorite', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  /** "team" | "league" */
  type: text('type').notNull(),
  /** API-Football takım/lig id'si */
  itemId: integer('itemId').notNull(),
  name: text('name').notNull(),
  logo: text('logo'),
  country: text('country'),
  flagUrl: text('flagUrl'),
  /** 0 tabanlı sıra — 1 numara en üstte gösterilir */
  position: integer('position').notNull().default(0),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// Push bildirimleri
// Kullanıcı favori takımının maçları için Web Push aboneliği + canlı maç
// bildirim durumu (tekrar göndermemek için son bilinen skor/durum).
// ---------------------------------------------------------------------------

/** Bir tarayıcı/cihazın Web Push aboneliği. Kullanıcı başına birden çok cihaz olabilir. */
export const pushSubscription = pgTable('push_subscription', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

/** Bir fikstür için gönderilen son bildirim durumu — cron'un aynı olayı iki kez göndermesini engeller. */
export const liveFixtureNotificationState = pgTable('live_fixture_notification_state', {
  /** API-Football fikstür id'si (text — integer PK yerine, tekilliği garantiler) */
  fixtureId: text('fixtureId').primaryKey(),
  /** Son bildirimi gönderdiğimiz maç durumu, örn. "1H" | "HT" | "2H" | "FT" */
  lastStatusShort: text('lastStatusShort'),
  /** Son bildirim gönderildiğindeki ev sahibi gol sayısı */
  lastHomeGoals: integer('lastHomeGoals').notNull().default(0),
  /** Son bildirim gönderildiğindeki misafir gol sayısı */
  lastAwayGoals: integer('lastAwayGoals').notNull().default(0),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// Piyasa değeri (market value) tabloları
// Tarihsel piyasa değeri ve kaynak eşleştirme verilerini saklar.
// Otomatik veri çekme sistemi kaldırılmıştır; uygulama bu tabloları yalnızca
// mevcut kayıtları okumak için kullanır.
// ---------------------------------------------------------------------------

/** Lig bazlı eşleşme (matched olduğunda yazılır) + ligdeki tüm takımların toplam piyasa değeri. */
export const leagueMarketValue = pgTable('league_market_value', {
  id: text('id').primaryKey(),
  /** API-Football lig id'si — FEATURED_LEAGUE_IDS'den biri */
  leagueId: integer('leagueId').notNull().unique(),
  leagueName: text('leagueName').notNull(),
  /** API-Football lig ülkesi */
  leagueCountry: text('leagueCountry'),
  transfermarktLeagueName: text('transfermarktLeagueName'),
  transfermarktLeagueCountry: text('transfermarktLeagueCountry'),
  /** Ligdeki tüm takımların piyasa değeri toplamı, tam euro cinsinden */
  totalValueEur: numeric('totalValueEur', { precision: 14, scale: 2 }),
  nameMatchPercent: integer('nameMatchPercent'),
  countryMatchPercent: integer('countryMatchPercent'),
  /** avg(nameMatchPercent, countryMatchPercent) */
  matchPercent: integer('matchPercent').notNull().default(0),
  /** Satır sadece eşleşince (otomatik ≥75 veya manuel onay sonrası) yazılır — her zaman "matched". */
  matchStatus: text('matchStatus').notNull().default('matched'),
  lastScrapedAt: timestamp('lastScrapedAt'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

/** Takım bazlı eşleşme (matched olduğunda yazılır) + toplam kadro piyasa değeri. */
export const teamMarketValue = pgTable('team_market_value', {
  id: text('id').primaryKey(),
  /** API-Football takım id'si (lib/types.ts -> Team.id) */
  teamId: integer('teamId').notNull().unique(),
  /** API-Football lig id'si */
  leagueId: integer('leagueId').notNull(),
  teamName: text('teamName').notNull(),
  /** API-Football takım ülkesi */
  teamCountry: text('teamCountry'),
  /** Transfermarkt takım slug/id'si, örn. "fc-barcelona" veya "131" */
  transfermarktTeamId: text('transfermarktTeamId'),
  transfermarktTeamSlug: text('transfermarktTeamSlug'),
  transfermarktTeamName: text('transfermarktTeamName'),
  transfermarktTeamCountry: text('transfermarktTeamCountry'),
  /** Toplam kadro piyasa değeri, tam euro cinsinden (örn. 850000000) */
  totalValueEur: numeric('totalValueEur', { precision: 14, scale: 2 }),
  nameMatchPercent: integer('nameMatchPercent'),
  countryMatchPercent: integer('countryMatchPercent'),
  /** avg(nameMatchPercent, countryMatchPercent) — eşleştirme güven skoru 0-100 */
  matchConfidence: integer('matchConfidence'),
  /** Satır sadece eşleşince yazılır — her zaman "matched". */
  matchStatus: text('matchStatus').notNull().default('matched'),
  lastScrapedAt: timestamp('lastScrapedAt'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

/** Oyuncu bazlı eşleşme (matched olduğunda yazılır) + piyasa değeri. */
export const playerMarketValue = pgTable('player_market_value', {
  id: text('id').primaryKey(),
  /** API-Football oyuncu id'si (lib/types.ts -> Player.id) */
  playerId: integer('playerId').notNull().unique(),
  /** Bu oyuncunun eşleştirildiği anda oynadığı API-Football takım id'si */
  teamId: integer('teamId').notNull(),
  /** API-Football'ın kısa adı, örn. "O. Dembélé" — kadro/arayüz gösterimi için. */
  playerName: text('playerName').notNull(),
  /**
   * Transfermarkt kadro sayfasından gelen TAM ad, örn. "Ousmane Dembélé" —
   * yalnızca isim/soyisim aramasını (menajer kariyeri kadro arama ekranı)
   * `playerName`'in kısaltma formatına ("O. Dembélé") takılmadan yapabilmek
   * için tutulur.
   */
  fullName: text('fullName'),
  /** API-Football oyuncu uyruğu */
  playerCountry: text('playerCountry'),
  /** Transfermarkt oyuncu id'si, örn. "28003" */
  transfermarktPlayerId: text('transfermarktPlayerId'),
  transfermarktPlayerSlug: text('transfermarktPlayerSlug'),
  transfermarktPlayerCountry: text('transfermarktPlayerCountry'),
  /** Piyasa değeri, tam euro cinsinden (örn. 120000000) */
  valueEur: numeric('valueEur', { precision: 14, scale: 2 }),
  nameMatchPercent: integer('nameMatchPercent'),
  countryMatchPercent: integer('countryMatchPercent'),
  /** avg(nameMatchPercent, countryMatchPercent) — eşleştirme güven skoru 0-100 */
  matchConfidence: integer('matchConfidence'),
  /** Satır sadece eşleşince yazılır — her zaman "matched". */
  matchStatus: text('matchStatus').notNull().default('matched'),
  lastScrapedAt: timestamp('lastScrapedAt'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// Oyuncu güç motoru (player power engine).
// Taban güç = piyasa değeri (marketPower) + biriken sezon maç rating ortalaması
// (ratingPower) karışımı. Form katmanı = son ~8 maçın üstel azalan ağırlıklı
// etkisi (formModifier). currentPower = clamp(basePower + formModifier, 1, 99).
// Sadece günlük cron (bkz. lib/player-power-sync.ts, app/api/cron/
// update-player-power) tarafından yazılır. Uygulama tarafı bu tabloyu sadece
// OKUR; satırı olmayan oyuncular için güç piyasa değerinden anlık hesaplanır
// (bkz. lib/player-power.ts).
// ---------------------------------------------------------------------------

/** Oyuncu bazlı güç durumu — taban güç bileşenleri + biriken form geçmişi. */
export const playerPower = pgTable('player_power', {
  id: text('id').primaryKey(),
  /** API-Football oyuncu id'si */
  playerId: integer('playerId').notNull().unique(),
  /** Oyuncunun en son görüldüğü API-Football takım id'si */
  teamId: integer('teamId'),
  /** Piyasa değerinden türetilen taban puan (1-99), her cron çalışmasında yeniden hesaplanır */
  marketPower: integer('marketPower'),
  /** seasonRatingSum/Count'un ait olduğu API-Football sezonu (Ağustos'ta değişir). Sezon değiştiğinde ikisi de sıfırlanır. */
  seasonYear: integer('seasonYear'),
  /** Biriken sezon rating toplamı — her işlenen maçta rating eklenir */
  seasonRatingSum: numeric('seasonRatingSum', { precision: 10, scale: 2 }).notNull().default('0'),
  /** Biriken sezon maç sayısı (rating verilmiş maçlar) */
  seasonRatingCount: integer('seasonRatingCount').notNull().default(0),
  /** marketPower ve sezon rating ortalamasının ağırlıklı karışımı (1-99) */
  basePower: integer('basePower'),
  /** Son ~8 maçın üstel azalan ağırlıklı etkisi, -10..+10 aralığında */
  formModifier: integer('formModifier').notNull().default(0),
  /** clamp(basePower + formModifier, 1, 99) — kadro kurma ekranında gösterilen nihai puan */
  currentPower: integer('currentPower'),
  /**
   * Son işlenen maçların özeti (en yeni önde), form hesaplamasında kullanılır.
   * Her eleman: { fixtureId, date, rating, goals, assists, minutes }
   */
  recentMatches: jsonb('recentMatches').notNull().default([]),
  lastFormUpdateAt: timestamp('lastFormUpdateAt'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

/** Güç cron'unun zaten işlediği fixture'lar — aynı maçın istatistiklerinin iki kez form'a eklenmesini engeller. */
export const playerPowerProcessedFixture = pgTable('player_power_processed_fixture', {
  id: text('id').primaryKey(),
  /** API-Football fixture id'si */
  fixtureId: integer('fixtureId').notNull().unique(),
  processedAt: timestamp('processedAt').notNull().defaultNow(),
})

/** Günlük güç cron'unun basit çalışma g��nlüğü — ayrı bir izleme ekranı olmadan gözlemlenebilirlik sağlar. */
export const playerPowerCronRun = pgTable('player_power_cron_run', {
  id: text('id').primaryKey(),
  runStartedAt: timestamp('runStartedAt').notNull(),
  runFinishedAt: timestamp('runFinishedAt'),
  /** "running" | "completed" | "failed" */
  status: text('status').notNull().default('running'),
  /** Bu çalışmada taranan biten maç sayısı (takip edilen liglere filtrelenmiş) */
  fixturesScanned: integer('fixturesScanned').notNull().default(0),
  /** Bu çalışmada istatistikleri işlenen (yeni) fixture sayısı */
  fixturesProcessed: integer('fixturesProcessed').notNull().default(0),
  /** Bu çalışmada güç satırı güncellenen oyuncu sayısı */
  playersUpdated: integer('playersUpdated').notNull().default(0),
  lastError: text('lastError'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

/**
 * Tam-sezon güç backfill'inin (bkz. lib/player-power-backfill.ts,
 * app/api/cron/backfill-player-power) kalıcı durumu. Kendi kendini `after()`
 * ile tetikleyen zincirleme desene sahiptir,
 * tek fark ilerlemenin lig + lig-içi fixture index'iyle takip edilmesi —
 * bkz. FEATURED_LEAGUE_IDS (lib/leagues.ts).
 */
export const playerPowerBackfillCronRun = pgTable('player_power_backfill_cron_run', {
  id: text('id').primaryKey(),
  runStartedAt: timestamp('runStartedAt').notNull(),
  runFinishedAt: timestamp('runFinishedAt'),
  /** "running" | "completed" | "failed" */
  status: text('status').notNull().default('running'),
  /** Sırada işlenecek FEATURED_LEAGUE_IDS index'i. */
  currentLeagueIndex: integer('currentLeagueIndex').notNull().default(0),
  /** Şu anki ligin (kronolojik sıralanmış, biten) fikstür listesindeki sıradaki index. */
  currentFixtureIndex: integer('currentFixtureIndex').notNull().default(0),
  /** Bu koşuda toplam işlenen fixture/oyuncu sayısı — ilerleme göstergesi için. */
  fixturesProcessed: integer('fixturesProcessed').notNull().default(0),
  playersUpdated: integer('playersUpdated').notNull().default(0),
  /** Zincirin hâlâ "canlı" ilerlediğini gösterir — her adımda güncellenir. */
  heartbeatAt: timestamp('heartbeatAt').notNull().defaultNow(),
  lastError: text('lastError'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// Oyuncu alt mevki verisi. Canlı Transfermarkt taraması kaldırılmıştır;
// uygulama mevcut kayıtları sadece okur. Satırı olmayan oyuncular
// "unverified" kabul edilir (bkz. lib/player-positions.ts fit()).
// ---------------------------------------------------------------------------

/** Oyuncu bazlı alt mevki verisi. */
export const playerPosition = pgTable('player_position', {
  id: text('id').primaryKey(),
  /** API-Football oyuncu id'si */
  playerId: integer('playerId').notNull().unique(),
  /** playerMarketValue.transfermarktPlayerId'den kopyalanır — hangi profil sayfasından çekildiğini izler. */
  transfermarktPlayerId: text('transfermarktPlayerId'),
  /** Transfermarkt'ın ham metni, örn. "Defensive Midfield" — tanı/debug amaçlı saklanır. */
  mainPositionRaw: text('mainPositionRaw'),
  /** mainPositionRaw'ın lib/player-positions.ts ALIASES ile normalize edilmiş hali, örn. "DM" */
  mainPosition: text('mainPosition'),
  /** Transfermarkt'ın ham "Other position" metinleri, örn. ["Central Midfield", "Attacking Midfield"] */
  secondaryPositionsRaw: jsonb('secondaryPositionsRaw').notNull().default([]),
  /** secondaryPositionsRaw'ın normalize edilmiş hali, örn. ["CM", "AM"] */
  secondaryPositions: jsonb('secondaryPositions').notNull().default([]),
  /** "transfermarkt" | "unverified" — profil sayfasında pozisyon bulunamazsa (nadiren) "unverified" yazılır. */
  source: text('source').notNull().default('transfermarkt'),
  lastScrapedAt: timestamp('lastScrapedAt'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// "Kulübünü Kur" (menajer kariyeri) oyunu.
// Kullanıcı zorluk + lig + logo + isim seçip 18 kişilik bir kadro kurar.
// Her kullanıcının aynı anda tek bir kariyeri olur — yeniden oluşturma eski
// kariyeri (ve kadrosunu) siler, bkz. lib/games/manager-career.ts.
// ---------------------------------------------------------------------------

/** Menajer kariyeri — bir kullanıcının kurduğu hayali kulüp. */
export const managerCareer = pgTable('manager_career', {
  id: text('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  /** "easy" | "normal" | "hard" */
  difficulty: text('difficulty').notNull(),
  /** Başlangıç transfer bütçesi, tam euro (örn. 750000000) */
  startingBudgetEur: numeric('startingBudgetEur', { precision: 14, scale: 2 }).notNull(),
  /** Rakip takımların zorluk çarpanı, % (80/100/120) — ileride maç simülasyonunda kullanılacak */
  opponentStrengthPercent: integer('opponentStrengthPercent').notNull(),
  /** public/images/manager-logos/ altındaki dosya adı, örn. "logo-01.png" */
  logoFile: text('logoFile').notNull(),
  clubName: text('clubName').notNull(),
  managerName: text('managerName').notNull(),
  /** API-Football lig id'si — DUEL_SELECTABLE_LEAGUES içinden biri */
  leagueId: integer('leagueId').notNull(),
  /** Aktif diziliş, örn. "4-3-3" */
  formation: text('formation').notNull().default('4-4-2'),
  /** "building" (kadro kuruluyor) | "active" (kadro tamamlandı) */
  status: text('status').notNull().default('building'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

/** Bir menajer kariyerindeki tek bir kadro oyuncusu. */
export const managerSquadPlayer = pgTable('manager_squad_player', {
  id: text('id').primaryKey(),
  careerId: text('careerId')
    .notNull()
    .references(() => managerCareer.id, { onDelete: 'cascade' }),
  /** API-Football oyuncu id'si */
  playerId: integer('playerId').notNull(),
  playerName: text('playerName').notNull(),
  photo: text('photo'),
  /** Gerçek hayattaki (satın alma anındaki) kulübü — gösterim amaçlı */
  realTeamName: text('realTeamName'),
  realTeamLogo: text('realTeamLogo'),
  /** Ham API-Football mevki kategorisi: "Goalkeeper" | "Defender" | "Midfielder" | "Attacker" */
  position: text('position').notNull(),
  /** Satın alma anındaki piyasa değeri, tam euro — bütçeden düşülen tutar budur */
  priceEur: numeric('priceEur', { precision: 14, scale: 2 }).notNull(),
  /** "starting" | "bench" */
  role: text('role').notNull(),
  /** role="starting" iken diziliş içindeki slot anahtarı (örn. "DEF-1"); bench için null */
  slotKey: text('slotKey'),
  /** role="bench" iken 0-6 arası sıra; starting için null */
  benchIndex: integer('benchIndex'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

/**
 * Tek bir menajer kariyeri sezonundaki tek bir fikstür (lig maçı).
 * Ligdeki TÜM takımlar (gerçek takımlar + kullanıcının kulübü) çift devreli
 * round-robin ile bu tabloya yazılır; gerçek takımlar birbiriyle oynadığında
 * da sonuç burada simüle edilip saklanır.
 */
export const managerFixture = pgTable('manager_fixture', {
  id: text('id').primaryKey(),
  careerId: text('careerId')
    .notNull()
    .references(() => managerCareer.id, { onDelete: 'cascade' }),
  /** Sezon içindeki hafta numarası, 1'den başlar */
  matchday: integer('matchday').notNull(),
  /** API-Football takım id'si; null => bu taraf kullanıcının kulübü */
  homeTeamId: integer('homeTeamId'),
  homeTeamName: text('homeTeamName').notNull(),
  homeTeamLogo: text('homeTeamLogo'),
  awayTeamId: integer('awayTeamId'),
  awayTeamName: text('awayTeamName').notNull(),
  awayTeamLogo: text('awayTeamLogo'),
  /** homeTeamId veya awayTeamId null ise true (kullanıcının kulübü bu maçta) */
  isUserMatch: boolean('isUserMatch').notNull().default(false),
  /** "scheduled" | "played" */
  status: text('status').notNull().default('scheduled'),
  homeGoals: integer('homeGoals'),
  awayGoals: integer('awayGoals'),
  /** [{minute, type: "goal"|"yellow"|"red", side: "home"|"away", playerName}] — sonuç anında üretilir, bir daha değişmez */
  events: jsonb('events').notNull().default([]),
  playedAt: timestamp('playedAt'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

/**
 * Bir kariyerdeki gerçek (API-Football) takımlar için bir kez hesaplanıp
 * önbelleğe alınan hücum/orta saha/defans/genel güç. Kullanıcının kulübü
 * için bu tablo kullanılmaz — onun gücü kadrosundan anlık hesaplanır.
 */
export const managerTeamStrength = pgTable('manager_team_strength', {
  id: text('id').primaryKey(),
  careerId: text('careerId')
    .notNull()
    .references(() => managerCareer.id, { onDelete: 'cascade' }),
  /** API-Football takım id'si */
  teamId: integer('teamId').notNull(),
  defense: numeric('defense', { precision: 6, scale: 2 }).notNull(),
  midfield: numeric('midfield', { precision: 6, scale: 2 }).notNull(),
  attack: numeric('attack', { precision: 6, scale: 2 }).notNull(),
  overall: numeric('overall', { precision: 6, scale: 2 }).notNull(),
  computedAt: timestamp('computedAt').notNull().defaultNow(),
})
