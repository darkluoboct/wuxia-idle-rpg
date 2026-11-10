CREATE TABLE IF NOT EXISTS co_cultivations (
  id uuid PRIMARY KEY,
  inviter_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  invitee_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  map_id text NOT NULL,
  invite_expires_at bigint NOT NULL,
  starts_at bigint,
  ends_at bigint,
  CHECK (inviter_id <> invitee_id),
  CHECK ((starts_at IS NULL) = (ends_at IS NULL)),
  CHECK (ends_at >= starts_at)
);

ALTER TABLE players ADD COLUMN IF NOT EXISTS co_cultivation_id uuid REFERENCES co_cultivations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS co_cultivation_pending_inviter ON co_cultivations (inviter_id, invite_expires_at DESC) WHERE starts_at IS NULL;
CREATE INDEX IF NOT EXISTS co_cultivation_pending_invitee ON co_cultivations (invitee_id, invite_expires_at DESC) WHERE starts_at IS NULL;
