ALTER TABLE players ADD COLUMN IF NOT EXISTS shaoshi_clears integer NOT NULL DEFAULT 0 CHECK (shaoshi_clears >= 0);
