CREATE INDEX IF NOT EXISTS players_absent_map_idx
  ON players ((profile->>'currentMapId'), last_settle_at DESC, id)
  WHERE NOT (profile ? 'mapJourney');
