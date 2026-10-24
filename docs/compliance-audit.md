# AlbumFlow — security and compliance audit (Phase 1)

> **Status:** audit only. No code was changed. This is an engineering review, **not legal advice**.
> Every legal point cites the provision it rests on so a lawyer can check it quickly; items marked
> ⚖️ need a lawyer (or an accountant) before anything is built.
>
> **Date:** 2026-10-25 · **Commit audited:** `802022a` (main) · **Operator:** Romania, EU customers.

## How this was done, and its limits

- Read the API (`apps/api`), worker, web app (`apps/web`), contracts, infra (`infra/`,
  `docker-compose*.yml`, `infra/caddy/Caddyfile`), CI (`.github/workflows`) and the docs.
- Ran `pnpm licenses list --prod` and `pnpm audit --prod` locally.
- **Not done:** no requests were sent to the production servers (`api.`, `storage.`,
  `app.valentintruta.ro`). Findings about production are read from the deploy files; each one
  that matters says how to confirm it on the server. The server's own `.env` and the GitHub
  secrets were not visible, so the effective values of `VISION_PROVIDER`, `EMAIL_PROVIDER`,
  `SENTRY_DSN` (and its region) and `BILLING_PROVIDER` are unknown — findings that depend on them
  say so.
- Contracts with processors (Stripe, Sentry, Anthropic, Cloudflare, Digi, Cloudify, the cPanel
  host) were not seen. Transfer statuses are what is publicly known as of this audit and **must
  be checked** (e.g. on dataprivacyframework.gov) before relying on them.

Severity: **High** = can expose personal data or bring a fine or lawsuit now; **Med** = a real gap
that needs a specific trigger, or a missing legal duty with moderate exposure; **Low** = hardening
or a best practice. Effort: **S** ≤ ½ day, **M** 1–2 days, **L** 3+ days (developer time only).

---

## 1. Ranked findings

| # | ID | Finding | Risk | Effort | Who |
|---|----|---------|------|--------|-----|
| 1 | SEC-01 | Production photo bucket is **publicly readable** | High | S | Dev |
| 2 | SEC-02 | Unauthenticated `POST /studios` hands out API keys and lets anyone **pre-claim any email** | High | S | Dev |
| 3 | LEG-01 | **No** Privacy Policy, Terms, imprint, DPA or cookie notice anywhere in the app | High | L | ⚖️ + Dev |
| 4 | GDPR-01 | "Photos are **never sent to a third party**" is true in production (`heuristic`) but would silently become false if `VISION_PROVIDER=anthropic` | Low-Med | S | Dev |
| 5 | SEC-03 | Roles not enforced; member emails not unique; removed members keep a **30-day** token | High | M | Dev |
| 6 | SEC-04 | Image libraries with **high CVEs** process untrusted uploads; upload size/type only declared, never checked | High | S–M | Dev |
| 7 | GDPR-02 | No self-service erasure or export; no retention limit on shoots; Stripe data left after deletion | Med-High | M–L | Dev + ⚖️ |
| 8 | SEC-05 | With `EMAIL_PROVIDER=none` (the default) **reset links and client passwords go to the logs** | Med-High | S | Dev |
| 9 | GDPR-03 | Google Fonts loaded from Google's CDN sends every visitor's IP to Google | Med | S | Dev |
| 10 | SEC-06 | No CSP / HSTS / anti-framing headers on the web app, API or storage | Med | S | Dev |
| 11 | OPS-01 | Containers run as root; deploys as root over SSH; web deployed over **plain FTP**; backups unencrypted | Med | M | Dev |
| 12 | GDPR-04 | No breach procedure, no security audit log | Med | M | Dev + ⚖️ |
| 13 | LEG-02 | DSA notice-and-action, infringement contact, CSAM process missing | Med | M | ⚖️ + Dev |
| 14 | LEG-03 | Checkout: no ToS acceptance, VAT not shown, no e-Factura path | Med | M | ⚖️ / accountant |
| 15 | SEC-07 | Other dependency CVEs (drizzle-orm, fastify, nodemailer, zod) | Med | M | Dev |
| 16 | A11Y-01 | WCAG 2.1 AA gaps (contrast, `lang`, clickable `div`s) | Med | M | Dev + ⚖️ (scope) |
| 17 | GDPR-05 | Sentry: browser events can carry client share-link URLs; region unknown | Low-Med | S | Dev |
| 18 | GDPR-06 | Special-category risk: baptism/religious ceremonies, children | Low-Med | — | ⚖️ |
| 19 | LEG-04 | Copyright: no licence clause, no client usage/print release | Low-Med | — | ⚖️ |
| 20 | SEC-08 | Legacy `VITE_STUDIO_API_KEY` secret still injected into web builds | Low | S | Dev |
| 21 | SEC-09 | Smaller hardening items (JWT in localStorage, Turnstile fail-open, in-memory limits, log rotation) | Low | S–M | Dev |

What is already good (keep it): share links use 192-bit random tokens, stored only as SHA-256
hashes, expiring, revocable and password-protected with lockout
(`review-session.ts:61`, `client-access.service.ts`); a generic tenancy guard checks every
`:projectId/:photoId/:albumId/:exportJobId` route (`interface/tenancy.ts:72`); scrypt password
hashing with timing-safe compare; HS256 JWT with the algorithm pinned; log redaction of tokens,
passwords and share-link paths (`pino-logger.ts:14-66`); `sendDefaultPii: false` in Sentry;
derivatives are re-encoded by sharp, which strips EXIF/GPS; Postgres/Redis/MinIO ports closed in
production; ufw + fail2ban on the VPS; a thorough project deletion (`delete-project.use-case.ts`);
unconfirmed signups purged after 48 h; licences clean (see §6.2).

---

## 2. Security findings (OWASP ASVS / Top 10)

### SEC-01 — Production photo bucket is publicly readable · **High** · S

- **Evidence:** `docker-compose.prod.yml:45` runs `mc anonymous set download local/albumflow-photos`
  (same in `docker-compose.yml:61`), and `infra/caddy/Caddyfile:15-17` exposes MinIO publicly as
  `storage.valentintruta.ro`.
- **Why it matters:** every object — full-resolution originals (with camera EXIF, which can include
  GPS location), previews, and exported album PDFs — can be fetched with no signature. Anyone who
  ever saw one presigned URL (a client, a forwarded email, browser history, a Sentry breadcrumb)
  can drop the `?X-Amz-…` query string and keep the photo forever, so link expiry and revocation
  give no protection. MinIO's `download` policy normally also grants `s3:ListBucket`, which would
  let anyone list **every studio's** photos; confirm on the server with an anonymous
  `curl -s https://storage.valentintruta.ro/albumflow-photos/` (an XML listing means it is open).
  Breach of GDPR Art. 5(1)(f) and Art. 32; if anyone has accessed it, it is a personal-data breach
  under Art. 4(12) with the Art. 33 72-hour clock running from when you become aware of it.
- **Fix:** replace with `mc anonymous set none` (prod and dev, so dev matches prod). Every read path
  already uses presigned URLs (`s3-object-storage.ts:61`, `s3-export-storage.ts:24`,
  `photo-preview-resolver.ts:34`), so no feature changes. Add a CI smoke check that an unsigned GET
  answers 403. Then check MinIO/Caddy access logs for unsigned GETs to decide whether Art. 33/34
  notification is needed (⚖️).

### SEC-02 — Unauthenticated `POST /studios`: free API keys and email squatting · **High** · S

- **Evidence:** `interface/auth.ts:41` makes `POST /studios` public;
  `studio-administration.use-case.ts:53-69` creates a studio and an OWNER member for **any**
  `ownerEmail`, without verification, Turnstile or rate limit, and returns a permanent API key.
  The web app never calls it (only `test/http-security.test.ts:67`).
- **Attack:** an attacker creates a studio with `victim@photo.ro` and keeps the API key. When the
  real photographer tries to sign up, `register.use-case.ts:69` answers "already registered"
  (the squatted member has no password), so they use "forgot password", which sets a password on
  the attacker-created member (`password-reset.use-case.ts:54-94`). The photographer now uploads
  client photos into a studio the attacker reads with the API key. Even without a victim it is
  unlimited unverified accounts with storage (abuse, illegal-content hosting).
- **Fix:** remove the route, or restrict it to platform admins. Revoke API keys of studios created
  through it (they have no `password_hash` on their OWNER and were not made by `/auth/register`).
  Art. 32; ASVS V2 (authentication), V4 (access control).

### SEC-03 — Authorisation and session gaps · **High** · M

1. **Roles are not enforced.** Only branding and billing check the role
   (`identity/interface/http/routes.ts:128,146`). A VIEWER can invite members (as OWNER too,
   `routes.ts:116-122`), remove members, delete shoots and albums, and reveal client link passwords.
2. **Member emails are not unique.** `studio_members.email` has no unique index
   (`identity/infrastructure/persistence/schema.ts:42`), `inviteMember` accepts an email already used
   in another studio and does not lowercase it (`studio-administration.use-case.ts:120-149`), and
   `findByEmail` takes an arbitrary row with `limit(1)` (`drizzle-studio-repository.ts:180`). Login
   and password reset can therefore land on the wrong account; any studio can invite a stranger's
   email and break that person's login.
3. **Tokens outlive access.** Login JWTs last 30 days (`login.use-case.ts:13`); the auth hook trusts
   `studioId`/`role` in the token without checking the member still exists (`auth.ts:72-77`).
   A removed member, a deleted studio, or a password reset does not end existing sessions.
4. **One secret, no audience.** Session, email-confirmation and reset tokens share `JWT_SECRET` and
   are told apart only by the presence of `studioId`/`purpose`. Not exploitable today; fragile.

- **Fix:** a role policy per route (OWNER/EDITOR/VIEWER matrix), a unique index on lower(email)
  (**schema change — needs your approval**), a `tokenVersion` (or `sessionsValidAfter`) per member
  checked in the auth hook and bumped on removal/reset/role change, `aud` claims on every token.
  Art. 25, 32; ASVS V3, V4.

### SEC-04 — Untrusted image processing · **High** · S–M

- **Evidence:** `pnpm audit` reports three **high** advisories for `sharp` <0.35.5 (libvips,
  libheif, librsvg CVEs); the API is on `^0.33.5` (`apps/api/package.json:49`). Every uploaded
  photo and studio logo is decoded by sharp in the worker. `requestUploadSchema` limits the
  *declared* size to 75 MB and type to an enum (`packages/contracts/src/media-ingestion.ts:8-12`),
  but the presigned PUT does not bind Content-Length (`s3-object-storage.ts:47-54`) and
  `confirm-upload.use-case.ts:42-49` accepts whatever size landed, with no magic-byte check.
  Decoding uses `failOn: "none"` in several places.
- **Fix:** upgrade sharp to ≥0.35.5; reject at confirm when `head.byteSize` exceeds the limit or the
  first bytes are not JPEG/PNG/TIFF/HEIC/WebP; set an explicit `limitInputPixels` (e.g. 150 MP)
  everywhere sharp is called. Malware scanning (ClamAV) adds little for images that are always
  re-encoded and never served back as originals to the studio's browser — I'd skip it; your call.

### SEC-05 — Email fallback writes secrets to the logs · **Med-High** · S

- **Evidence:** `infrastructure/email/logging-email-sender.ts:10-16` logs the full `text` of every
  email when `EMAIL_PROVIDER=none`, which is the production default until the secret is set
  (`docs/deploy-valentintruta.md`, step 2c). The text contains password-reset and confirmation
  links and the client link **passwords**; the pino redaction does not cover `text`.
- **Fix:** in production, refuse to start with `EMAIL_PROVIDER=none` or log only recipient domain +
  subject. Rotate anything that may have been logged. Art. 32.

### SEC-06 — Missing security headers · **Med** · S

- **Evidence:** `apps/web/public/.htaccess:38-39` sets only `X-Content-Type-Options` and
  `Referrer-Policy`. No `Content-Security-Policy`, no `Strict-Transport-Security`, no
  `frame-ancestors`/`X-Frame-Options`. The API sets none (`server.ts`), nor does Caddy
  (`Caddyfile:11-17`).
- **Why:** without anti-framing, the client review page's "Approve" can be click-jacked; without CSP,
  any XSS reads the 30-day token from `localStorage`. HSTS stops TLS stripping on first visits.
- **Fix:** CSP allowing self, the API origin, the storage origin, `challenges.cloudflare.com` and
  the Sentry ingest host; `frame-ancestors 'none'`; HSTS (start at `max-age=300`, then a year);
  `Permissions-Policy`. Same headers via Caddy for the API and storage. Test in report-only mode
  first so nothing breaks.

### SEC-07 — Other dependency CVEs · **Med** · M

`pnpm audit --prod`: 21 advisories (5 high, 11 moderate, 5 low).

| Package | Installed | Fixed in | Severity | Note |
|---|---|---|---|---|
| sharp | 0.33.x | ≥0.35.5 | high ×3 | see SEC-04 |
| drizzle-orm | 0.38.x | ≥0.45.2 | high | SQL injection via identifiers; app uses no dynamic identifiers, so low exploitability, but upgrade |
| zod | 3.x | ≥4.6.6 | high | memory exhaustion on oversized collections; zod 4 is a **major** upgrade across API, web and contracts |
| fastify | 5.12.3 | ≥5.12.6 | moderate/low | DoS and header-validation bypass |
| nodemailer | <10.1.4 | ≥10.1.4 | moderate ×3 | address-parser issues; recipients are studio-entered |
| fast-uri (via fastify) | 3.1.7 / 4.1.4 | 3.1.9 / 4.2.3 | moderate/low | transitive; fixed by the fastify bump or an override |

Add `pnpm audit --prod --audit-level high` to `pnpm verify`/CI so this does not drift again.

### SEC-08 — Legacy studio API key in web builds · **Low** · S

`.github/workflows/ci.yml:457-458` still injects `VITE_STUDIO_ID`/`VITE_STUDIO_API_KEY`. The code
no longer reads the key (only declared in `vite-env.d.ts:5`), so Vite does not bundle it today, but
one stray `import.meta.env.VITE_STUDIO_API_KEY` would publish a full-access key. Delete the secret,
the type, and rotate that studio's API key.

### SEC-09 — Smaller hardening items · **Low**

- Login token in `localStorage` (`auth-storage.ts:37`): acceptable with a strict CSP (SEC-06);
  HttpOnly cookies would need a same-site API (design change).
- Turnstile only on signup and fails open when Cloudflare is unreachable (`human-check.ts:41-44`);
  login/forgot/unlock rely on in-memory limiters that reset on every deploy (`attempt-limiter.ts:2-5`).
- No general per-IP rate limit (e.g. `@fastify/rate-limit` — new dependency, needs approval).
- Docker's default `json-file` log driver has no rotation: access logs with IPs are kept forever
  (also GDPR Art. 5(1)(e)). Set `max-size`/`max-file`.
- Originals keep EXIF/GPS. Needed for print and delivered to the client who is in them, so fine once
  SEC-01 is fixed; mention it in the privacy policy.
- CORS is correctly limited to `WEB_ORIGIN` (`server.ts:20`). CSRF does not apply (Bearer header, no
  cookies). No SSRF surface (no user-supplied URLs are fetched). No `dangerouslySetInnerHTML`.

### OPS-01 — Infrastructure and deploy · **Med** · M

| Item | Evidence | Fix |
|---|---|---|
| Containers run as root, with dev tooling (`tsx` at runtime) | `infra/docker/api.Dockerfile`, `worker.Dockerfile`: no `USER` | `USER node`, prune dev deps, read-only root fs where possible |
| Deploy user is `root`; key in a GitHub secret | `docs/deploy-valentintruta.md` §5 `SSH_USER=root`, `ci.yml:341-357` | a `deploy` user in the `docker` group; `PermitRootLogin no`, `PasswordAuthentication no` (not set in `provision-server.sh`); pin the host key |
| Web deployed over **plain FTP** (credentials and files in clear text) | `ci.yml:468` `FTP-Deploy-Action` with no `protocol:` (defaults to `ftp`) | `protocol: ftps` |
| Off-site DB dumps unencrypted (emails, password hashes, client names/emails) | `offsite-database-backups.ts:43`, `infra/backup/db-backup.sh` | encrypt with `age`/GPG before upload; key kept off the server |
| Restore test is manual, no record that it happened | `docs/backups.md` "Test a restore" | a scheduled CI job that restores the newest dump into a scratch Postgres and counts rows |
| Unused Fly config still in repo | `infra/fly/fly.toml` | delete, or mark clearly, to avoid a second, un-hardened deploy path |

---

## 3. GDPR / data protection

### 3.1 Personal-data map

| Data | Whose | Where it lives | Leaves the EU? |
|---|---|---|---|
| Name, email, password hash, role | Photographers & team | Postgres (VPS, Cloudify, Timișoara) + DB dumps (VPS, DigiStorage) | No |
| Studio branding, logo | Photographers | Postgres | No |
| **Photos** (faces, children, ceremonies, EXIF incl. GPS) | Clients, guests, children | MinIO (VPS); DigiStorage (all originals when `LONG_TERM_ORIGINALS=all`); export PDFs | Only to Anthropic, when AI is used with `VISION_PROVIDER=anthropic` (640 px downscale) |
| Photo analysis: category, face **count**, face quality, histogram, capture time | Same | Postgres | No |
| Client name, client email, picks, comments, approval, download counts | Clients | Postgres | No |
| IP addresses | Everyone | API access logs (stdout/Docker, no rotation); login/signup limiters (memory); Turnstile; Google Fonts; cPanel access logs; Sentry | Google, Cloudflare, Sentry (US companies) |
| Error events (stack, request id, route, context) | Mostly none; can include ids | `error_log` table (30 days) + Sentry | Sentry (region unknown) |
| Billing: email, card, invoices | Photographers | Stripe | Stripe (US/IE) |
| Emails sent (reset, confirmations, client invitations, notifications) | Both | SMTP at the cPanel host | No |
| Feedback messages | Photographers | Postgres | No |

**Face analysis is not facial recognition.** The classifier counts faces and rates "eyes open / in
focus" (`anthropic-vision-classifier.ts:24-37`, `vision-classifier.ts:7-9`); the heuristic uses a
skin-tone ratio (`sharp-image-inspector.ts:213`). Nothing identifies or matches a person, so this
is most likely **not** biometric data under GDPR Art. 4(14) / Art. 9 (EDPB Guidelines 3/2019 draw
the same line between detection and identification). Keep it that way: any future "find all photos
of the bride" feature would be Art. 9 processing and need a DPIA (Art. 35) and explicit consent.

### 3.2 Roles: who is controller

- **Client photos and client contact data:** the photographer is the **controller**; AlbumFlow is a
  **processor** (Art. 4(7)-(8), Art. 28). Art. 28(3) requires a written processing agreement
  (DPA) — today there is none. It must list sub-processors (Art. 28(2), (4)).
- **Photographer accounts, billing, security logs, service emails:** AlbumFlow is the **controller**.
- **Stripe** acts partly as an independent controller (fraud, its own legal duties) — ⚖️ confirm.

### 3.3 Draft Record of Processing Activities (GDPR Art. 30) — TEMPLATE

> TEMPLATE for the lawyer / DPO to complete. `[…]` = to fill in.
> Controller: `[COMPANY NAME]`, CUI `[CUI]`, `[ADDRESS]`, contact `[PRIVACY EMAIL]`. DPO: `[name or "not designated" + reason]`.

**A. As controller (Art. 30(1))**

| Purpose | Data subjects | Data | Legal basis | Recipients / processors | Retention | Transfer |
|---|---|---|---|---|---|---|
| Account & service delivery | Photographers, team | name, email, password hash, role | Art. 6(1)(b) contract | Cloudify (hosting), cPanel host (SMTP) | account lifetime + `[N]` days | — |
| Billing & invoicing | Paying photographers | name, email, billing details, invoices | Art. 6(1)(b), 6(1)(c) (Romanian tax/accounting law) | Stripe | `[10 years — Legea 82/1991, ⚖️ confirm]` | Stripe (DPF/SCC ⚖️) |
| Security, abuse prevention | All users | IP, request logs, login attempts, Turnstile result | Art. 6(1)(f) legitimate interest | Cloudflare (Turnstile), Sentry | logs `[30–90]` days | US (DPF/SCC ⚖️) |
| Error monitoring | All users (incidental) | error context, request id, IP (Sentry) | Art. 6(1)(f) | Sentry | `[30–90]` days | `[US or EU region]` |
| Product feedback & support | Photographers | feedback text, email | Art. 6(1)(f) | — | `[N]` months | — |
| Website delivery (fonts) | Visitors | IP | none today → fix GDPR-03 | Google | — | US |

**B. As processor for studios (Art. 30(2))**

| Category of processing | Controller | Data subjects | Data | Sub-processors | Security measures |
|---|---|---|---|---|---|
| Hosting & editing of shoots, albums, exports | each studio | clients, guests, **children** | photos, EXIF, analysis | Cloudify (VPS), Digi/DigiStorage (long-term storage + backups), Anthropic (only if AI enabled) | Art. 32 list `[from §2 once fixed]` |
| Client portal (picks, review, download) | each studio | clients | name, email, picks, comments, IP | cPanel host (static app, SMTP) | hashed tokens, passwords, expiry |
| Email on the studio's behalf | each studio | clients | name, email | cPanel host SMTP | TLS `[confirm]` |

### 3.4 Findings

#### GDPR-01 — "Never sent to a third party" claim depends on configuration · **Low-Med** · S

> **Update 2026-10-25:** the owner confirmed production runs `VISION_PROVIDER=heuristic`, so no
> photo leaves the server and the claim is **true today**. The remaining risk is drift: the text is
> unconditional while one environment variable would make it false. Downgraded from High.
> **Fix:** fail startup in production when `VISION_PROVIDER=anthropic` unless the privacy policy and
> sub-processor list have been updated (e.g. an explicit acknowledgement flag), or derive the
> landing text from the configured provider. The analysis below applies only if Anthropic is enabled.

- **Evidence:** `en.ts:347` and `en.ts:662` (and `ro.ts:357`, `ro.ts:671`): "your photos are never
  sent to a third party or kept afterwards". With `VISION_PROVIDER=anthropic`
  (`build-vision-classifier.ts:23-24`, `docker-compose.prod.yml` `VISION_PROVIDER: ${VISION_PROVIDER:-heuristic}`)
  each AI-analysed photo goes to Anthropic in the US. Whether Anthropic "keeps" inputs depends on
  its current commercial terms (it has had a limited retention period) — ⚖️ verify.
- **Why:** transparency (Art. 5(1)(a), Art. 13(1)(e)-(f)), transfers (Art. 44-46), processor contract
  (Art. 28) — and a misleading commercial claim (Directive 2005/29/EC, in Romania Legea 363/2007).
  It also ships the photographer's clients' faces abroad without the photographer being able to
  tell their clients.
- **Fix (S):** make the text conditional and true: say which provider, where, and for how long.
  If production uses `heuristic` or `ollama` (local), the claim is true today — **tell me which
  provider is set on the server.** Sign Anthropic's DPA (it includes SCCs) and list it as a
  sub-processor.

#### GDPR-02 — Rights and retention · **Med-High** · M–L

| Right / duty | State | Gap | Ref |
|---|---|---|---|
| Access & portability | none | no export of an account's data (shoots, albums, client links) | Art. 15, 20 |
| Rectification | partial | can edit names/branding; no way to change login email | Art. 16 |
| Erasure — shoot | good | `delete-project.use-case.ts` removes photos, derivatives, analyses, albums, exports, links, DigiStorage prefix | Art. 17 |
| Erasure — account | admin-only | no self-service; `DeleteStudioUseCase` does not cancel the Stripe subscription/customer (`studio-deletion.use-cases.ts:34-55`) — a deleted studio could keep being charged | Art. 17, 12(3) |
| Erasure — backups | not addressed | dumps kept 14 d local / 30 off-site; acceptable if disclosed and deleted data is not restored back into use | Art. 17, 5(1)(e) |
| Erasure — logs | not addressed | Docker logs never rotated (IPs) | Art. 5(1)(e) |
| Restriction / objection | none | handle manually; document the process | Art. 18, 21 |
| Storage limitation | partial | staging originals purged after export (`ORIGINAL_RETENTION_DAYS`), but DigiStorage keeps **all originals until the shoot is deleted** (`docs/deploy-valentintruta.md`), and nothing ever expires old shoots, expired client links or inactive accounts | Art. 5(1)(e), 25(2) |

- **Fix:** (1) self-service "delete my account" that runs `DeleteStudioUseCase` and cancels Stripe
  (visible UX — needs approval); (2) a JSON+ZIP export; (3) a retention policy, e.g. warn then delete
  shoots `[N]` months after delivery, configurable per studio as the controller decides
  (⚖️ the default period); (4) log rotation; (5) note backup retention in the privacy policy.

#### GDPR-03 — Google Fonts from Google's servers · **Med** · S

- **Evidence:** `apps/web/index.html:10-15` loads IBM Plex from `fonts.googleapis.com` /
  `fonts.gstatic.com` on every page, including client portals.
- **Why:** sends every visitor's IP to Google (US) without a legal basis or notice. LG München I,
  20.01.2022 (3 O 17493/20) awarded damages for exactly this, and it was followed by waves of
  claim letters.
- **Fix:** self-host the fonts (the OFL-licensed `@ibm/plex-*` packages are already used by the API
  for PDFs). Adding them to the web app is a new dependency there — needs your OK.

#### GDPR-04 — Breach readiness · **Med** · M

- No written incident procedure; nothing records who did what (logins, member changes, link
  reveals, deletions, admin actions). Without it you cannot tell, within 72 h, whether data was
  accessed (Art. 33(1), 33(3)) or document it (Art. 33(5)).
- Processors must notify controllers "without undue delay" (Art. 33(2)) — the DPA must say how.
- **Fix:** `docs/incident-response.md` (who decides, ANSPDCP form, studio notification template,
  decision log), and an `audit_events` table (schema change — approval) written through the
  Logger port without personal data beyond ids.

#### GDPR-05 — Sentry · **Low-Med** · S

- Browser Sentry (`apps/web/src/shared/lib/monitoring.ts:10-15`) attaches the page URL and
  navigation breadcrumbs; on client portals that URL is `/review/<token>` — the share token. API
  side is already redacted.
- Region unknown (DSN is a secret). Use Sentry's EU region (`*.de.sentry.io`) or confirm DPF/SCC
  cover; turn off IP storage in the Sentry project settings.
- **Fix:** a `beforeSend`/`beforeBreadcrumb` that rewrites `/(review|pick|download)/…` the same way
  `redactUrl` does on the API.

#### GDPR-06 — Special categories and children · **Low-Med** · ⚖️

- Baptism and religious-ceremony photos can reveal religious belief (Art. 9(1)); weddings and
  baptisms routinely include children. Art. 8 (child consent) applies to services offered
  *directly* to children, which AlbumFlow is not, but Recital 38 asks for specific protection.
  The photographer (controller) carries the main duty; our DPA should commit us to the measures.
- The category label `CEREMONY` with "religious rite" in the prompt is a classification of the
  scene, not of a person's belief — likely fine, ⚖️ confirm.
- Is a DPIA (Art. 35) needed? Large volumes of photos of people incl. children on behalf of many
  controllers could meet two EDPB criteria (vulnerable subjects, large scale) — ⚖️.

#### International transfers (Art. 44-49)

| Processor | Purpose | Location | Mechanism to verify |
|---|---|---|---|
| Stripe | payments | US / Stripe Payments Europe (IE) | DPF certified + DPA with SCCs — verify |
| Sentry (Functional Software) | errors | US or EU region | DPF + DPA — verify; prefer EU region |
| Anthropic | AI photo tagging (opt-in) | US | DPA with SCCs — verify DPF status |
| Cloudflare | Turnstile | global/US | DPF + DPA — verify |
| Google | fonts (remove) | US | — remove instead |
| GitHub | code & CI secrets (no user data) | US | not personal-data processing for users |
| Cloudify / Acvile Tech | VPS | Romania | DPA needed (Art. 28) |
| Digi (RCS & RDS) — DigiStorage (Koofr platform, Slovenia) | long-term storage, backups | EU | DPA needed; check consumer cloud terms allow business/processor use ⚖️ |
| romania-webhosting / Claus Web | static web app, SMTP | Romania | DPA needed |

---

## 4. ePrivacy / cookies

**Inventory (browser storage):**

| Key | Store | Purpose | Strictly necessary? |
|---|---|---|---|
| `albumflow.token`, `albumflow.studioId`, `albumflow.name` | localStorage | login session | yes |
| `albumflow.grant.<kind>.<token>` | sessionStorage | client unlocked a password link | yes |
| `albumflow.theme` | localStorage | light/dark | preference (functional) |
| language key (`language-storage.ts`) | localStorage | language | preference (functional) |
| tour/onboarding "seen" flags (`GuidedTour.tsx`, `HowItWorks.tsx`, `LaunchOffer.tsx`, `GettingStarted.tsx`) | localStorage | don't show again | preference (functional) |
| tray prefs (`tray-prefs.ts`) | localStorage | editor layout | preference (functional) |
| Turnstile (Cloudflare) | third-party script on `/register` | bot check | yes (security) |
| Sentry | script | error reports | no cookies; legitimate interest |

**There is no analytics, advertising or tracking.** Storing purely user-requested preferences and
security tokens is exempt from consent under Art. 5(3) of Directive 2002/58/EC (Legea 506/2004,
art. 4(5)) — so **a consent banner is not required today**, and adding one would be unneeded UX.
What *is* required: describe this storage in a cookie/storage section of the privacy policy
(Art. 13 GDPR), and remove Google Fonts (GDPR-03). If analytics is ever added, it must wait for
consent. ⚖️ confirm the preference items count as exempt (the EDPB/Art. 29 WP Opinion 04/2012 on
cookie exemptions supports user-interface customisation cookies).

---

## 5. Terms, consumer law and platform duties

### LEG-01 — No legal pages at all · **High** · L · ⚖️ + Dev

- **Evidence:** no privacy, terms, cookie or imprint text in `apps/web/src` (searched `privacy`,
  `terms`, `cookie`, `termeni`, `confiden`); no footer; `RegisterPage.tsx` has no terms/privacy
  link or acceptance; Stripe Checkout has no `consent_collection.terms_of_service`
  (`stripe-billing-gateway.ts:36-46`); client portals (`ReviewPage`, `PickPage`, `DownloadPage`)
  tell clients nothing about who processes their data.
- **Required:**
  - **Imprint** — Legea 365/2002 art. 5: company name, registration number (Nr. ORC), CUI, address,
    email/phone, VAT status, supervisory authority if any. (Also Directive 2000/31/EC Art. 5.)
  - **Privacy Policy** — Art. 13/14 GDPR: controller identity & contact, DPO if any, purposes &
    bases (§3.3), recipients/processors, transfers & safeguards, retention, rights incl. complaint
    to **ANSPDCP** (Art. 77), whether data is required, automated decisions (none).
  - **Client-facing notice** on portals: "This gallery is provided by `[studio]`; AlbumFlow processes
    it on their behalf" + link (Art. 13 is the studio's duty, but we must enable it — Art. 28(3)(e)).
  - **Terms of Service** incl. **DPA** (Art. 28(3)), sub-processor list, acceptable use, content
    licence (LEG-04), liability, termination and data return/deletion (Art. 28(3)(g)).
  - **Cookie/storage notice** (§4). All in **RO and EN**, linked in a footer and at signup.
- **Dev part (after approval):** a footer, routes `/legal/{privacy,terms,dpa,imprint,cookies}`,
  checkbox + versioned acceptance stored at signup and checkout (schema change), texts drafted as
  marked TEMPLATES with placeholders.

### LEG-02 — Hosting-provider duties (DSA) and illegal content · **Med** · M · ⚖️

AlbumFlow stores content at users' request, so it is a **hosting service** under Regulation (EU)
2022/2065 (DSA); with private, non-public galleries it is likely **not** an "online platform"
(Art. 3(i)), so the heavier Art. 19+ duties don't apply — ⚖️ confirm.

- Art. 11-12: single points of contact for authorities and users — publish an email.
- Art. 14: content-moderation rules in the Terms.
- Art. 16: a notice-and-action mechanism for illegal content (incl. copyright claims), Art. 17
  statements of reason when content is removed, Art. 18 report suspected crimes threatening life or
  safety. Today nothing exists beyond `contact@valentintruta.ro` (`ContactPage.tsx:3`).
- **CSAM:** a written process — preserve, disable access, report to the Romanian Police / DIICOT
  and the national hotline, never forward the material. No automated scanning is proposed.
- **Dev:** a "report content" link on client portals and a notice form/email; an admin "disable
  shoot" action.

### LEG-03 — Billing and consumer law · **Med** · ⚖️ / accountant

- Customers are photographers (businesses or PFAs), so this is mostly **B2B**: the 14-day withdrawal
  right (Directive 2011/83/EU Art. 9; OUG 34/2014 art. 9) applies only to consumers. ⚖️ decide
  whether to accept consumers at all; if yes, the checkout needs the withdrawal notice, the
  express-consent + acknowledgement for immediate supply of digital services
  (OUG 34/2014 art. 16 lit. m) / Directive 2011/83 Art. 16(m)), and the model withdrawal form.
- Prices are shown as "€X / month" (`en.ts:224`, `en.ts:1025`) without saying whether VAT is included.
  For consumers the price must include VAT (Directive 98/6/EC; OG 21/1992); for B2B say "excl. VAT".
- Stripe: no `automatic_tax`, no tax-ID collection; Romanian **e-Factura** reporting
  (OUG 120/2021 as amended) is not covered by Stripe invoices — accountant.
- Cancellation must be as easy as sign-up (Directive 2023/2673 "withdrawal button" from 19 June
  2026 is for consumer distance contracts) — the Stripe portal covers cancel; link it visibly.
- ANPC: Ordinul ANPC 449/2022 requires the SAL (and formerly SOL) pictograms on consumer-facing
  sites. The EU ODR platform was shut down in July 2025 (Reg. (EU) 2024/3228), so the SOL link
  is likely obsolete — ⚖️ confirm current ANPC practice.

### LEG-04 — Copyright and licensing · **Low-Med** · ⚖️

- The photographer owns the photos (Legea 8/1996). The Terms should grant AlbumFlow only a
  non-exclusive licence to store, process, render previews/PDFs and transmit them to people the
  studio chooses, for providing the service, ending at deletion.
- Client usage rights / print release are between photographer and client; AlbumFlow could offer
  an optional "print release" text on the download page (feature idea, not a legal duty).
- Watermarking: per plan (`plan-features.ts:3-6`); download controls: the download link is opt-in,
  expiring, revocable. Fine. Previews in the portal are not watermarked on all plans — product choice.
- Third-party assets: IBM Plex fonts are **SIL OFL 1.1**, which allows web and PDF embedding.
  Marketing images in `apps/web/public/*.png` look AI-generated (file names are prompts) — keep a
  record of the tool and its terms ⚖️. No icon font or stock library found.

---

## 6. Accessibility and licences

### A11Y-01 — WCAG 2.1 AA gaps · **Med** · M

- **Contrast:** `--ink-faint: #7c8791` (`styles.css:4`) used by `.muted` text is **3.22:1** on the
  page background and 3.66:1 on white — below 4.5:1 (WCAG 1.4.3). Accent buttons pass (5.12:1).
- **Language:** `<html lang="en">` is static (`index.html:2`) and never updated for Romanian
  (WCAG 3.1.1).
- **Keyboard:** 14 `div/span/li` elements with `onClick` (WCAG 2.1.1), e.g. in the editor and
  gallery — needs a per-element check (some may have `role`/`tabIndex`).
- **Focus:** two `outline: none` rules without a replacement focus style (`styles.css:3564, 3757`).
- **Motion:** one `prefers-reduced-motion` rule; slideshows/tour animations should respect it.
- **i18n:** "Page not found." is hard-coded (`App.tsx:100`) — also a CLAUDE.md rule.
- **Positive:** 78 `aria-label`s, 36 dialogs with `role="dialog"`/`aria-modal`.
- **Scope ⚖️:** the European Accessibility Act (Directive (EU) 2019/882; Legea 232/2022) applies
  from 28 June 2025 to consumer-facing services such as e-commerce; **microenterprises providing
  services are exempt** (Art. 4(5)). A B2B SaaS run by a microenterprise is probably out of scope,
  but the client portals are used by consumers — worth fixing regardless; ⚖️ confirm the duty.

### 6.2 Licence scan (`pnpm licenses list --prod`)

MIT 165 · Apache-2.0 51 · BSD-3 7 · ISC 6 · OFL-1.1 2 · Unlicense 2 · BSD-2, BlueOak-1.0.0,
MIT-0, (MIT AND Zlib), 0BSD 1 each. **No GPL/AGPL/SSPL/unknown.** One **LGPL-3.0-or-later**:
`@img/sharp-libvips-*` (dynamically loaded by sharp; server-side, not distributed to users —
LGPL obligations are minimal; keep the notice). Note `@ibm/plex-*` ships a `telemetry.yml`
(IBM install-time telemetry in CI; no user data).

---

## 7. Proposed order

**Wave 1 — this week, small PRs, no design change needed**
1. SEC-01 make the bucket private (+ smoke test) — then check logs for past unsigned access.
2. SEC-02 remove/restrict `POST /studios`; revoke keys from studios created through it.
3. SEC-05 stop logging email bodies.
4. GDPR-01 guard so the AI claim cannot silently become false (production is `heuristic`, claim true today).
5. SEC-04 + SEC-07 sharp ≥0.35.5, fastify, nodemailer, drizzle bumps; server-side size/magic check; add `pnpm audit` to verify.
6. SEC-08 drop the legacy key secret; OPS-01 FTPS (one line).

**Wave 2 — needs your approval (design / schema / UX)**
7. SEC-03 role policy, unique email (schema), token versioning (schema).
8. SEC-06 security headers (CSP in report-only first).
9. GDPR-03 self-host fonts (new web dependency).
10. GDPR-05 Sentry URL scrubbing; EU region.
11. OPS-01 non-root images, deploy user, encrypted backups, restore job, log rotation.

**Wave 3 — after the lawyer**
12. LEG-01 legal pages + footer + acceptance at signup/checkout (templates first, then final text).
13. GDPR-02 account deletion (with Stripe cancel), export, retention policy.
14. GDPR-04 incident procedure + audit log.
15. LEG-02 report-content flow and admin disable.
16. A11Y-01 contrast, `lang`, keyboard, focus.
17. LEG-03 VAT display, ToS consent in Stripe, e-Factura (accountant).

## 8. Questions for a lawyer (not a developer)

1. Is a past-access investigation of the public bucket (SEC-01) a notifiable breach under Art. 33/34?
2. Final texts: Privacy Policy, Terms, DPA (Art. 28), sub-processor list, imprint, cookie notice — RO + EN.
3. Controller/processor split, including Stripe's role.
4. Retention periods: accounts, shoots after delivery, logs, backups, invoices (Legea 82/1991).
5. DPIA need (Art. 35) for children's and religious-ceremony photos at scale; whether CEREMONY
   tagging touches Art. 9.
6. Transfers: confirm DPF/SCC status of Stripe, Sentry, Anthropic, Cloudflare; whether Anthropic's
   retention terms allow "not kept afterwards" to be said at all.
7. DigiStorage consumer terms vs. use as a processor for business data.
8. B2B only, or consumers too (withdrawal right, VAT-inclusive prices, ANPC/SAL)?
9. DSA classification (hosting vs. online platform) and the notice-and-action/CSAM procedure.
10. EAA scope given microenterprise status and consumer-facing client portals.
11. Content licence wording and the AI-generated marketing images.
12. DPO: is one required (Art. 37 — likely not, but large-scale processing of children's images is the
    question) and who is the privacy contact.
