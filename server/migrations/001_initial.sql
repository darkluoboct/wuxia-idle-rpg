CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY,
  login_name text NOT NULL UNIQUE,
  password_hash text NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  nickname text NOT NULL UNIQUE,
  profile jsonb NOT NULL,
  pill_count integer NOT NULL CHECK (pill_count >= 0),
  rewarded_chapters integer[] NOT NULL DEFAULT '{}',
  last_settle_at bigint NOT NULL,
  qi_remainder integer NOT NULL DEFAULT 0 CHECK (qi_remainder BETWEEN 0 AND 3599999),
  silver_remainder integer NOT NULL DEFAULT 0 CHECK (silver_remainder BETWEEN 0 AND 359999999),
  revision integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS player_items (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  PRIMARY KEY (player_id, item_id)
);

CREATE TABLE IF NOT EXISTS player_skills (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  skill_id text NOT NULL,
  mastery integer NOT NULL CHECK (mastery BETWEEN 1 AND 10),
  PRIMARY KEY (player_id, skill_id)
);

CREATE TABLE IF NOT EXISTS player_companions (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  companion_id text NOT NULL,
  state jsonb NOT NULL,
  PRIMARY KEY (player_id, companion_id)
);

CREATE TABLE IF NOT EXISTS player_loadouts (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  preset_idx integer NOT NULL CHECK (preset_idx BETWEEN 1 AND 3),
  preset jsonb NOT NULL,
  PRIMARY KEY (player_id, preset_idx)
);

CREATE TABLE IF NOT EXISTS player_actions (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  fingerprint text NOT NULL,
  result jsonb NOT NULL,
  PRIMARY KEY (player_id, request_id)
);
