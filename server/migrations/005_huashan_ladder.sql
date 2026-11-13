CREATE TABLE IF NOT EXISTS huashan_entries (
  season_id integer NOT NULL,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  mirror jsonb NOT NULL,
  rating integer NOT NULL DEFAULT 1000 CHECK (rating >= 0),
  wins integer NOT NULL DEFAULT 0 CHECK (wins >= 0),
  matches integer NOT NULL DEFAULT 0 CHECK (matches >= wins),
  claimed boolean NOT NULL DEFAULT false,
  honor text,
  suffix text NOT NULL DEFAULT '',
  inscription text NOT NULL DEFAULT '',
  PRIMARY KEY (season_id, player_id),
  UNIQUE (season_id, honor)
);

CREATE INDEX IF NOT EXISTS huashan_rank_idx ON huashan_entries (season_id, rating DESC, wins DESC, player_id);
CREATE INDEX IF NOT EXISTS huashan_player_idx ON huashan_entries (player_id, season_id DESC);
