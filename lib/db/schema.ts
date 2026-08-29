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
  /** API-Football lig id'si */
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
