CREATE TABLE IF NOT EXISTS sect_contest_entries (
  sect_id text NOT NULL,
  week_id integer NOT NULL,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  mirror jsonb NOT NULL,
  rating integer NOT NULL DEFAULT 1000 CHECK (rating >= 0),
  wins integer NOT NULL DEFAULT 0 CHECK (wins >= 0),
  matches integer NOT NULL DEFAULT 0 CHECK (matches >= wins),
  withdrawn boolean NOT NULL DEFAULT false,
  PRIMARY KEY (sect_id, week_id, player_id)
);

CREATE INDEX IF NOT EXISTS sect_contest_rank_idx
  ON sect_contest_entries (sect_id, week_id, rating DESC, wins DESC, player_id) WHERE NOT withdrawn;

CREATE TABLE IF NOT EXISTS sect_contest_results (
  sect_id text NOT NULL,
  week_id integer NOT NULL,
  chief_id uuid,
  PRIMARY KEY (sect_id, week_id),
  FOREIGN KEY (sect_id, week_id, chief_id) REFERENCES sect_contest_entries (sect_id, week_id, player_id)
    ON DELETE SET NULL (chief_id)
);
