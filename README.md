# AlbumFlow

[![CI](https://github.com/trutzzi/albums-design/actions/workflows/ci.yml/badge.svg)](https://github.com/trutzzi/albums-design/actions/workflows/ci.yml)

AI album-automation SaaS for wedding, baptism, and event photographers. See the [product & technical strategy doc](https://claude.ai/code/artifact/2ba90f17-7cfb-4af7-a79a-457e69237599) for vision, MVP scope, roadmap, risks, and pricing.

All eight epics from the roadmap are implemented: a photographer uploads culled selects, the pipeline scores and categorises every frame, an album is laid out automatically, the photographer edits it, the client reviews and approves it in the browser, and it exports as a print-ready PDF — metered against a subscription plan.

## Architecture

A modular monolith. Each bounded context is a module under `apps/api/src/modules/` with its own `domain / application / infrastructure / interface` layers. Contexts never reach into each other directly: they talk through ports (`application/ports/`) whose adapters live in the consumer's `infrastructure/gateways/`. The composition root (`apps/api/src/composition-root.ts`, with one wiring module per context under `apps/api/src/composition/`) is the only place that knows about concrete adapters, which is what lets the test suite swap the entire infrastructure layer for in-memory doubles.

| Context | What it owns |
|---|---|
| `identity` | Studios, API keys, members/roles, subscriptions, plan quotas |
| `media-ingestion` | Projects, photos, presigned uploads, the upload state machine |
| `photo-intelligence` | Quality scoring, orientation, category and face detection |
| `album-composition` | Albums, spreads, the layout template library, the planner |
| `review-collaboration` | Share tokens, client comments, approvals |
| `export-print` | Export jobs, print profiles, PDF rendering |

`apps/worker` is a second entrypoint into the same application core, not a parallel implementation — it builds the same composition root and drives the same use cases off BullMQ queues.

## How the interesting parts work

**Scoring** (`photo-intelligence/infrastructure/vision/sharp-image-inspector.ts`) is classical CV, no model required: variance of the Laplacian for sharpness, a luminance histogram with clipping penalties for exposure, and gradient-energy concentration near rule-of-thirds intersections for composition.

**Categorisation** sits behind the `VisionClassifier` port with two adapters. `HeuristicVisionClassifier` runs with zero credentials and never claims more than 0.5 confidence. `AnthropicVisionClassifier` calls Claude with a downscaled preview at low effort — expensive vision calls only make sense on the culled set, which is the cost control the strategy doc calls for. Switch with `VISION_PROVIDER`.

**Layout** (`album-composition/domain/layout-planner.ts`) sorts chronologically, groups frames into chapters on category change or a long pause, then selects within each chapter with a burst guard so five frames of one moment never land on one page. Templates are matched to each run of photos by orientation affinity and slot area, and the album opens on a full-bleed hero.

**Export** (`export-print/infrastructure/rendering/pdf-album-renderer.ts`) reads the same normalised slot geometry the editor renders on screen, so the PDF cannot drift from the approved preview. sharp does the cropping and resampling to the profile's DPI; pdf-lib sets MediaBox/TrimBox/BleedBox and draws trim marks.

## Quick preview (no Docker, no database)

```bash
npx pnpm@9.15.0 install
npx pnpm@9.15.0 demo      # starts the API (:4000) and the web app (:5173) together
```

Then open http://localhost:5173.

(If you have pnpm on your PATH, drop the `npx pnpm@9.15.0` for plain `pnpm` —
`brew install pnpm`, or `corepack enable` on Node 22–24, will put it there; Node 25
no longer ships corepack. Keep the `@9.15.0`
when going through `npx`: a bare `npx pnpm` fetches the newest major, which doesn't
match the version the lockfile and `packageManager` pin. Everything below assumes the
plain `pnpm` form.)

Demo mode swaps Postgres, Redis and S3 for the in-memory adapters the test suite
uses, serves uploaded bytes from the API's own `/dev-storage` routes, and runs
analysis and PDF rendering inline instead of on a queue. Everything else — scoring,
layout, the editor, the client portal, PDF export — is the real code path. A demo
studio, project and API key are created at boot, and `apps/web/.env` is already
pointed at them. Restarting wipes all data.

Drop a folder of real JPEGs on the project page: the scoring is genuine, so actual
photographs demo it far better than synthetic ones.

## Running the full stack

Requires Node 22+, [pnpm](https://pnpm.io), and Docker Desktop. Use this when you want real persistence, the separate worker process, and MinIO standing in for S3 — i.e. the shape it actually deploys in.

```bash
cp .env.example .env
pnpm install

docker compose up -d postgres redis minio minio-init

pnpm db:generate && pnpm db:migrate
pnpm db:seed          # prints a studio API key — put it in apps/web/.env

cp apps/web/.env.example apps/web/.env   # then paste the key into VITE_STUDIO_API_KEY
pnpm dev              # API + worker + web app together
```

The API, worker and database scripts read the root `.env` themselves, so nothing
needs exporting first; a variable already set in your shell wins over the file. To run
one process on its own, use `pnpm dev:api`, `pnpm dev:worker` or `pnpm dev:web`.

- Studio app: http://localhost:5173
- API: http://localhost:4000/health
- MinIO console: http://localhost:9001 (`albumflow` / `albumflow123`)

Drop JPEGs on the project page, wait for scores to appear, hit **Generate draft**, edit the spreads, create a client share link, approve it from that link, then export a PDF.

To run the whole stack containerised instead: `docker compose up --build`.

## Tests

```bash
pnpm test
```

52 tests, no Docker required — the suite replaces Postgres, S3, and Redis with in-memory adapters and exercises the real use cases. It covers the layout algorithm, aggregate invariants, plan quotas, the multi-tenant HTTP boundary, real image analysis through sharp (a blurred frame must score materially lower than a crisp one), and a full pipeline run that ends by parsing the produced PDF and asserting its page count and physical spread dimensions.

## Security notes

Auth is a studio-scoped API key (`Authorization: Bearer af_…`); only the hash is stored, and Clerk can replace `interface/auth.ts` without touching anything else. A tenancy guard (`interface/tenancy.ts`) resolves whatever resource a route addresses back to its owning studio and answers 404 on a mismatch, so a new route cannot forget the check. Client review links are separate: a random token, stored only as a SHA-256 hash, scoped to one album, with an expiry.

## Not built yet

An ESLint config, Terraform for cloud deploy, and a bundled sample shoot for first-time users (the onboarding checklist is there; the sample photos are not).

## Operating it

- **Payments:** `BILLING_PROVIDER=stripe` sells the paid plans through Stripe Checkout and the Customer Portal; see `.env.production.example` for the dashboard setup. Without it, plans switch freely (local and demo).
- **Admin dashboard:** members whose email is in `ADMIN_EMAILS` get `/admin` — the in-app feedback inbox, business metrics (MRR, trial→paid, activation funnel, 30-day activity) and server health (database, queues, request rate, p95 latency, recent errors).
- **Backups:** nightly Postgres dumps with an off-site copy on DigiStorage — see [docs/backups.md](docs/backups.md).
- **Error monitoring:** set `SENTRY_DSN` (API and worker) and the `VITE_SENTRY_DSN` build secret (web). Code logs through the `Logger` port (`shared-kernel/logger.ts`): pino JSON lines, level set by `LOG_LEVEL`, and every `error` entry is also sent to Sentry. Each response carries an `x-request-id` (kept from the caller when well-formed) that appears on its log lines, its Sentry event and in a 500's body. Client-link tokens and query strings never reach the log.
