import { pgTable, text, timestamp, boolean, integer, numeric } from 'drizzle-orm/pg-core'

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
// Kaynak: Transfermarkt scraping. Sadece cron job (Pazar gece yarısı) tarafından
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
   * artık takip edilen 23 ligden hiçbirinde çıkmıyorsa) bu alan geride kalır
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
  playerName: text('playerName').notNull(),
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
  candidateValueEur: numeric('candidateValueEur', { precision: 14, scale: 2 }),
  /** 0-100 arası benzerlik skoru */
  confidence: integer('confidence').notNull(),
  /** "pending" | "approved" | "rejected" */
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  resolvedAt: timestamp('resolvedAt'),
})
