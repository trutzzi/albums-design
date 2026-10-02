---
name: ship
description: Agent pipeline, writer stage — implement a task on a new branch, pass the quality gate (pnpm verify), and open a pull request for the reviewer agent and the owner. Never merges.
argument-hint: <what to build or fix>
disable-model-invocation: true
---

# /ship — write, verify, open a PR

Task: $ARGUMENTS

You are the **writer** in this repository's agent pipeline:
**write → verify → PR → reviewer agent → the owner decides**.
Your job ends when the pull request is open. You never merge, approve, push to `main`, or force-push.

## 1. Start clean

- `gh auth status` must succeed. If it does not, stop and tell the owner to run `! gh auth login`.
- `git status --porcelain` must be empty. If it is not, stop and ask what to do with those changes; never stash or discard them yourself.
- `git fetch origin` then branch from the latest `main`: `git switch -c agent/<short-kebab-summary> origin/main`.

## 2. Understand before writing

- Read `CLAUDE.md` and the code the task touches; follow the patterns already there.
- If the task is ambiguous, or doing it well needs a design change (a new pattern, a new dependency, a schema change, a visible UX change), stop and ask first: describe the change, name the design pattern, and wait for approval. Keep every existing feature working.

## 3. Write the change with its tests

- Every behaviour you add or fix gets a test that would fail without your change (API: `apps/api/test/*.test.ts`; web logic: `src/**/*.test.ts` beside the code).
- Errors on critical paths are logged through the `Logger` port with context, never swallowed.
- A Drizzle schema change ships with its migration (`pnpm db:generate`).
- Comments explain *why*, never restate the code.

## 4. Pass the quality gate

Run `pnpm verify --fix` (if `pnpm` is missing: `npx -y pnpm@9.15.0 verify --fix`). It checks format, lint, types, tests with ≥80% coverage, build and migrations, and lists every failing step.

- On failure: fix the cause (never by deleting or weakening a test, lowering a threshold, or adding an eslint-disable without a written reason), then run it again.
- At most **3** fix rounds. Still red after that: stop, do not open a PR, and report what fails and why.

## 5. Check your own diff

`git diff origin/main...HEAD` (plus uncommitted work). Remove anything unrelated to the task, debug output, and commented-out code. No secrets, tokens or `.env` values.

## 6. Commit, push, open the PR

- Commit with a message that says what changed and why; end it with the attribution trailer this session uses.
- `git push -u origin HEAD`
- `gh pr create --base main --title "<what it does>" --body-file <file>`, filling in `.github/pull_request_template.md`: summary, why, design and pattern, how it was verified (the `pnpm verify` result), risks and how to roll back.

## 7. Hand over

Reply with the PR link and a three-line summary. Say that the reviewer agent will comment on the PR within a few minutes, and that merging is the owner's call. Do not wait for or act on the review unless asked.
