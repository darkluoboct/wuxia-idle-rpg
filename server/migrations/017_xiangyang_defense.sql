-- 襄阳守卫战（docs/20）：每场三门各自的波次与攒下的战功。出战的事务先锁角色、再锁城门行。
CREATE TABLE IF NOT EXISTS xiangyang_gates (
  war_id integer NOT NULL,
  gate text NOT NULL CHECK (gate IN ('EAST', 'NORTH', 'WATER')),
  wave integer NOT NULL DEFAULT 1 CHECK (wave BETWEEN 1 AND 9),
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0),
  PRIMARY KEY (war_id, gate)
);

-- 每人每场一行：首次出战定下城门，本场不换；skill_id 是最近一次出战装着的外功，残页落在它上面
CREATE TABLE IF NOT EXISTS xiangyang_entries (
  war_id integer NOT NULL,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  gate text NOT NULL CHECK (gate IN ('EAST', 'NORTH', 'WATER')),
  sorties integer NOT NULL DEFAULT 0 CHECK (sorties BETWEEN 0 AND 5),
  merit integer NOT NULL DEFAULT 0 CHECK (merit >= 0),
  skill_id text,
  claimed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (war_id, player_id)
);

CREATE INDEX IF NOT EXISTS xiangyang_entries_gate ON xiangyang_entries (war_id, gate, merit DESC);
CREATE INDEX IF NOT EXISTS xiangyang_entries_unclaimed ON xiangyang_entries (player_id) WHERE NOT claimed;

-- 战报：城头滚动播报与争议复核
CREATE TABLE IF NOT EXISTS xiangyang_sorties (
  id bigserial PRIMARY KEY,
  war_id integer NOT NULL,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  gate text NOT NULL,
  wave integer NOT NULL,
  merit integer NOT NULL CHECK (merit >= 0),
  won boolean NOT NULL,
  repelled integer,
  created_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS xiangyang_sorties_war ON xiangyang_sorties (war_id, id DESC);
