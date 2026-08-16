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
// Piyasa değeri (market value) tabloları
// Kaynak: Transfermarkt scraping. Sadece cron job (Çarşamba gece yarısı UTC / TR 03:00) tarafından
// yazılır. Uygulama tarafı bu tabloları sadece OKUR, hiçbir zaman anlık scrape
// tetiklemez.
// ---------------------------------------------------------------------------

/** Takım bazlı Transfermarkt eşleşmesi + toplam kadro piyasa değeri. */
export const teamMarketValue = pgTable('team_market_value', {
  id: text('id').primaryKey(),
  /** API-Football takım id'si (lib/types.ts -> Team.id) */
  teamId: integer('teamId').notNull().unique(),
  /** API-Football lig id'si — 23 desteklenen ligden biri */
  leagueId: integer('leagueId').notNull(),
  teamName: text('teamName').notNull(),
  /** Transfermarkt takım slug/id'si, örn. "fc-barcelona" veya "131" */
  transfermarktTeamId: text('transfermarktTeamId'),
  transfermarktTeamSlug: text('transfermarktTeamSlug'),
  /** Toplam kadro piyasa değeri, tam euro cinsinden (örn. 850000000) */
  totalValueEur: numeric('totalValueEur', { precision: 14, scale: 2 }),
  /** Eşleştirme güven skoru 0-100 (takım ismi benzerliği) */
  matchConfidence: integer('matchConfidence'),
  /** "matched" | "review" | "unmatched" */
  matchStatus: text('matchStatus').notNull().default('unmatched'),
  /**
   * Admin bu eşleşmeyi manuel gözden geçirme ekranından onayladı/reddetti mi?
   * true ise cron job (haftalık isim benzerliği yeniden hesaplaması) bu satırın
   * matchStatus/transfermarktTeamId/totalValueEur/matchConfidence alanlarına
   * ASLA dokunmaz — admin kararı kalıcıdır. Sadece lastScrapedAt/piyasa değeri
   * yeniden scrape edilebilir (bkz. lib/market-value-sync.ts).
   */
  manualOverride: boolean('manualOverride').notNull().default(false),
  lastScrapedAt: timestamp('lastScrapedAt'),
  /**
   * Bu takımın API-Football tarafında "hâlâ var" olarak son doğrulandığı an —
   * lock durumundan bağımsız olarak, cron her ligi taradığında güncellenir.
   * Haftalık tam tarama döngüsünde bir takım hiç görülmezse (leagueId'si
   * artık takip edilen 24 ligden hiçbirinde çıkmıyorsa) bu alan geride kalır
   * ve temizlik adımı (cleanupStaleMarketValueRows) satırı siler. Admin
   * onayı (manualOverride) bu temizlikten muaf DEĞİLDİR — eşleşme kilitli
   * olsa da takım gerçekten ligden düşmüşse ghost kayıt olarak silinir.
   */
  lastSeenAt: timestamp('lastSeenAt').notNull().defaultNow(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

/** Oyuncu bazlı Transfermarkt eşleşmesi + piyasa değeri. */
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
   * için tutulur. API-Football tarafında bu bilgiyi almak oyuncu başına 1
   * istek gerektirdiğinden (günlük kotayı tüketir), bunun yerine zaten her
   * senkronda scrape edilen Transfermarkt verisinden ücretsiz elde edilir.
   */
  fullName: text('fullName'),
  /** Transfermarkt oyuncu id'si, örn. "28003" */
  transfermarktPlayerId: text('transfermarktPlayerId'),
  transfermarktPlayerSlug: text('transfermarktPlayerSlug'),
  /** Piyasa değeri, tam euro cinsinden (örn. 120000000) */
  valueEur: numeric('valueEur', { precision: 14, scale: 2 }),
  /** Eşleştirme güven skoru 0-100 (isim benzerliği, takım içi arama) */
  matchConfidence: integer('matchConfidence'),
  /** "matched" | "review" | "unmatched" */
  matchStatus: text('matchStatus').notNull().default('unmatched'),
  /** Bkz. team_market_value.manualOverride — aynı kilit mantığı oyuncu satırları için. */
  manualOverride: boolean('manualOverride').notNull().default(false),
  lastScrapedAt: timestamp('lastScrapedAt'),
  /** Bkz. team_market_value.lastSeenAt — oyuncu takımının kadrosunda hâlâ görülüyor mu? */
  lastSeenAt: timestamp('lastSeenAt').notNull().defaultNow(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

/**
 * Otomatik eşleştirmenin güven eşiğinin altında kaldığı takım/oyuncu adayları.
 * Manuel gözden geçirme arayüzü (8. adım) buradan okuyup onaylayacak.
 */
export const marketValueReviewQueue = pgTable('market_value_review_queue', {
  id: text('id').primaryKey(),
  /** "team" | "player" */
  entityType: text('entityType').notNull(),
  /** API-Football id'si (teamId veya playerId) */
  entityId: integer('entityId').notNull(),
  entityName: text('entityName').notNull(),
  /** API-Football tarafındaki takımın/oyuncunun ülkesi (menşei/uyruğu) — manuel eşleştirmeye yardımcı olur */
  entityCountry: text('entityCountry'),
  /** Bulunan en yakın Transfermarkt adayının adı */
  candidateName: text('candidateName'),
  candidateTransfermarktId: text('candidateTransfermarktId'),
  /** Transfermarkt adayının ülkesi (kulüp ülkesi / oyuncu uyruğu) */
  candidateCountry: text('candidateCountry'),
  /**
   * Ülke bilgisi için en az bir doldurma denemesi yapıldı mı? API-Football /
   * Transfermarkt kaynağında veri bulunamayınca entityCountry/candidateCountry
   * null kalabilir — bu durumda bu alan olmadan satır her backfill turunda
   * tekrar seçilip sonsuza kadar "işlenip" hiçbir zaman çözülmüyordu. Bu
   * bayrak true olduktan sonra satır backfill sorgusundan çıkar.
   */
  countryLookupAttempted: boolean('countryLookupAttempted').notNull().default(false),
  candidateValueEur: numeric('candidateValueEur', { precision: 14, scale: 2 }),
  /** 0-100 arası benzerlik skoru */
  confidence: integer('confidence').notNull(),
  /** "pending" | "approved" | "rejected" */
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  resolvedAt: timestamp('resolvedAt'),
})

/**
 * Haftalık 24 ligi zincirleme işleyen cron döngüsünün kalıcı durumu.
 * "Zincir kırıldığında hangi ligde kalındığı hiçbir yerde tutulmuyor" sorununu
 * çözer: her adım (her lig) bu satıra yazılır, böylece süreç bir yerde
 * (crash, zaman aşımı, ağ hatası) kesilse bile bir sonraki çağrı — admin
 * panelindeki manuel "devam ettir" tetiklemesi (bkz. app/api/cron/
 * resume-market-values) veya Vercel Cron'un bir sonraki haftalık çalışması —
 * tam olarak nerede kalındığını bilir.
 */
export const marketValueCronRun = pgTable('market_value_cron_run', {
  id: text('id').primaryKey(),
  /** Bu haftalık döngünün başladığı an — lastSeenAt karşılaştırması için kullanılır. */
  runStartedAt: timestamp('runStartedAt').notNull(),
  /** "running" | "completed" */
  status: text('status').notNull().default('running'),
  /** Sırada işlenecek (henüz tamamlanmamış) SCRAPABLE_LEAGUE_IDS index'i. */
  currentLeagueIndex: integer('currentLeagueIndex').notNull().default(0),
  /** Bu döngüde en az bir lig, tüm yeniden deneme haklarını tükettikten sonra kalıcı olarak başarısız oldu mu? */
  hadErrors: boolean('hadErrors').notNull().default(false),
  /**
   * Her lig için { leagueId, status: "pending"|"success"|"failed", attempts, lastError, updatedAt }
   * — hangi ligin işlendiğini, kaç kez denendiğini ve son hatasını gösterir.
   */
  leagueStatuses: jsonb('leagueStatuses').notNull(),
  /** Zincirin hâlâ "canlı" ilerlediğini gösterir — her adımda güncellenir. Eskime (stale) kontrolü için buna bakılır. */
  heartbeatAt: timestamp('heartbeatAt').notNull().defaultNow(),
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

/** Günlük güç cron'unun basit çalışma günlüğü — ayrı bir izleme ekranı olmadan gözlemlenebilirlik sağlar. */
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
