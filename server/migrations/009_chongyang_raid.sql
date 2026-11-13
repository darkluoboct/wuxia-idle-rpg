ALTER TABLE players ADD COLUMN IF NOT EXISTS chongyang_clears integer NOT NULL DEFAULT 0 CHECK (chongyang_clears >= 0);
