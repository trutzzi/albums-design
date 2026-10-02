# AlbumFlow — notes for agents

Photographers upload a shoot, clients pick photos, an album is generated and edited, reviewed by the client, then exported as a print PDF and delivered.

## Commands

- `pnpm verify` — the quality gate: format, lint, types, tests with ≥80% coverage, build, migrations. `--fix` formats and auto-fixes first. If `pnpm` is not installed: `npx -y pnpm@9.15.0 <script>`.
- `pnpm test` / `pnpm test:coverage`, `pnpm typecheck`, `pnpm lint`, `pnpm format`
- `pnpm db:generate` after any Drizzle schema change; commit the migration it writes.
- `pnpm demo` — the API on in-memory adapters plus the web app, no Docker needed.

## Layout

- `apps/api` — Fastify API, a DDD modular monolith with ports & adapters. Each bounded context in `src/modules/<context>/{domain,application,infrastructure,interface}`. Use cases depend on ports only; concrete adapters are chosen in `src/composition/` (production: `infrastructure.ts`; demo: `src/dev/in-memory-infrastructure.ts`). Use cases return `Result`. Import across the app with `#src/...`.
- `apps/worker` — BullMQ jobs, built from the same composition root.
- `apps/web` — React + React Query. `app/` (shell), `shared/` (ui, album renderer, api client, i18n, lib), `features/<name>/{components,hooks,lib}`. Import with `@/...`. Every user-facing string goes through `t()` with keys in both `shared/i18n/en.ts` and `ro.ts`.
- `packages/contracts` — DTOs and zod schemas shared by API and web.

## Conventions

- Tests use Node's test runner (`node --test`): API tests in `apps/api/test/`, web logic tests beside the code as `*.test.ts`.
- Log failures through the `Logger` port with context; `error` level reaches the admin Errors tab and Sentry.
- Comments explain why, not what. Keep every existing feature working.
- Review standards — for writing and reviewing alike — are in `.github/review-checklists/`: `frontend.md` (apps/web), `backend.md` (everything else), `clean-code.md` (every change; suggestions, never blocking).
- Before a design change (new pattern, dependency, schema or visible UX change): describe it, name the pattern, ask the owner.
- Agents never merge, approve, push to `main` or force-push; the owner merges, and merging to `main` deploys.
