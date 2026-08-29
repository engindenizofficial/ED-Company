-- Piyasa değeri, normalize mevki ve bunlardan türeyen oyuncu güç verilerini kaldırır.
-- Kullanıcının isteği doğrultusunda bu migration otomatik olarak uygulanmamıştır.

DROP TABLE IF EXISTS "player_power_backfill_cron_run";
DROP TABLE IF EXISTS "player_power_cron_run";
DROP TABLE IF EXISTS "player_power_processed_fixture";
DROP TABLE IF EXISTS "player_power";
DROP TABLE IF EXISTS "player_position";
DROP TABLE IF EXISTS "player_market_value";
DROP TABLE IF EXISTS "team_market_value";
DROP TABLE IF EXISTS "league_market_value";
