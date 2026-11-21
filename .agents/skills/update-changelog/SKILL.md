---
name: update-changelog
description: Generate concise, illustrated development notes in the Vinci changelog from changes on main, a PR, or a specified Git range.
---

# Vinci changelog

Write for developers keeping up with Vinci. Use words a client can follow. Never use em dashes. Keep a technical name when someone needs it to call an API, configure an install, or change how they work.

## Choose the changes

Open `docs/changelog/README.md`. By default, fetch `origin/main` and compare its tip with the commit in `docs/changelog/.last-main-commit`. Confirm that commit is an ancestor of the tip. For a specified range, use its endpoints. For a PR, compare its head with its merge base. Read the commits and the net diff. Group work by the behavior that survived at the tip, even when it spans several PRs.

## Write the entry

Lead with the change a teammate most needs to know. Give each distinct outcome one short sentence. Add a second only for a necessary action or caveat. Include developer-facing changes when they affect a contract, setup, debugging, or daily work. Skip mechanical churn. For example, “The MCP editor now names the field you need to fix.”

## Show the change

Place the visual beside its sentence. Choose the smallest format that explains the change.

- **Interaction** - Record the real flow from starting state through one action to its visible result. If persistence is the point, show the result after reopening. Trim setup and waiting.
- **Layout** - Capture the base and tip with matching data, viewport and crop. Label them **Before** and **After**. For a new control or message, a single readable crop with its label often suffices.
- **Command, config or output** - Show the smallest real excerpt in a fenced `diff` block. Use `-` for the old line and `+` for the new one so the meaning survives without red and green.

Use demo data. Follow the repo's dev-server rules for captures. When a capture is unavailable, use a verified excerpt or plain sentence and mention the capture gap to the requester. Store finished media under `docs/changelog/media/<version-or-date>/`. Embed images with meaningful alt text and link recordings using relative paths. Play the final clip and inspect each crop at reading size. Check that the action, changed detail and result are legible.

## Prepend and verify

Use `## vX.Y.Z - Short label` with the date in italics on its own line below (`*YYYY-MM-DD*`). Versions count internal development milestones. For each new entry, increment the latest changelog patch number by one (v0.1.9 → v0.1.10). Date it to the latest included change. Keep the existing number when correcting an entry.

Keep entries newest first. Read existing notes before inserting or correcting one. Preserve earlier notes and media links. An empty range or one with no new outcomes needs no entry or version bump. After reviewing a contiguous main range, including one with only previously documented changes, save the full tip hash alone in `docs/changelog/.last-main-commit`. For a PR or explicit range, advance the checkpoint only if its base equals the saved commit and its tip is on the first-parent history of origin/main. Omit outcomes already documented. Read the resulting section in Markdown preview. Verify the heading, date, media and claims against the selected range, and scan the changed Markdown for em dashes.
