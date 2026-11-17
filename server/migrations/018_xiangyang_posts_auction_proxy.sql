-- 襄阳守卫战改为每周一场、军令可攒、离线值守（docs/20）。场次改按周编号。
ALTER TABLE xiangyang_entries DROP CONSTRAINT IF EXISTS xiangyang_entries_sorties_check;
ALTER TABLE xiangyang_entries ADD COLUMN IF NOT EXISTS auto_sorties integer NOT NULL DEFAULT 0 CHECK (auto_sorties >= 0);
-- 手上的军令：orders 道，记于 orders_at；此后按 shared/xiangyang.ts 每 8 小时回一道
ALTER TABLE xiangyang_entries ADD COLUMN IF NOT EXISTS orders integer NOT NULL DEFAULT 3 CHECK (orders BETWEEN 0 AND 3);
ALTER TABLE xiangyang_entries ADD COLUMN IF NOT EXISTS orders_at bigint NOT NULL DEFAULT 0;
ALTER TABLE xiangyang_sorties ADD COLUMN IF NOT EXISTS auto boolean NOT NULL DEFAULT false;
ALTER TABLE xiangyang_sorties ADD COLUMN IF NOT EXISTS drum boolean NOT NULL DEFAULT false;

-- 值守：每人一行，跨场保留。due_at / due_war 是镜像下一次替他出战的时刻与场次；
-- 结算按 due_at 先后逐一打，全服一把事务锁，城门推进的顺序与时间一致。
CREATE TABLE IF NOT EXISTS xiangyang_posts (
  player_id uuid PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  gate text NOT NULL CHECK (gate IN ('EAST', 'NORTH', 'WATER')),
  mirror jsonb NOT NULL,
  mirror_at bigint NOT NULL,
  due_at bigint NOT NULL,
  due_war integer NOT NULL
);

CREATE INDEX IF NOT EXISTS xiangyang_posts_due ON xiangyang_posts (due_at, player_id);

-- 鬼市暗拍代出价：领先者的心理价（已全数冻结），落槌后按成交价结算、多出的退还
ALTER TABLE ghost_auctions ADD COLUMN IF NOT EXISTS leader_max integer;
ALTER TABLE ghost_auction_bids ADD COLUMN IF NOT EXISTS proxy boolean NOT NULL DEFAULT false;
