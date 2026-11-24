---
name: create-prs
description: Create focused GitHub PRs and linked PR chains from feature branches. Use when asked to create PRs or split feature work into stacked PRs.
---

# Create PRs

Turn the complete feature into focused commits and a PR chain. Each PR answers one review question; merge order explains the feature.

## 1. Capture the source

Inspect repository instructions, working tree, branch, remotes/upstream, commit graph, and existing PRs. Resolve the repository, target, and source range; inspect PR bases for existing stacks. Ask only when ambiguity changes the included work.

Work from a feature branch; identify it before rewriting a target branch or detached checkout. An explicit workflow request authorizes regrouping commits, pushing stack branches, and creating PRs. Automatic skill selection supplies no authorization to rewrite or publish.

Fetch relevant refs. Record source and target tips, merge-base, and remote OIDs for branches that may change. Capture the complete committed net diff, including merges. Include uncommitted work only when requested; preserve tracked and untracked contents separately and capture a source snapshot.

Create a unique backup ref at the original feature tip. Reconstruct in an isolated worktree. Inventory temporary worktrees, branches, captures, scratch files, processes, and services by ownership so cleanup preserves pre-existing work.

**Done:** source range, target, remote state, recovery ref, and preserved local work are recorded.

## 2. Design the batches

Read the entire net diff and necessary surrounding code. Group by behavior or prerequisite, using original commits as evidence. Squash fixups, split mixed changes by hunks where useful, and keep generated files and lockfiles with their cause.

Order prerequisites before consumers. Prefer one focused commit per PR; roughly 100–300 non-generated changed lines is a planning cue, with cohesion and working intermediate states taking priority. Explain larger batches.

Include affected documentation and agent instructions in the batch that changes their subject: app boundaries, setup, runtime, deployment, and user behavior. State deliberate deployment gaps and assign follow-up work.

Present a compact ordered plan, then continue. Assign every source change to a batch with a purpose, commit title, dependency, validation, review question, and suitable visual.

**Done:** the batches cover the complete change and each has a coherent review boundary.

## 3. Reconstruct and verify

Build a fresh linear sequence from the captured merge-base. Preserve attribution and required commit trailers. Create a branch at each PR boundary: each adds one batch to its predecessor. Retain the original feature branch and backup unless replacement was requested.

At each boundary, inspect the incremental diff and run relevant checks from the owning app. Definitions must precede consumers, migrations must match code, and tests must remain meaningful. Move changes between batches to repair split-induced failures. Record pre-existing failures and unavailable checks separately.

Require `git diff --exit-code <source-tip> <stack-tip>` to pass, preserving contents, modes, additions, and deletions. When including uncommitted work, compare against its captured snapshot. Verify boundary ancestry, account for the complete change across incremental diffs, and run final feature checks.

If target updates require rebasing, retain the verified reconstruction first. Rebase the whole stack coherently and recheck every boundary and the combined result. Compare the old and rebased series with `git range-diff`; review conflict resolutions and account for differences caused by target updates. Tree equality with the old source no longer applies.

**Done:** the complete feature is preserved, every boundary is coherent, and validation is recorded.

## 4. Publish the chain

Check GitHub authentication, repository, branch names, and existing PRs. Reuse matching PRs and preserve their discussion and human-written context. Update only this feature's branches and PRs.

Push in dependency order, preferring fresh names and ordinary pushes. An authorized replacement of a published branch requires `--force-with-lease=<ref>:<captured-remote-oid>`. On lease failure, inspect and integrate remote work, or confirm authority to replace it, before capturing a new expected OID. Never force-push the target branch.

Base the first PR on the target and each successor on its predecessor. Each Files changed view must contain only its batch. Follow repository draft conventions; otherwise publish ready PRs after successful validation and drafts when required checks remain unresolved.

### Copy and visuals

Write PR titles independently from commit titles. For a chain of two or more PRs, use `[n/N]` plus a short topic, such as `[5/9] Durable indexing`. Standalone PRs use the short topic alone.

Open with one plain sentence explaining the change and its purpose. Add a few short bullets for relevant validation, decisions, trade-offs, or follow-ups not apparent from the diff. Preserve repository templates; use implementation terms where they help review.

Apply the same writing rules to documentation: lead with what changes and why, use plain words and active voice, and keep only details the reader needs to act. Match the existing audience and structure; distinguish current behavior from planned work.

Every PR needs a visual answering its review question. Choose the format independently for each batch:

| Question concerns | Useful visual |
| --- | --- |
| Comparisons, supported cases, rules | Table |
| Requests, responses, interactions | Sequence diagram |
| Storage relationships | ER diagram |
| State transitions | State diagram |
| Races and event order | Timeline or race illustration |
| Deployment boundaries and connections | Topology diagram |
| UI behavior | Actual recording and useful screenshots |

Use Mermaid, a rendered chart, or a custom illustration when it best explains the changed behavior. A format can recur when it fits the question.

When creating, attaching, or updating image/video visuals, read [Native PR media](references/pr-media.md) for capture framing, native uploads, stable URLs, and inline playback verification.

### Navigation and readback

For multi-PR chains, once URLs exist, put position, ordered links, dependencies, and merge instructions in a collapsed `<details>` block, e.g. `Review order · 5/9`. Explain merge order and the need to check/restack remaining bases after predecessor merges, especially squash/rebase merges.

Read back every URL, base, head, body, and diff. Verify target/predecessor bases, remote heads against local branches, and that incremental diffs account for each batch exactly once. Resume partial publication from the missing step, retaining existing PRs.

Assess the title, opening sentence, and visual together: do they explain this PR's purpose? Check accuracy, legibility, useful context, and actual rendering. Confirm required media verification from the reference is complete.

**Done:** every batch has a verified PR with the correct base, chain links, and a useful rendered visual.

## 5. Clean up

Clean up before returning, including after partial failure. Preserve recovery refs, published branches and visuals, pre-existing user work, and any unfinished reconstruction needed for recovery.

Use the ownership inventory to stop this run's processes/services, using repository lifecycle hooks where available. Remove temporary prototypes, scratch files, verified local captures, and reconstruction-only branches whose commits remain reachable. Inspect unexpected dirty worktree contents and save valuable work before removal; avoid forced removal of unexamined work. Verify the temporary directory and worktree registration are gone.

**Done:** temporary resources are removed, published PRs/media remain accessible, and the original checkout's unrelated edits are intact. Report cleanup failures as unfinished work.

Return ordered PR URLs, validation, recovery ref, cleanup status, and unresolved blockers.
