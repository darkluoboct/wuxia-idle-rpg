-- 结义镜像（docs/21）：打过三人副本或主动登记时按当时配装冻结，同伴不在线时可被借去同闯。每人一份，覆盖更新。
CREATE TABLE IF NOT EXISTS raid_mirrors (
  player_id uuid PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  mirror jsonb NOT NULL,
  mirror_at bigint NOT NULL
);
