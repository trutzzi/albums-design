#!/bin/sh
# Nightly Postgres backup, run by the `db-backup` service in docker-compose.prod.yml.
#
# Takes a dump when the container starts (so every deploy leaves a fresh one) and
# then once a day. Each dump is written under a temporary name and renamed only once
# complete, so the worker's off-site copy can never pick up a half-written file.
# Local copies older than BACKUP_KEEP_DAYS are deleted; the off-site copies on
# DigiStorage are pruned separately by the worker.
#
# Restore with scripts/restore-db.sh — see docs/backups.md.
set -eu

: "${BACKUP_KEEP_DAYS:=14}"
: "${BACKUP_INTERVAL_SECONDS:=86400}"

while true; do
  stamp=$(date -u +%Y-%m-%dT%H%MZ)
  final="/backups/albumflow-$stamp.dump"
  partial="/backups/.albumflow-$stamp.dump.partial"

  if pg_dump -h postgres -U albumflow -d albumflow --format=custom --file="$partial"; then
    mv "$partial" "$final"
    echo "[db-backup] wrote $final ($(du -h "$final" | cut -f1))"
  else
    rm -f "$partial"
    echo "[db-backup] pg_dump FAILED at $stamp" >&2
  fi

  find /backups -maxdepth 1 -name 'albumflow-*.dump' -mtime +"$BACKUP_KEEP_DAYS" -print -delete \
    | sed 's/^/[db-backup] removed old local backup /'

  sleep "$BACKUP_INTERVAL_SECONDS"
done
