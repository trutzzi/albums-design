#!/usr/bin/env bash
#
# Run AlbumFlow locally for testing. Never touches git, GitHub, or any deploy
# target — CI/CD only ever runs from a `git push`, and this script contains no
# git commands at all. Run it as many times as you want; nothing here can
# trigger a deploy or affect .github/workflows/ci.yml in any way.
#
#   ./scripts/test-local.sh          # in-memory demo (default — always works)
#   ./scripts/test-local.sh --full   # real Postgres/Redis/MinIO via Docker
#
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="demo"
if [ "${1:-}" = "--full" ]; then
  MODE="full"
fi

# A quick reinstall is cheap (a few seconds when nothing changed) and silently
# fixes the most common local breakage: on a Mac with iCloud "Optimize Mac
# Storage" enabled, files under ~/Documents get evicted to iCloud-only and
# reads on them fail with an unhelpful low-level error until something
# re-fetches or rewrites them. `pnpm install` does that as a side effect.
echo "==> Checking dependencies"
npx pnpm@9.15.0 install >/dev/null
echo "    ok"
echo

if [ "$MODE" = "full" ]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker isn't installed here, so --full can't run — falling back to demo mode."
    echo "(Install Docker Desktop, or just run this script with no flag.)"
    echo
    MODE="demo"
  fi
fi

if [ "$MODE" = "full" ]; then
  echo "==> Starting Postgres, Redis and MinIO in Docker"
  docker compose up -d postgres redis minio minio-init

  echo "==> Migrating"
  npx pnpm@9.15.0 db:migrate

  echo
  echo "==> Starting the API, worker and web app"
  echo "    Open http://localhost:5173 once Vite reports ready."
  echo "    Data persists in Docker volumes across restarts — 'docker compose down -v'"
  echo "    to wipe it, plain 'docker compose down' to stop without losing anything."
  echo "    Ctrl-C stops the app processes; the containers keep running until you"
  echo "    stop them yourself with 'docker compose stop'."
  echo
  npx pnpm@9.15.0 --filter @albumflow/api dev &
  npx pnpm@9.15.0 --filter @albumflow/worker dev &
  npx pnpm@9.15.0 --filter @albumflow/web dev
else
  echo "==> Starting the in-memory demo"
  echo "    Postgres, Redis and S3 all run in-process — nothing to install, nothing"
  echo "    written to disk. Open http://localhost:5173 once it's ready."
  echo "    Ctrl-C stops it; all data (photos, albums, everything) is gone on restart —"
  echo "    that's the trade for zero setup. Use --full for data that survives a restart."
  echo
  npx pnpm@9.15.0 demo
fi
