-- A bot made over the owner socket starts when its owner first opens its chat (bots.open).
CREATE TABLE bot_start (
  bot_id TEXT PRIMARY KEY NOT NULL REFERENCES bot(id) ON DELETE CASCADE
);

-- Bots that already have instructions get the start turn on their first open if they never had a turn.
INSERT INTO bot_start (bot_id) SELECT id FROM bot WHERE trim(instructions) != '';
