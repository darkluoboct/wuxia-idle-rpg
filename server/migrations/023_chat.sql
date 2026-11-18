-- 江湖传音（docs/23）：世界、门派、同图、私聊四个频道的消息留档，屏蔽名单与屏蔽词。

-- scope：门派频道为门派 ID，同图为地图 ID，其余为空。发言人的名号与门派按发言当时留档
-- 私聊有收件人与已读时刻；hidden 为运营删除，不再下发
CREATE TABLE IF NOT EXISTS chat_messages (
  id bigserial PRIMARY KEY,
  channel text NOT NULL CHECK (channel IN ('WORLD', 'SECT', 'MAP', 'PRIVATE')),
  scope text,
  sender_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  sender_name text NOT NULL,
  sender_sect text NOT NULL,
  recipient_id uuid REFERENCES players(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at bigint NOT NULL,
  read_at bigint,
  hidden boolean NOT NULL DEFAULT false,
  CHECK ((channel = 'PRIVATE') = (recipient_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS chat_messages_channel ON chat_messages (channel, scope, id DESC);
CREATE INDEX IF NOT EXISTS chat_messages_private_in ON chat_messages (recipient_id, id DESC) WHERE channel = 'PRIVATE';
CREATE INDEX IF NOT EXISTS chat_messages_private_out ON chat_messages (sender_id, id DESC) WHERE channel = 'PRIVATE';
CREATE INDEX IF NOT EXISTS chat_messages_created ON chat_messages (created_at);

-- 屏蔽：被屏蔽的人发来的私聊直接拒收，世界、门派、同图里他的话前端不显示
CREATE TABLE IF NOT EXISTS chat_blocks (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at bigint NOT NULL,
  PRIMARY KEY (player_id, blocked_id),
  CHECK (player_id <> blocked_id)
);

-- 屏蔽词：运营后台维护，发言里命中的字样换成 ＊
CREATE TABLE IF NOT EXISTS chat_banned_words (
  word text PRIMARY KEY CHECK (length(word) BETWEEN 1 AND 20)
);
