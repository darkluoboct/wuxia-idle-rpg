-- 子时鬼市压轴暗拍：每个鬼市日一场，首次出价时开场。领先者的元宝已在出价时扣下。
CREATE TABLE IF NOT EXISTS ghost_auctions (
  day integer PRIMARY KEY,
  item_id text NOT NULL,
  start_price integer NOT NULL CHECK (start_price > 0),
  price integer NOT NULL CHECK (price >= start_price),
  leader_id uuid REFERENCES players(id) ON DELETE SET NULL,
  bids integer NOT NULL DEFAULT 0 CHECK (bids >= 0),
  closes_at bigint NOT NULL,
  mask_salt text NOT NULL,
  claimed boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS ghost_auctions_unclaimed ON ghost_auctions (leader_id) WHERE NOT claimed;

CREATE TABLE IF NOT EXISTS ghost_auction_bids (
  day integer NOT NULL REFERENCES ghost_auctions(day) ON DELETE CASCADE,
  bid_no integer NOT NULL,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  created_at bigint NOT NULL,
  PRIMARY KEY (day, bid_no)
);
