# Deploying AlbumFlow with cPanel

cPanel hosting was built for PHP sites sharing one Apache server. AlbumFlow is a
Node API, a background worker, PostgreSQL, Redis and an S3-compatible store. Some
of that fits; some of it does not. This is what goes where, and how to find out
which case you are in.

## What fits today

**The web app does, completely.** It builds to 403 KB of JavaScript and 13 KB of
CSS — static files Apache serves natively. Your domain, your cPanel AutoSSL
certificate, nothing to install. Follow *Part 1*.

**The API and worker depend on your host.** Shared cPanel plans usually forbid the
long-running processes a worker needs and rarely offer Redis. *Part 2* tells you
exactly what to check before committing to anything.

## Part 1 — the web app (works now)

### 1. Build it against wherever your API will live

The API URL is compiled into the bundle, so it must be known at build time:

```bash
VITE_API_URL=https://api.yourdomain.com \
VITE_STUDIO_API_KEY=<the key from pnpm db:seed> \
pnpm --filter @albumflow/web build
```

### 2. Upload

Copy the **contents** of `apps/web/dist/` into `public_html/` — the files
themselves, not the `dist` folder. In cPanel's File Manager, enable
*Settings → Show Hidden Files* first, or `.htaccess` will be silently left behind
and every deep link will 404.

```
public_html/
├── .htaccess
├── index.html
└── assets/
```

### 3. Turn on HTTPS

*cPanel → SSL/TLS Status → Run AutoSSL*. The `.htaccess` already redirects HTTP
to HTTPS once the certificate exists.

That is the whole frontend deployment. It will work on any cPanel plan.

## Part 2 — the API, worker and data

Check these four things in cPanel before deciding anything. The answers determine
whether the backend can live here at all.

| Look for | Where | If it is missing |
|---|---|---|
| **Setup Node.js App** | Software | The API cannot run here. Host it elsewhere. |
| **PostgreSQL Databases** | Databases | Many hosts ship only MySQL. AlbumFlow needs PostgreSQL — its album spreads are stored as `jsonb`. |
| **Redis** | Advanced / Software | Rare on shared plans. The worker queue needs it, or needs replacing. |
| **SSH access** | Security | Without it you are deploying by uploading zip files by hand. |

### The three likely outcomes

**A. Node ✅, PostgreSQL ✅, Redis ❌** — the common case, and workable. Two
adapters have to be swapped: object storage moves from S3 to the local
filesystem, and the job queue moves from Redis to the database, drained by a
cPanel cron job every minute instead of by a always-on worker. The ports already
exist (`ObjectStorage`, `JobQueue`), so this is new adapters rather than surgery
on the core.

**B. Node ✅, PostgreSQL ❌** — you need a database elsewhere regardless. Neon
and Supabase both have free PostgreSQL tiers reachable from cPanel, assuming your
host allows outbound connections on port 5432. Many shared hosts block them.

**C. No Node app support** — the backend cannot live here. Keep the frontend on
your domain as in Part 1 and run the API on a container host, with DNS pointing
`api.yourdomain.com` at it. You own the domain, so this costs nothing extra and
your users never see the difference.

### Why the worker is the sticking point

Photo analysis and PDF export are slow and memory-hungry: `sharp` decodes
20-megapixel images and `pdf-lib` assembles multi-hundred-megabyte documents.
Shared hosting caps memory per process and kills anything long-running. Even
where the API starts fine, exports are the first thing to fall over.

If you are on a cPanel **VPS** rather than shared hosting, none of this applies —
you have root, so install Docker and use `docker-compose.yml` as-is.

## Recommended split

Unless you are on a VPS:

- **`yourdomain.com`** → cPanel, static frontend, Part 1
- **`api.yourdomain.com`** → a container host, pointed there by a DNS A or CNAME
  record you add in cPanel's Zone Editor

You keep your domain and your existing hosting, and the parts that genuinely need
a server get one.
