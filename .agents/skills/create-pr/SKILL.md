---
name: create-pr
description: Create or update GitHub pull requests and PR stacks with illustrated Vinci changelog entries and pre-merge previews. Also use for changelog-only requests about main, a PR, or a Git range.
---

# Create a PR

Open one PR for a small, cohesive change. Use a stack when the user requests one or when separate changes can be reviewed and verified independently in dependency order.

For a changelog-only request, follow the [changelog workflow](references/changelog.md) for the requested range and stop after verifying the entry. Publishing a PR is a separate request.

## 1. Capture the source

Inspect repository instructions, working tree, branch, remotes/upstream, commit graph, and existing PRs. Resolve the repository, target, and source range; inspect PR bases for existing stacks. Ask only when ambiguity changes the included work.

Work from a feature branch; identify it before rewriting a target branch or detached checkout. An explicit workflow request authorizes regrouping commits, pushing stack branches, and creating PRs. Automatic skill selection supplies no authorization to rewrite or publish.

Fetch relevant refs. Record source and target tips, merge-base, and remote OIDs for branches that may change. Capture the complete committed net diff, including merges. Include uncommitted work only when requested; preserve tracked and untracked contents separately and capture a source snapshot.

Inventory temporary worktrees, branches, captures, scratch files, processes, and services by ownership so cleanup preserves pre-existing work.

**Done:** source range, target, remote state, and preserved local work are recorded.

## 2. Choose one PR or a stack

Read the entire net diff and necessary surrounding code. If the change answers one review question, keep it in one PR even when it spans several commits or files. Use the existing feature branch when its diff matches the intended scope. Continue at **Prepare the changelog**.

For a stack, group by behavior or prerequisite, using original commits as evidence. Squash fixups, split mixed changes by hunks where useful, and keep generated files and lockfiles with their cause.

Order prerequisites before consumers. Prefer one focused commit per PR; roughly 100–300 non-generated changed lines is a planning cue, with cohesion and working intermediate states taking priority. Explain larger batches.

Include affected documentation and agent instructions in the batch that changes their subject: app boundaries, setup, runtime, deployment, and user behavior. State deliberate deployment gaps and assign follow-up work.

Present a compact ordered plan, then continue. Assign every source change to a batch with a purpose, commit title, dependency, validation, review question, and suitable visual.

**Done:** the batches cover the complete change and each has a coherent review boundary.

## 3. Reconstruct and verify the stack

Create a unique backup ref at the original feature tip and reconstruct in an isolated worktree. Build a fresh linear sequence from the captured merge-base. Preserve attribution and required commit trailers. Create a branch at each PR boundary: each adds one batch to its predecessor. Retain the original feature branch and backup unless replacement was requested.

At each boundary, inspect the incremental diff and run relevant checks from the owning app. Definitions must precede consumers, migrations must match code, and tests must remain meaningful. Move changes between batches to repair split-induced failures. Record pre-existing failures and unavailable checks separately.

Require `git diff --exit-code <source-tip> <stack-tip>` to pass, preserving contents, modes, additions, and deletions. When including uncommitted work, compare against its captured snapshot. Verify boundary ancestry, account for the complete change across incremental diffs, and run final feature checks.

If target updates require rebasing, retain the verified reconstruction first. Rebase the whole stack coherently and recheck every boundary and the combined result. Compare the old and rebased series with `git range-diff`; review conflict resolutions and account for differences caused by target updates. Tree equality with the old source no longer applies.

**Done:** the complete feature is preserved, every boundary is coherent, and validation is recorded.

## 4. Prepare the changelog

Review the net change against the existing notes. For each new outcome readers can use, include its [GitHub Pages changelog entry](references/changelog.md) and media in the PR that delivers it. For a stack, assign each outcome once. On a PR update, revise its existing entry and preview to match the new head. Mechanical changes with no new outcome need no entry.

For a reconstructed stack, account for newly authored changelog files and media separately from the verified source diff. Run the relevant checks before publishing.

## 5. Publish

Check GitHub authentication, repository, branch names, and existing PRs. Reuse matching PRs and preserve their discussion and human-written context. Update only this feature's branches and PRs.

Push a standalone branch normally. For a stack, push in dependency order, preferring fresh names and ordinary pushes. An authorized replacement of a published branch requires `--force-with-lease=<ref>:<captured-remote-oid>`. On lease failure, inspect and integrate remote work, or confirm authority to replace it, before capturing a new expected OID. Never force-push the target branch.

Base a standalone PR or the first PR in a stack on the target. Base each successor on its predecessor. Check that each Files changed view contains its intended scope. Follow repository draft conventions; otherwise publish ready PRs after successful validation and drafts when required checks remain unresolved.

### Copy and visuals

Write PR titles independently from commit titles. For a chain of two or more PRs, use `[n/N]` plus a short topic, such as `[5/9] Durable indexing`. Standalone PRs use the short topic alone.

Lead with one sentence explaining what someone can now do. Show how it works through one concrete example. For a data model, a small table of actual columns can explain storage. For an API, show a real method, path, payload and the relevant part of the response. Use plain language and keep setup, risks and verification to the details reviewers need. Honor the repository template without repeating the same point across sections.

Every PR needs a visual that answers its review question. For a new feature, illustrate the model, interaction or result directly. Use a before/after comparison or diff when both states exist and the difference explains the change. For example, one labeled relation between a person and a company explains a new data model; a diff of an existing endpoint's response explains a contract change.

For a changelog entry, link to the Markdown on the PR branch and embed a screenshot of the **rendered docs page** in the description. Reviewers must be able to see it before merge. The preview can serve as the PR visual. Refresh it when the example, diagram or entry changes. If capture or upload fails, show a verified diagram, table or excerpt inline, retain the branch link, and disclose the preview gap.

When creating, attaching, or updating image/video visuals, read [Native PR media](references/pr-media.md) for capture framing, native uploads, stable URLs, and inline playback verification.

### Navigation and readback

For multi-PR chains, once URLs exist, put position, ordered links, dependencies, and merge instructions in a collapsed `<details>` block, e.g. `Review order · 5/9`. Explain merge order and the need to check/restack remaining bases after predecessor merges, especially squash/rebase merges.

Read back every URL, base, head, body, and diff. Verify target/predecessor bases, remote heads against local branches, and that incremental diffs account for each batch exactly once. Resume partial publication from the missing step, retaining existing PRs.

Assess the title, opening sentence, and visual together: do they explain this PR's purpose? Check accuracy, legibility, useful context, and actual rendering. Confirm required media verification from the reference is complete.

**Done:** each PR has the correct base and a useful rendered visual. A stack also has review-order links.

## 6. Clean up

Clean up before returning, including after partial failure. Preserve recovery refs, published branches and visuals, pre-existing user work, and any unfinished reconstruction needed for recovery.

Use the ownership inventory to stop this run's processes/services, using repository lifecycle hooks where available. Remove temporary prototypes, scratch files, verified local captures, and reconstruction-only branches whose commits remain reachable. Inspect unexpected dirty worktree contents and save valuable work before removal; avoid forced removal of unexamined work. Verify the temporary directory and worktree registration are gone.

**Done:** temporary resources are removed, published PRs/media remain accessible, and the original checkout's unrelated edits are intact. Report cleanup failures as unfinished work.

Return the PR URL or ordered stack URLs, validation, any recovery ref, cleanup status, and unresolved blockers.
