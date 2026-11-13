CREATE TABLE IF NOT EXISTS quanzhen_library_guards (
  player_id uuid PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  mirror jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS quanzhen_library_reports (
  battle_id uuid PRIMARY KEY,
  guard_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  occurred_at bigint NOT NULL,
  report jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS quanzhen_library_reports_guard_idx
  ON quanzhen_library_reports (guard_id, occurred_at DESC, battle_id);
