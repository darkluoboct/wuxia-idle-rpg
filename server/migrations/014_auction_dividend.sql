-- 暗拍红封：按当日领过每日江湖事的流水数人头、排抽签次序
CREATE INDEX IF NOT EXISTS ingot_ledger_daily ON ingot_ledger (ref, created_at) WHERE reason = 'daily';
