# Senior backend / architect review — apps/api, apps/worker, packages, infra

Review as a senior backend architect responsible for uptime, data safety and response times. Formatting, lint, types, tests, coverage and migration drift are already enforced; look for what they cannot see.

## Architecture (DDD modular monolith, ports & adapters)

- Domain and application code depend on ports only; concrete adapters (Drizzle, S3, BullMQ, SMTP) are chosen in `src/composition/` alone.
- A bounded context reaches another only through its own port and a gateway in `infrastructure/gateways`, never by importing the other context's internals.
- Use cases return `Result`; failures are typed application errors, not thrown strings. Routes map them to the right HTTP status.
- New wiring is added to the module builder in `composition/`, so production and the demo both get it.

## Security

- Every new route is authenticated and passes the tenancy guard: one studio can never read or change another studio's shoots, photos, albums or links.
- Client links (review, pick, download): token and password checks, attempt limits, expiry.
- Input validated with zod at the boundary; no user text unescaped in emails/HTML (`escapeHtml`); no secrets in code, logs or error messages.

## Data

- Schema changes come with a migration that is safe on a live database (no long locks, no data loss); destructive steps are explicit and reversible.
- Nothing can delete or orphan a photographer's originals; storage and database stay consistent when a step fails halfway.

## Performance

- No N+1 queries, unbounded lists or full-table scans on request paths; pagination and indexes where data grows.
- Slow work (image processing, PDF, email) goes through the job queue, not the request.

## Reliability and logging

- Failures logged through the `Logger` port with context (ids, not personal data); anything that loses data or blocks a client is `error` level so it reaches the admin Errors tab and Sentry.
- Retries are idempotent; external calls have timeouts.

## CI and infrastructure

- Workflow changes keep secrets out of logs and forks; deploy steps fail loudly and can roll back.
