-- 后台持有襄阳事务锁时推进。收功只读取已封榜周，跨周追赶可逐周开放封赏。
CREATE TABLE IF NOT EXISTS xiangyang_settlement (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  closed_war integer NOT NULL
);

CREATE INDEX IF NOT EXISTS xiangyang_sorties_auto_player_time ON xiangyang_sorties (player_id, created_at) WHERE auto;
