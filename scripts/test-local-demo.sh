#!/usr/bin/env bash
#
# Shared runner for the two local demo scripts — use those instead:
#
#   ./scripts/test-local-ai.sh      # in-memory demo WITH the local Ollama AI
#   ./scripts/test-local-no-ai.sh   # in-memory demo WITHOUT it (built-in heuristic)
#
# Both accept:  --storage=none        (default) everything stays in the demo's memory
#               --storage=memory      run the two-tier pipeline against an in-memory stand-in
#               --storage=digistorage write previews/picked originals to the real DigiStorage
#                                     account configured in .env (STORAGE_PROVIDER, DIGISTORAGE_*)
#
# Like test-local.sh this never touches git or any deploy target. The demo keeps
# everything in memory, so all data is gone when you stop it.
#
set -euo pipefail
cd "$(dirname "$0")/.."

AI_MODE="${1:?usage: test-local-demo.sh <ai|no-ai> [--storage=none|memory|digistorage]}"
shift
STORAGE="none"
for arg in "$@"; do
  case "$arg" in
    --storage=none|--storage=memory|--storage=digistorage) STORAGE="${arg#--storage=}" ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

# Settings that were already in the caller's environment win over .env, so
# `OLLAMA_MODEL=llava ./scripts/test-local-ai.sh` behaves as you'd expect.
OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-}"
OLLAMA_MODEL="${OLLAMA_MODEL:-}"
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://localhost:11434}"
OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2.5vl:7b}"

# --- Free the demo ports, but only from a previous demo ---------------------
# "Ours" means a process running from inside this repo (its command line can be
# just "(node)" while it is shutting down, so the name is no use). Everything is
# checked before anything is killed, so a foreign process never leaves us with
# the demo stopped and nothing started.
REPO_ROOT="$(pwd -P)"
to_stop=""
for port in 4000 5173; do
  for pid in $(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true); do
    cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
    case "$cwd" in
      "$REPO_ROOT"|"$REPO_ROOT"/*) to_stop="$to_stop $pid" ;;
      "") ;; # already gone
      *)
        echo "Port $port is in use by a process that isn't this AlbumFlow demo:" >&2
        echo "  pid $pid, running from $cwd" >&2
        echo "Stop it first, then run this again." >&2
        exit 1
        ;;
    esac
  done
done
if [ -n "$to_stop" ]; then
  echo "==> Stopping the previous demo (pids:$to_stop)"
  # shellcheck disable=SC2086
  kill $to_stop 2>/dev/null || true
fi
# Wait (up to ~10s) for both ports to actually be released before starting.
for _ in $(seq 1 20); do
  if [ -z "$(lsof -nP -tiTCP:4000 -tiTCP:5173 -sTCP:LISTEN 2>/dev/null || true)" ]; then break; fi
  sleep 0.5
done

# --- AI mode ----------------------------------------------------------------
if [ "$AI_MODE" = "ai" ]; then
  echo "==> Checking Ollama at $OLLAMA_BASE_URL"
  if ! tags="$(curl -fsS --max-time 4 "$OLLAMA_BASE_URL/api/tags" 2>/dev/null)"; then
    echo "Ollama isn't reachable, so an 'AI on' run would quietly fall back to the heuristic." >&2
    echo "Start it (open the Ollama app, or run 'ollama serve'), or use ./scripts/test-local-no-ai.sh." >&2
    exit 1
  fi
  if ! echo "$tags" | grep -q "\"name\":\"$OLLAMA_MODEL\""; then
    echo "Ollama is running but the model '$OLLAMA_MODEL' isn't installed." >&2
    echo "Install it with:  ollama pull $OLLAMA_MODEL" >&2
    exit 1
  fi
  echo "    ok — model $OLLAMA_MODEL is available"
  export VISION_PROVIDER=ollama OLLAMA_BASE_URL OLLAMA_MODEL
  echo "==> AI photo analysis: ON  (the upload toggle still has to be ticked per upload)"
else
  export VISION_PROVIDER=heuristic
  echo "==> AI photo analysis: OFF (built-in heuristic classifier — the badge will read offline)"
fi

# --- Storage mode -----------------------------------------------------------
export STORAGE_PROVIDER="$STORAGE"
export PUBLIC_API_URL="${PUBLIC_API_URL:-http://localhost:4000}"
if [ "$STORAGE" = "digistorage" ]; then
  : "${DIGISTORAGE_WEBDAV_URL:?DIGISTORAGE_WEBDAV_URL is not set in .env}"
  : "${DIGISTORAGE_USERNAME:?DIGISTORAGE_USERNAME is not set in .env}"
  : "${DIGISTORAGE_APP_PASSWORD:?DIGISTORAGE_APP_PASSWORD is not set in .env}"
  echo "==> Storage: DigiStorage ($DIGISTORAGE_WEBDAV_URL) — uploads go to the real account"
else
  echo "==> Storage: $STORAGE"
fi

echo "==> Checking dependencies"
npx pnpm@9.15.0 install >/dev/null
echo "    ok"
echo
echo "==> Starting the in-memory demo — open http://localhost:5173 once it's ready."
echo "    Ctrl-C stops it; all data is gone on restart."
echo
exec npx pnpm@9.15.0 demo
