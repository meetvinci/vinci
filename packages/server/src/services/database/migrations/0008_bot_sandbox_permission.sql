-- Bots start at `sandbox` (commands and edits in the person's sandbox run without asking) instead of `ask`. Nobody but an admin could
-- choose a level, and the new-bot forms always sent `ask`, so a stored `ask` is the old default: move it. Without a sandbox (development,
-- the desktop app) `sandbox` asks as `ask` did.
UPDATE bot SET permission = 'sandbox' WHERE permission = 'ask';
