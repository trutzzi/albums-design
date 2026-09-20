#!/usr/bin/env bash
# Local demo WITHOUT the AI — the built-in heuristic classifier only. See test-local-demo.sh for options.
exec bash "$(dirname "$0")/test-local-demo.sh" no-ai "$@"
