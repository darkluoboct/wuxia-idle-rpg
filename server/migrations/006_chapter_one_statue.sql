CREATE TABLE IF NOT EXISTS chapter_one_statue (
  chapter integer PRIMARY KEY CHECK (chapter = 1),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  won_at bigint NOT NULL DEFAULT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint
);
