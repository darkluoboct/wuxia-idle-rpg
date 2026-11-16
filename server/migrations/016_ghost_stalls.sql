-- 子时鬼市蒙面摊位：货物上架即由鬼市代管。卖出的纹银先记在 proceeds，摊主下次操作时入账；
-- 卖完、到期或撤摊后由摊主的事务收摊并删除数据行。
CREATE TABLE IF NOT EXISTS stall_listings (
  id uuid PRIMARY KEY,
  seller_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('HERB', 'FRAGMENT')),
  goods_id text NOT NULL,
  qty integer NOT NULL CHECK (qty >= 0),
  unit_price integer NOT NULL CHECK (unit_price > 0),
  sold integer NOT NULL DEFAULT 0 CHECK (sold >= 0),
  proceeds integer NOT NULL DEFAULT 0 CHECK (proceeds >= 0),
  created_at bigint NOT NULL,
  expires_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS stall_listings_seller ON stall_listings (seller_id);
CREATE INDEX IF NOT EXISTS stall_listings_open ON stall_listings (kind, goods_id, unit_price) WHERE qty > 0;

-- 每一笔成交留档：价格参考与争议复核
CREATE TABLE IF NOT EXISTS stall_sales (
  id bigserial PRIMARY KEY,
  listing_id uuid NOT NULL,
  seller_id uuid REFERENCES players(id) ON DELETE SET NULL,
  buyer_id uuid REFERENCES players(id) ON DELETE SET NULL,
  kind text NOT NULL,
  goods_id text NOT NULL,
  qty integer NOT NULL CHECK (qty > 0),
  unit_price integer NOT NULL,
  tax integer NOT NULL,
  created_at bigint NOT NULL
);
