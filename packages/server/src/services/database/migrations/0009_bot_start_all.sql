-- Every bot gets the start turn on its first open, with or without instructions; bots.open skips bots that already had a turn.
INSERT INTO bot_start (bot_id) SELECT id FROM bot WHERE id NOT IN (SELECT bot_id FROM bot_start);
