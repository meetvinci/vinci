-- Three modes replace the five permission levels: Read only stays, Normal follows the person's approval policy, No questions never asks.
UPDATE bot SET permission = 'normal' WHERE permission IN ('ask', 'sandbox', 'auto');
UPDATE bot SET permission = 'no-questions' WHERE permission = 'full';
-- A bot's "always approve" list becomes the person's own policy, for all their bots. MCP tools were listed by a runtime name that
-- changes with the server's settings and cannot be traced back to a server, so they ask once more; bot_mcp_add and bot_note always ask.
INSERT INTO settings (key, value, updated_at)
SELECT 'tools.policy', json_object('controls', json(controls), 'trusted', json('[]')), CAST(unixepoch('subsec') * 1000 AS INTEGER)
FROM (
  SELECT json_group_array(json_object('server', NULL, 'tool', name, 'behavior', 'allow')) AS controls, count(*) AS total
  FROM (
    SELECT DISTINCT listed.value AS name
    FROM (SELECT value FROM settings WHERE key LIKE 'tools.alwaysAllow.%' AND json_valid(value) AND json_type(value) = 'array') AS stored,
      json_each(stored.value) AS listed
    WHERE listed.type = 'text'
      AND listed.value NOT LIKE 'mcp\_%' ESCAPE '\' AND listed.value NOT IN ('bot_mcp_add', 'bot_note')
    LIMIT 500
  )
)
WHERE total > 0
ON CONFLICT (key) DO NOTHING;
DELETE FROM settings WHERE key LIKE 'tools.alwaysAllow.%';
