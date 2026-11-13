CREATE UNIQUE INDEX IF NOT EXISTS player_items_true_dagou_idx
  ON player_items (item_id) WHERE item_id = 'dagou_stick_true';
