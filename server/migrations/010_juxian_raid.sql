ALTER TABLE players ADD COLUMN IF NOT EXISTS juxian_clears integer NOT NULL DEFAULT 0 CHECK (juxian_clears >= 0);
