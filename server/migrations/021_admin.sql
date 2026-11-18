-- 运营管理后台（docs/22）：后台账号与会话、审计日志、封号与禁言、系统邮件、全服公告。

-- 后台账号与玩家账号分开；role：SUPER 超管 / OPERATOR 运营 / SUPPORT 客服
CREATE TABLE IF NOT EXISTS admin_accounts (
  id uuid PRIMARY KEY,
  login_name text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('SUPER', 'OPERATOR', 'SUPPORT')),
  disabled boolean NOT NULL DEFAULT false,
  created_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash text PRIMARY KEY,
  admin_id uuid NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

-- 后台的每一次写操作与登录都记一笔；detail 里不存密码
CREATE TABLE IF NOT EXISTS admin_audit (
  id bigserial PRIMARY KEY,
  admin_id uuid REFERENCES admin_accounts(id) ON DELETE SET NULL,
  admin_login text NOT NULL,
  action text NOT NULL,
  target text,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_audit_recent ON admin_audit (id DESC);

-- 封号在账号上（登录与会话都拦），禁言在角色上（同图聊天拦）；null 为未处置，很大的值为永久
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS banned_until bigint;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS ban_reason text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS muted_until bigint;
-- 建角时刻：全服补偿可限「发信时已建角的侠客」，总览统计今日新增。老角色记为迁移时刻
ALTER TABLE players ADD COLUMN IF NOT EXISTS created_at bigint NOT NULL DEFAULT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;

-- 系统邮件：player_id 为空即全服；existing_only 时只发给发信前已建角的侠客
CREATE TABLE IF NOT EXISTS mails (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  body text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '{}',
  player_id uuid REFERENCES players(id) ON DELETE CASCADE,
  existing_only boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES admin_accounts(id) ON DELETE SET NULL,
  created_at bigint NOT NULL,
  expires_at bigint NOT NULL,
  revoked boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS mails_player ON mails (player_id, expires_at);

CREATE TABLE IF NOT EXISTS mail_claims (
  mail_id uuid NOT NULL REFERENCES mails(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  claimed_at bigint NOT NULL,
  PRIMARY KEY (mail_id, player_id)
);

CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY,
  content text NOT NULL,
  starts_at bigint NOT NULL,
  ends_at bigint NOT NULL CHECK (ends_at > starts_at),
  created_by uuid REFERENCES admin_accounts(id) ON DELETE SET NULL,
  created_at bigint NOT NULL,
  revoked boolean NOT NULL DEFAULT false
);
