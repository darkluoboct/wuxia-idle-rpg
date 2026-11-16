-- 兵器谱 · 全服唯一真品：谁在执掌、何时到手、最后一次露面。没有数据行表示从未有人得到。
CREATE TABLE IF NOT EXISTS unique_artifacts (
  item_id text PRIMARY KEY,
  holder_id uuid REFERENCES players(id) ON DELETE SET NULL,
  held_since bigint NOT NULL,
  seen_at bigint NOT NULL
);

-- 此前已拿到真·绿玉打狗棒的角色登记为执棒者
INSERT INTO unique_artifacts (item_id, holder_id, held_since, seen_at)
SELECT item_id, player_id, clock.ms, clock.ms
FROM player_items, (SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS ms) clock
WHERE item_id = 'dagou_stick_true'
ON CONFLICT (item_id) DO NOTHING;

-- 君山擂台的每一场：defender_id 为空且 vs_elder 表示与代守的传功长老过招
CREATE TABLE IF NOT EXISTS artifact_duels (
  id bigserial PRIMARY KEY,
  item_id text NOT NULL,
  challenger_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  defender_id uuid REFERENCES players(id) ON DELETE SET NULL,
  vs_elder boolean NOT NULL,
  won boolean NOT NULL,
  created_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS artifact_duels_recent ON artifact_duels (item_id, id DESC);
