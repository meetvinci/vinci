# Vinci changelog

Write for developers keeping up with Vinci. Use language a client can follow and avoid em dashes. Lead with the outcome, explain one example, and include setup or caveats that change how people use it.

## Choose the range

- For a PR, compare its head with its merge base against its actual target branch. For an explicit Git range, use the requested endpoints.
- For a main catch-up, fetch `origin/main` and verify that the commit in `docs/changelog/.last-main-commit` is its ancestor. If history was recreated, verify the equivalent starting point against the published notes or ask for the intended range.
- Read the net diff and the latest notes. Group related changes by the behavior that survives at the tip. Skip outcomes already documented. An empty range or mechanical change needs no version bump.
- Advance the checkpoint only for a reviewed contiguous range starting at the saved checkpoint (or its verified equivalent) and ending on the first-parent history of `origin/main`. Save the full tip hash, including when the outcomes were already documented. Leave the checkpoint in place for an unmerged PR.

## Write and illustrate the entry

Create `docs/changelog/vX.Y.Z.md` using the next numeric patch version after the latest entry. When revising an entry already in the PR, keep its version. Check the target for competing version numbers before publishing. The site generates the page heading and orders entries automatically.

```markdown
---
title: v0.1.12
description: Entity types and relations
---

*2026-11-28*
```

Date the entry to the latest included change. Place the visual next to the example it explains. Use a labeled diagram for a new model, a table for field definitions, a request and response for an API contract, or a short recording for an interaction. For a change to existing behavior, use a matched before/after capture or a small diff showing the real difference. Use demo data and verify identifiers, commands and results against the feature.

Store durable media under `docs/changelog/media/<version-or-date>/` and link it relatively with meaningful alt text. Keep the screenshot of the rendered entry outside the docs tree for use as a PR attachment. Follow the repository's dev-server rules when capturing interactions.

## Verify the page

Build the docs with the Pages workflow's command. Open the generated `/en/changelog/<version>/` page, check its index link, and inspect the text, media and examples at reading size. For a PR, capture the rendered entry including its visual and follow the [native PR media workflow](pr-media.md) to embed it and verify the preview on GitHub.
