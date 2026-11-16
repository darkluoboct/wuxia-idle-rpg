-- 元宝流水：每笔增减都记一行。ref 非空的奖励（首通、周榜、每日江湖事）每人只能入账一次。
CREATE TABLE IF NOT EXISTS ingot_ledger (
  id bigserial PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  delta integer NOT NULL CHECK (delta <> 0),
  balance integer NOT NULL CHECK (balance >= 0),
  reason text NOT NULL,
  ref text,
  created_at bigint NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ingot_ledger_once ON ingot_ledger (player_id, ref) WHERE ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS ingot_ledger_player ON ingot_ledger (player_id, id DESC);

-- 结缘审计：每一抽的结果都留档，便于争议复核
CREATE TABLE IF NOT EXISTS gacha_log (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  pull_no integer NOT NULL,
  tier text NOT NULL,
  kind text NOT NULL,
  ref_id text,
  qty integer,
  grade text,
  pity_triggered boolean NOT NULL DEFAULT false,
  created_at bigint NOT NULL,
  PRIMARY KEY (player_id, pull_no)
);
