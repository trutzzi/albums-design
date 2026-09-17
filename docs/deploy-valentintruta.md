# Deploying to valentintruta.ro

The concrete plan for this domain, checked against the account directly
(cPanel Tools screen, 2026-09-17):

| Checked | Found |
|---|---|
| Setup Node.js App | **Not present** |
| PostgreSQL Databases | **Not present** — Databases only offers phpMyAdmin/MySQL |
| SSH Access | **Not present** |
| Memory cap | 512 MB |

That cPanel account can serve the static frontend but cannot run the backend —
categorically, not as a workaround away from. The backend runs on a separate
VPS instead (Acvile Tech / Cloudify, Timișoara, `eu-east-1` — a genuinely
Romanian datacenter, `b2i.4c-4g`: 4 vCPU / 4GB RAM / 80GB NVMe HA, €10/month).

## The split

```
valentintruta.ro           WordPress — untouched, unaffected by anything below
app.valentintruta.ro        AlbumFlow web app → cPanel, via FTP
api.valentintruta.ro        AlbumFlow API + worker → the VPS
storage.valentintruta.ro    Photo storage (MinIO) → the same VPS
```

## Why self-hosted, not Neon/Upstash/Fly

An earlier version of this plan used Fly.io plus managed Neon (Postgres) and
Upstash (Redis), because Fly's containers are ephemeral — there's nowhere to
durably keep a database on a host designed to be thrown away and recreated.

A VPS is the opposite situation: one box, a persistent disk, and Cloudify's
own listing says the storage backing it is NVMe **HA** — replicated at the
hardware level, not a single point of failure the way a plain VPS's local disk
would be. Self-hosting Postgres, Redis and MinIO directly on it, via the
`docker-compose.yml` that already exists in this repo, costs nothing beyond
the €10/month box itself and needs no external account. That's the plan below.

`infra/fly/fly.toml` and `infra/docker/backend.Dockerfile` are left in the repo
in case a future move to a managed platform makes sense again, but **CI does
not use them** — `deploy-backend` in `.github/workflows/ci.yml` deploys to the
VPS over SSH.

## What the pipeline does

On every push to `main`, once `verify`, `migrations`, `images` and `smoke` all
pass:

- **`deploy-backend`** — syncs the checkout to `/opt/albumflow` on the VPS,
  runs the database migration against the new code, then restarts exactly the
  services this box runs (`postgres redis minio minio-init api worker caddy`
  — never `web`, which lives on cPanel instead).
- **`deploy-web`** — as before: builds with `VITE_API_URL=https://api.valentintruta.ro`
  baked in, uploads over FTP.

## One-time setup

### 1. Provision the VPS

```bash
ssh -i ~/.ssh/albumflow_deploy root@80.97.27.100 'bash -s' < infra/scripts/provision-server.sh
```

Installs Docker, creates a 2GB swap file (a large PDF export with no swap risks
an OOM kill mid-job — this turns that into "slow" instead of "gone"), and locks
the firewall down to SSH + 80/443 only. Everything else — Postgres, Redis,
MinIO — talks over the private compose network Docker creates automatically;
nothing else is ever exposed to the internet. **Verify this after running it:**

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml config | grep -A2 "postgres:$"
nmap -Pn -p 5432,6379,9000 80.97.27.100   # should report all three filtered/closed
```

### 2. Real secrets on the server, once

```bash
scp .env.production.example root@80.97.27.100:/opt/albumflow/.env
ssh root@80.97.27.100
nano /opt/albumflow/.env   # fill in POSTGRES_PASSWORD, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
```

Generate each with `openssl rand -base64 32`. This file is never committed and
the deploy job never touches it — a fresh checkout has no `.env` in it at all,
so nothing ever overwrites what's already on the server.

### 3. DNS — in the *original* cPanel's Zone Editor

The domain's nameservers point at romania-webhosting.com / Claus Web, not at
Cloudify — so these records go in the **cPanel account that already runs
WordPress**, under *Domains → Zone Editor*, not in the new VPS provider's panel:

| Type | Name | Value |
|---|---|---|
| A | `api` | `80.97.27.100` |
| AAAA | `api` | `2a06:1fc0:0:1::47c` |
| A | `storage` | `80.97.27.100` |
| AAAA | `storage` | `2a06:1fc0:0:1::47c` |

Caddy issues its own Let's Encrypt certificates for both automatically on
first request — nothing to configure beyond the DNS records existing.

### 4. cPanel: the frontend subdomain + a scoped FTP account

*Domains → Domains → Create A New Domain* → `app.valentintruta.ro`. Note the
document root it assigns — that's `FTP_REMOTE_DIR` below.

*Files → FTP Accounts* → create a new account scoped to that subdomain's
directory only, not the master login.

### 5. GitHub repository secrets

| Secret | Value |
|---|---|
| `SSH_HOST` | `80.97.27.100` |
| `SSH_USER` | `root` |
| `SSH_PRIVATE_KEY` | contents of `~/.ssh/albumflow_deploy` (not `.pub`) |
| `FTP_SERVER` | cPanel's FTP hostname |
| `FTP_USERNAME` | the scoped FTP account from step 4 |
| `FTP_PASSWORD` | its password |
| `FTP_REMOTE_DIR` | the document root cPanel assigned `app.valentintruta.ro` |

### 6. Push to `main`

The pipeline runs the full gate, then deploys both halves.

## Why nothing here touches WordPress

The FTP upload targets a subdomain's own directory, created fresh in step 4 —
never `public_html/` at the domain root. The VPS is an entirely separate
machine from the one WordPress runs on. Nothing in this pipeline writes to a
path or a host that has any relationship to the WordPress installation.
