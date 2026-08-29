BEGIN;

CREATE TABLE IF NOT EXISTS data_import_run (
  id text PRIMARY KEY,
  source text NOT NULL CHECK (source IN ('transfermarkt','api_football')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','stale','failed','completed','stopped')),
  stage text NOT NULL DEFAULT 'initializing', mode text NOT NULL DEFAULT 'full',
  "autoResume" boolean NOT NULL DEFAULT true, "idempotencyKey" text NOT NULL UNIQUE,
  "workflowRunId" text, "totalLeagues" integer NOT NULL DEFAULT 23,
  "processedLeagues" integer NOT NULL DEFAULT 0, "successfulLeagues" integer NOT NULL DEFAULT 0, "failedLeagues" integer NOT NULL DEFAULT 0,
  "totalTeams" integer NOT NULL DEFAULT 0, "processedTeams" integer NOT NULL DEFAULT 0, "successfulTeams" integer NOT NULL DEFAULT 0, "failedTeams" integer NOT NULL DEFAULT 0,
  "totalPlayers" integer NOT NULL DEFAULT 0, "processedPlayers" integer NOT NULL DEFAULT 0, "successfulPlayers" integer NOT NULL DEFAULT 0, "failedPlayers" integer NOT NULL DEFAULT 0, "missingPlayers" integer NOT NULL DEFAULT 0,
  "activeLeague" text, "activeTeam" text, "activeUrl" text, "errorType" text, "errorMessage" text,
  "restartCount" integer NOT NULL DEFAULT 0, "startedAt" timestamp NOT NULL DEFAULT now(), "finishedAt" timestamp,
  "heartbeatAt" timestamp NOT NULL DEFAULT now(), "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS data_import_one_active_source_uq ON data_import_run(source) WHERE status IN ('queued','running','stale');
CREATE INDEX IF NOT EXISTS data_import_run_source_status_idx ON data_import_run(source,status);
CREATE INDEX IF NOT EXISTS data_import_run_heartbeat_idx ON data_import_run("heartbeatAt");

CREATE TABLE IF NOT EXISTS data_import_checkpoint (
  id text PRIMARY KEY, "runId" text NOT NULL REFERENCES data_import_run(id) ON DELETE CASCADE,
  source text NOT NULL, kind text NOT NULL, "itemKey" text NOT NULL, "parentKey" text,
  status text NOT NULL DEFAULT 'pending', url text, attempts integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb, "completedAt" timestamp, "updatedAt" timestamp NOT NULL DEFAULT now(),
  UNIQUE ("runId",kind,"itemKey")
);
CREATE INDEX IF NOT EXISTS data_import_checkpoint_lookup_idx ON data_import_checkpoint("runId",status,kind);

CREATE TABLE IF NOT EXISTS data_import_error (
  id text PRIMARY KEY, "runId" text NOT NULL REFERENCES data_import_run(id) ON DELETE CASCADE,
  source text NOT NULL, kind text NOT NULL, "itemKey" text, "errorType" text NOT NULL,
  message text NOT NULL, url text, retryable boolean NOT NULL DEFAULT false, attempt integer NOT NULL DEFAULT 1,
  details jsonb NOT NULL DEFAULT '{}'::jsonb, "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS data_import_error_run_idx ON data_import_error("runId","createdAt");

CREATE TABLE IF NOT EXISTS transfermarkt_league_snapshot (
  "sourceId" text PRIMARY KEY, "runId" text NOT NULL REFERENCES data_import_run(id), name text NOT NULL,
  country text NOT NULL, "sourceUrl" text NOT NULL, "seenAt" timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS transfermarkt_team_snapshot (
  "sourceId" text PRIMARY KEY, "runId" text NOT NULL REFERENCES data_import_run(id),
  "leagueSourceId" text NOT NULL REFERENCES transfermarkt_league_snapshot("sourceId"), name text NOT NULL,
  "sourceUrl" text NOT NULL, "seenAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transfermarkt_team_league_idx ON transfermarkt_team_snapshot("leagueSourceId");
CREATE TABLE IF NOT EXISTS transfermarkt_player_snapshot (
  "sourceId" text PRIMARY KEY, "runId" text NOT NULL REFERENCES data_import_run(id),
  "teamSourceId" text NOT NULL REFERENCES transfermarkt_team_snapshot("sourceId"), name text NOT NULL,
  "birthDate" date, "detailedPosition" text NOT NULL, "marketValueRaw" text,
  "marketValueEur" numeric(16,0), "currentTeamName" text NOT NULL, "sourceUrl" text NOT NULL,
  "seenAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transfermarkt_player_team_idx ON transfermarkt_player_snapshot("teamSourceId");
CREATE INDEX IF NOT EXISTS transfermarkt_player_market_idx ON transfermarkt_player_snapshot("marketValueEur");

CREATE TABLE IF NOT EXISTS api_football_league_snapshot (
  "sourceId" integer PRIMARY KEY, "runId" text NOT NULL REFERENCES data_import_run(id), name text NOT NULL,
  country text NOT NULL, season integer NOT NULL, "seenAt" timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS api_football_team_snapshot (
  "sourceId" integer PRIMARY KEY, "runId" text NOT NULL REFERENCES data_import_run(id),
  "leagueSourceId" integer NOT NULL REFERENCES api_football_league_snapshot("sourceId"), name text NOT NULL,
  "seenAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_football_team_league_idx ON api_football_team_snapshot("leagueSourceId");
CREATE TABLE IF NOT EXISTS api_football_player_snapshot (
  "sourceId" integer PRIMARY KEY, "runId" text NOT NULL REFERENCES data_import_run(id),
  "teamSourceId" integer NOT NULL REFERENCES api_football_team_snapshot("sourceId"), name text NOT NULL,
  "birthDate" date, "currentTeamName" text NOT NULL, "seenAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_football_player_team_idx ON api_football_player_snapshot("teamSourceId");

COMMIT;
