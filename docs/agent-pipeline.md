# Agent pipeline

```
/ship <task> ─► writer agent ─► pnpm verify ─► pull request ─► CI + reviewer agent ─► you merge (or not)
               (local, Claude Code)  (fix ≤3×)    (gh)          (GitHub Actions)        merge = deploy
```

| Stage | Where | What it does | Can it change `main`? |
|---|---|---|---|
| Writer | Claude Code, `/ship` (`.claude/skills/ship`) | Branches from `main`, writes the change with tests, asks first if it needs a design change | No |
| Quality gate | `pnpm verify` (`scripts/verify.sh`) | Prettier, ESLint, types, tests with ≥80% coverage, build, migrations | — |
| Pull request | `gh pr create` | Fills `.github/pull_request_template.md` | No |
| CI | `.github/workflows/ci.yml` | The same gates, plus Docker images and the end-to-end smoke test | — |
| Reviewer | `.github/workflows/agent-review.yml` | Reads the diff cold, comments inline, posts a verdict: ✅ READY, ⚠️ SUGGESTIONS or ⛔ BLOCKING (red check) | No — read and comment only |
| You | GitHub | Read the review, then merge or close | Yes |

Patterns: pipes and filters (each stage passes the work on or stops it), quality gate (one command, locally and in CI), maker–checker (the reviewer did not write the code and cannot change it), human-in-the-loop (only you merge).

## Guards against an agent merging

1. `.claude/settings.json` denies `gh pr merge`, `gh pr review`, `gh api`, force-pushes and pushes to `main` for every Claude session in this repo. Override in your own `.claude/settings.local.json` if you need `gh api` yourself.
2. Branch protection on `main` (below) rejects direct pushes — even from your own account, which is the one the agent uses.

## One-time setup

1. **GitHub CLI** — `brew install gh`, then `gh auth login` (GitHub.com, HTTPS, browser).
2. **Reviewer token** — run `claude setup-token` (uses your Claude subscription; install the CLI first with `npm install -g @anthropic-ai/claude-code` if `claude` is not found) and save it as the repository secret `CLAUDE_CODE_OAUTH_TOKEN`: GitHub → Settings → Secrets and variables → Actions → New repository secret. An `ANTHROPIC_API_KEY` secret works instead (billed per use). Without either, the reviewer step is skipped with a warning.
3. **Claude GitHub app** — install https://github.com/apps/claude on this repository, so the reviewer can comment.
4. **Branch protection** — require a pull request and green CI to change `main`, for admins too:

   ```sh
   gh api -X PUT repos/trutzzi/albums-design/branches/main/protection --input - <<'JSON'
   {
     "required_status_checks": {
       "strict": true,
       "contexts": [
         "Format, lint, types, tests + coverage, build",
         "Migrations match the schema",
         "End-to-end against the real stack"
       ]
     },
     "enforce_admins": true,
     "required_pull_request_reviews": null,
     "restrictions": null,
     "allow_force_pushes": false,
     "allow_deletions": false
   }
   JSON
   ```

   The agent review is deliberately not a required check: a ⛔ BLOCKING verdict shows red beside the merge button, but you can still merge if you disagree. Required approvals stay at 0 because GitHub does not let you approve your own pull request; pressing Merge is your approval.

## Daily use

```
/ship add a "duplicate album" button to the album list
```

The agent replies with the PR link. Within a few minutes the PR has CI results and the reviewer's comments. Then:

- **Merge** — it deploys.
- **Ask for changes** — tell Claude "address the review on PR #N" (it pushes to the same branch; the reviewer runs again).
- **Close** — nothing reaches `main`.

## Notes

- Coverage counts the code the tests load. Files no test imports — most React components — are not in the percentage, so it is a floor for tested modules, not a measure of the whole app.
- Prettier's one-time reformat is listed in `.git-blame-ignore-revs`; run `git config blame.ignoreRevsFile .git-blame-ignore-revs` once so `git blame` skips it (GitHub does automatically).
