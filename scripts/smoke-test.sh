#!/usr/bin/env bash
set -euo pipefail

PASS=0
FAIL=0
FAILURES=()

step() {
	local label="$1"
	shift
	printf "\n--- %s ---\n" "$label"
	if "$@"; then
		printf "PASS: %s\n" "$label"
		PASS=$((PASS + 1))
	else
		printf "FAIL: %s\n" "$label"
		FAIL=$((FAIL + 1))
		FAILURES+=("$label")
	fi
}

# Expect a command to fail (non-zero exit).
step_fail() {
	local label="$1"
	shift
	printf "\n--- %s ---\n" "$label"
	if "$@"; then
		printf "FAIL (expected non-zero exit): %s\n" "$label"
		FAIL=$((FAIL + 1))
		FAILURES+=("$label")
	else
		printf "PASS: %s\n" "$label"
		PASS=$((PASS + 1))
	fi
}

# Expect exit 0 AND stdout to contain a substring.
step_contains() {
	local label="$1"
	local substring="$2"
	shift 2
	printf "\n--- %s ---\n" "$label"
	local out
	if out=$("$@" 2>&1); then
		if printf "%s" "$out" | grep -qF "$substring"; then
			printf "PASS: %s\n" "$label"
			PASS=$((PASS + 1))
		else
			printf "FAIL (output missing '%s'): %s\n" "$substring" "$label"
			printf "  output was: %s\n" "$out"
			FAIL=$((FAIL + 1))
			FAILURES+=("$label")
		fi
	else
		printf "FAIL (non-zero exit): %s\n" "$label"
		FAIL=$((FAIL + 1))
		FAILURES+=("$label")
	fi
}

# ── Temp data dir ──────────────────────────────────────────────────
TMPDIR_DATA="$(mktemp -d)"
export BMO_DATA="$TMPDIR_DATA"
trap 'rm -rf "$TMPDIR_DATA"' EXIT
printf "Using temp BMO_DATA: %s\n" "$TMPDIR_DATA"

# ── Pre-build checks ──────────────────────────────────────────────
step "lint"        bun run lint
step "unit tests"  bun run test
step "build"       bun run build

# ── Binary smoke tests ────────────────────────────────────────────
# Unset provider env vars so stored keys are visible as "keys.json" source.
unset OPENAI_API_KEY

BIN=./dist/bmo

step          "bmo --sessions"                   "$BIN" --sessions
step          "bmo key list (empty)"             "$BIN" key list
step_fail     "bmo key add unknown provider"     "$BIN" key add nonexistent sk-foo
step          "bmo key add openai"               "$BIN" key add openai test-smoke-key
step_contains "bmo key list (has keys.json)"     "keys.json" "$BIN" key list
step          "bmo key remove openai"            "$BIN" key remove openai

# ── Summary ────────────────────────────────────────────────────────
printf "\n===========================\n"
printf "PASSED: %d   FAILED: %d\n" "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
	printf "\nFailed steps:\n"
	for f in "${FAILURES[@]}"; do
		printf "  - %s\n" "$f"
	done
	exit 1
fi
printf "All smoke tests passed.\n"
