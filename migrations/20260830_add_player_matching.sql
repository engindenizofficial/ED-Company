CREATE TABLE IF NOT EXISTS player_match_run (
  id text PRIMARY KEY,
  "transfermarktRunId" text NOT NULL REFERENCES data_import_run(id),
  "apiFootballRunId" text NOT NULL REFERENCES data_import_run(id),
  "workflowRunId" text,
  status text NOT NULL DEFAULT 'queued',
  stage text NOT NULL DEFAULT 'initializing',
  "totalPlayers" integer NOT NULL DEFAULT 0,
  "processedPlayers" integer NOT NULL DEFAULT 0,
  "exactMatches" integer NOT NULL DEFAULT 0,
  "fuzzyMatches" integer NOT NULL DEFAULT 0,
  "unmatchedPlayers" integer NOT NULL DEFAULT 0,
  "errorCount" integer NOT NULL DEFAULT 0,
  "activePlayer" text,
  "errorMessage" text,
  "startedAt" timestamp NOT NULL DEFAULT now(),
  "finishedAt" timestamp,
  "heartbeatAt" timestamp NOT NULL DEFAULT now(),
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS player_match_run_status_idx ON player_match_run(status);
CREATE INDEX IF NOT EXISTS player_match_run_created_idx ON player_match_run("createdAt");

CREATE TABLE IF NOT EXISTS player_match_result (
  id text PRIMARY KEY,
  "matchRunId" text NOT NULL REFERENCES player_match_run(id) ON DELETE CASCADE,
  "transfermarktPlayerId" text NOT NULL,
  "apiFootballPlayerId" integer,
  "matchedLevel" text NOT NULL,
  "normalizedTransfermarktName" text NOT NULL,
  "normalizedApiFootballName" text,
  "normalizedTeamName" text NOT NULL,
  "birthDate" text,
  "nameScore" numeric(6,5),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT player_match_result_level_ck CHECK ("matchedLevel" IN ('exact_biographic', 'fuzzy_name_birthdate', 'unmatched'))
);

CREATE UNIQUE INDEX IF NOT EXISTS player_match_result_tm_uq ON player_match_result("matchRunId", "transfermarktPlayerId");
CREATE UNIQUE INDEX IF NOT EXISTS player_match_result_af_uq ON player_match_result("matchRunId", "apiFootballPlayerId") WHERE "apiFootballPlayerId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS player_match_result_level_idx ON player_match_result("matchRunId", "matchedLevel");
