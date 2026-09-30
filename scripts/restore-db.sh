#!/usr/bin/env bash
#
# Restore the production database from a dump made by infra/backup/db-backup.sh.
# Run on the server, from /opt/albumflow:
#
#   ./scripts/restore-db.sh /path/to/albumflow-2026-09-30T0300Z.dump
#
# It stops the API and worker (so nothing writes mid-restore), replaces every table
# with the dump's contents, then starts them again. Everything written after the
# dump was taken is lost — that is what restoring means. See docs/backups.md.
set -euo pipefail
cd "$(dirname "$0")/.."

DUMP="${1:?usage: restore-db.sh <dump-file>}"
[ -f "$DUMP" ] || { echo "No such file: $DUMP" >&2; exit 1; }

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

echo "This replaces the ENTIRE database with $DUMP."
read -r -p "Type RESTORE to continue: " answer
[ "$answer" = "RESTORE" ] || { echo "Cancelled."; exit 1; }

echo "==> Stopping the API and worker"
$COMPOSE stop api worker

echo "==> Restoring"
$COMPOSE exec -T postgres pg_restore -U albumflow -d albumflow --clean --if-exists --no-owner < "$DUMP"

echo "==> Starting the API and worker"
$COMPOSE up -d api worker
echo "Done. Check https://api.valentintruta.ro/health and log in to confirm."
