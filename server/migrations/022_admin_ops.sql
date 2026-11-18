-- 运营后台二期（docs/22）：倍率活动、运营商店、活跃与在线留档（报表用）。

-- 倍率活动：kind 为 QI 挂机真气 / SILVER 挂机纹银 / DROP 巡历掉落；pct 为加成百分比，100 即双倍
-- 开始时刻不早于创建时刻；提前结束只把 ends_at 改为当时，已累计的加成不收回
CREATE TABLE IF NOT EXISTS rate_boosts (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('QI', 'SILVER', 'DROP')),
  pct integer NOT NULL CHECK (pct BETWEEN 1 AND 400),
  title text NOT NULL,
  starts_at bigint NOT NULL,
  ends_at bigint NOT NULL CHECK (ends_at > starts_at),
  created_by uuid REFERENCES admin_accounts(id) ON DELETE SET NULL,
  created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_boosts_ends ON rate_boosts (ends_at);

-- 运营商店：goods 与系统邮件附件同形（不含元宝）；limit_kind 为 TOTAL / DAILY / WEEKLY，空为不限购；stock 空为不限量
CREATE TABLE IF NOT EXISTS shop_goods (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  goods jsonb NOT NULL,
  currency text NOT NULL CHECK (currency IN ('INGOT', 'SILVER')),
  price integer NOT NULL CHECK (price > 0),
  limit_kind text CHECK (limit_kind IN ('TOTAL', 'DAILY', 'WEEKLY')),
  limit_count integer CHECK (limit_count > 0),
  stock integer CHECK (stock >= 0),
  sold integer NOT NULL DEFAULT 0 CHECK (sold >= 0),
  starts_at bigint NOT NULL,
  ends_at bigint,
  sort integer NOT NULL DEFAULT 0,
  hidden boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES admin_accounts(id) ON DELETE SET NULL,
  created_at bigint NOT NULL,
  CHECK ((limit_kind IS NULL) = (limit_count IS NULL)),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS shop_purchases (
  id bigserial PRIMARY KEY,
  goods_id uuid NOT NULL REFERENCES shop_goods(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  currency text NOT NULL,
  price integer NOT NULL,
  created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS shop_purchases_player ON shop_purchases (player_id, goods_id, created_at);
CREATE INDEX IF NOT EXISTS shop_purchases_recent ON shop_purchases (created_at);

-- 活跃日：侠客当天有过任何写操作即记一行（北京时间的日序号），用于日活与留存
CREATE TABLE IF NOT EXISTS player_activity_days (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  day integer NOT NULL,
  PRIMARY KEY (player_id, day)
);
CREATE INDEX IF NOT EXISTS player_activity_days_day ON player_activity_days (day);

-- 在线人数每 5 分钟留一个点，保留 35 天
CREATE TABLE IF NOT EXISTS online_samples (
  at bigint PRIMARY KEY,
  online integer NOT NULL CHECK (online >= 0)
);
