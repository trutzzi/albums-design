#!/usr/bin/env bash
# The quality gate: everything a change must pass before it becomes a pull request.
# Run by you, by the /ship agent before it pushes, and (step by step) by CI.
#
#   pnpm verify          all checks
#   pnpm verify --fix    format and auto-fix lint first, then check
set -uo pipefail
cd "$(dirname "$0")/.."

# The pinned pnpm when it is not installed globally.
if command -v pnpm >/dev/null 2>&1; then PNPM=(pnpm); else PNPM=(npx -y pnpm@9.15.0); fi

if [ "${1:-}" = "--fix" ]; then
  "${PNPM[@]}" exec prettier --write . >/dev/null
  "${PNPM[@]}" exec eslint . --fix >/dev/null || true
fi

failed=()
step() {
  local name="$1"; shift
  printf '\n\033[1m▶ %s\033[0m\n' "$name"
  if "$@"; then
    printf '\033[32m✔ %s\033[0m\n' "$name"
  else
    printf '\033[31m✘ %s\033[0m\n' "$name"
    failed+=("$name")
  fi
}

# Generating a migration must be a no-op; anything new means a schema change shipped without one.
migrations_in_step() {
  (cd apps/api && npx drizzle-kit generate >/dev/null) || return 1
  local drift
  drift=$(git status --porcelain -- apps/api/drizzle)
  if [ -n "$drift" ]; then
    echo "Schema changed without a migration. Run 'pnpm db:generate' and commit it:"
    echo "$drift"
    return 1
  fi
}

# Every step runs even after a failure, so one pass reports everything to fix.
step "Format (Prettier)" "${PNPM[@]}" format:check
step "Lint (ESLint)" "${PNPM[@]}" lint
step "Types" "${PNPM[@]}" typecheck
step "Tests + coverage (≥80% lines, branches, functions)" "${PNPM[@]}" test:coverage
step "Build" "${PNPM[@]}" build
step "Migrations match the schema" migrations_in_step

echo
if [ ${#failed[@]} -gt 0 ]; then
  printf '\033[31mVerify failed: %s\033[0m\n' "$(IFS=', '; echo "${failed[*]}")"
  exit 1
fi
printf '\033[32mVerify passed.\033[0m\n'
