ALTER TABLE player_items ADD COLUMN IF NOT EXISTS affix_roll integer NOT NULL DEFAULT 0 CHECK (affix_roll >= 0);
