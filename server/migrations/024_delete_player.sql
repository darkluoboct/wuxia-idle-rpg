-- 删除角色（docs/24）：删前把角色整份转存，30 天内客服可恢复；名号在这期间只留给原账号。

-- snapshot：players 行与装备、武学、伙伴、配装各行（to_jsonb），恢复时原样写回
CREATE TABLE IF NOT EXISTS deleted_players (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  nickname text NOT NULL,
  level integer NOT NULL,
  snapshot jsonb NOT NULL,
  deleted_at bigint NOT NULL,
  -- PLAYER 为本人删除；后台删除时为后台账号
  deleted_by text NOT NULL,
  purge_after bigint NOT NULL,
  restored_at bigint
);
CREATE INDEX IF NOT EXISTS deleted_players_recent ON deleted_players (deleted_at DESC);
CREATE INDEX IF NOT EXISTS deleted_players_nickname ON deleted_players (nickname) WHERE restored_at IS NULL;

-- 留档类的记录不随角色删掉：聊天（留 180 天备查）、元宝流水与结缘记录（对账与争议复核）、商行购买
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_sender_id_fkey;
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_recipient_id_fkey;
ALTER TABLE ingot_ledger DROP CONSTRAINT IF EXISTS ingot_ledger_player_id_fkey;
ALTER TABLE gacha_log DROP CONSTRAINT IF EXISTS gacha_log_player_id_fkey;
ALTER TABLE shop_purchases DROP CONSTRAINT IF EXISTS shop_purchases_player_id_fkey;
