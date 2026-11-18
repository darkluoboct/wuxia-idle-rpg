-- 结义镜像助战（docs/21）：被借去同闯打赢时给主人记助战真气，每天最多记三次，主人下次收功时领走。
ALTER TABLE raid_mirrors ADD COLUMN IF NOT EXISTS lends integer NOT NULL DEFAULT 0 CHECK (lends >= 0);
ALTER TABLE raid_mirrors ADD COLUMN IF NOT EXISTS lend_qi bigint NOT NULL DEFAULT 0 CHECK (lend_qi >= 0);
ALTER TABLE raid_mirrors ADD COLUMN IF NOT EXISTS lend_day integer NOT NULL DEFAULT 0;
ALTER TABLE raid_mirrors ADD COLUMN IF NOT EXISTS lends_today integer NOT NULL DEFAULT 0;
