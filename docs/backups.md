# Backups and restoring

Two things hold a studio's work: the **Postgres database** (accounts, shoots, albums,
client picks, comments) and the **photo files** (in MinIO, and on DigiStorage when
`STORAGE_PROVIDER=digistorage`). Both need a copy that is not on the VPS, because
anything that only lives on the VPS is lost with it.

## What runs automatically

| What | Where it goes | How often | Kept |
|---|---|---|---|
| Database dump (`pg_dump`, custom format) | `db-backups` volume on the VPS | when `db-backup` starts (every deploy) and daily | `BACKUP_KEEP_DAYS` days (default 14) |
| Off-site copy of each dump | DigiStorage, `backups/database/` | daily at 04:00 UTC, and when the worker starts | newest `BACKUP_KEEP` dumps (default 30) |
| Photo originals | DigiStorage | within minutes of upload (`LONG_TERM_ORIGINALS=all`) | until the shoot is deleted |

The off-site database copy only runs when the worker has a long-term provider
(`STORAGE_PROVIDER=digistorage`). The worker says so when it starts:
`… — off-site database backups on`, and logs every run as `[backup] …`.

## Checking that backups are happening

```bash
cd /opt/albumflow
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
$COMPOSE logs --tail 20 db-backup              # "[db-backup] wrote …" lines
$COMPOSE exec db-backup ls -lh /backups        # the local dumps
$COMPOSE logs --tail 200 worker | grep backup  # the off-site copies
```

## Restoring the database

1. Pick a dump: a local one from the `db-backups` volume, or download one from
   DigiStorage (`backups/database/`) if the server itself was lost.
2. On the server, from `/opt/albumflow`:

   ```bash
   ./scripts/restore-db.sh /path/to/albumflow-2026-09-30T0300Z.dump
   ```

   It asks you to type `RESTORE`, stops the API and worker, replaces the database
   and starts them again. Anything written after the dump was taken is gone.

To copy a dump out of the volume first:

```bash
$COMPOSE cp db-backup:/backups/albumflow-2026-09-30T0300Z.dump ./
```

## Test a restore before you need one

A backup nobody has restored is a guess. Once a quarter, restore the newest
off-site dump into a scratch Postgres on your laptop:

```bash
docker run -d --name restore-test -e POSTGRES_PASSWORD=test -p 5433:5432 postgres:16-alpine
pg_restore -h localhost -p 5433 -U postgres -d postgres --no-owner albumflow-….dump
psql -h localhost -p 5433 -U postgres -c 'select count(*) from projects'
docker rm -f restore-test
```
