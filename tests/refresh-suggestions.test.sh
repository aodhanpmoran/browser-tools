#!/bin/bash
#
# Tests for scripts/refresh-suggestions.sh.
#
# The failure this suite exists for: on 1 Aug the launchd job fired on wake,
# before the network was up, and Claude returned "Not logged in" three seconds
# in. With no retry that cost the whole day's suggestions, and because the
# script deleted Claude's output on failure the log said only "claude exited 1"
# — the actual reason had to be dug out of Claude's own session transcript.
#
# So: a transient failure must be survived, and a permanent one must leave
# behind enough to diagnose it.
#
# Claude is stubbed. Nothing here touches the network or the real ~/.browser-tools.
#
# Run: bash tests/refresh-suggestions.test.sh

set -uo pipefail

SCRIPT="$(cd "$(dirname "$0")/.." && pwd)/scripts/refresh-suggestions.sh"
PASS=0
FAIL=0

GOOD_JSON='{"generatedAt":"2026-08-01T07:00:00Z","goal":"EUR 10K/mo recurring","suggestions":[{"id":"a","title":"Ship the thing","source":"fathom","leverage":9,"subtasks":["step one"]}]}'

ok() { printf '  ok   %s\n' "$1"; PASS=$((PASS + 1)); }
no() { printf '  FAIL %s\n     %s\n' "$1" "$2"; FAIL=$((FAIL + 1)); }

# A stub `claude` driven by a script of per-attempt behaviours, one per line:
#   ok      -> print valid JSON, exit 0
#   authfail-> print the real "Not logged in" text, exit 1
#   garbage -> print prose that is not JSON, exit 0
make_stub() {
  local dir="$1"; shift
  printf '%s\n' "$@" > "$dir/behaviours"
  : > "$dir/attempts"
  cat > "$dir/claude" <<STUB
#!/bin/bash
n=\$(( \$(wc -l < "$dir/attempts") + 1 ))
echo "call" >> "$dir/attempts"
behaviour=\$(sed -n "\${n}p" "$dir/behaviours")
[ -z "\$behaviour" ] && behaviour=\$(tail -1 "$dir/behaviours")
case "\$behaviour" in
  ok)       echo '$GOOD_JSON'; exit 0 ;;
  authfail) echo "Not logged in · Please run /login"; exit 1 ;;
  garbage)  echo "I could not reach Gmail, sorry."; exit 0 ;;
esac
STUB
  chmod +x "$dir/claude"
}

# Runs the script against a throwaway BROWSER_TOOLS_DIR with retries that do not
# actually sleep. Echoes the exit status; the sandbox is left for inspection.
run_case() {
  local sandbox="$1"; shift
  make_stub "$sandbox" "$@"
  BROWSER_TOOLS_DIR="$sandbox/out" \
  CLAUDE_BIN="$sandbox/claude" \
  REFRESH_RETRY_DELAYS="0 0 0" \
  REFRESH_NET_PROBE="true" \
    bash "$SCRIPT" >/dev/null 2>&1
  echo $?
}

attempts_made() { wc -l < "$1/attempts" | tr -d ' '; }

# --- a transient failure must not cost the day -------------------------------
# This is the 1 Aug bug exactly: first call fails the way it failed that
# morning, the network comes up, the second call works.
S=$(mktemp -d); mkdir -p "$S/out"
STATUS=$(run_case "$S" authfail ok)
if [ "$STATUS" -eq 0 ]; then ok "retries past a transient auth failure"
else no "retries past a transient auth failure" "exited $STATUS, expected 0"; fi
if [ "$(attempts_made "$S")" -eq 2 ]; then ok "stops retrying once a call succeeds"
else no "stops retrying once a call succeeds" "made $(attempts_made "$S") attempts, expected 2"; fi
if grep -q '"title": "Ship the thing"' "$S/out/suggestions.json" 2>/dev/null; then
  ok "writes the recovered suggestions"
else no "writes the recovered suggestions" "suggestions.json missing or wrong"; fi
rm -rf "$S"

# --- output that is not JSON is a failure worth retrying too -----------------
# Claude sometimes answers in prose when a connector is down. That is a bad run,
# not a bad file, and the next attempt often succeeds.
S=$(mktemp -d); mkdir -p "$S/out"
STATUS=$(run_case "$S" garbage ok)
if [ "$STATUS" -eq 0 ]; then ok "retries when the model answers in prose"
else no "retries when the model answers in prose" "exited $STATUS, expected 0"; fi
if grep -q '"title": "Ship the thing"' "$S/out/suggestions.json" 2>/dev/null; then
  ok "recovers valid JSON after a prose answer"
else no "recovers valid JSON after a prose answer" "suggestions.json missing or wrong"; fi
rm -rf "$S"

# --- a good file is never replaced by a bad run ------------------------------
S=$(mktemp -d); mkdir -p "$S/out"
echo '{"suggestions":[{"title":"yesterday"}]}' > "$S/out/suggestions.json"
STATUS=$(run_case "$S" authfail authfail authfail authfail)
if [ "$STATUS" -ne 0 ]; then ok "reports failure when every attempt fails"
else no "reports failure when every attempt fails" "exited 0, expected non-zero"; fi
if grep -q 'yesterday' "$S/out/suggestions.json"; then ok "keeps the previous suggestions"
else no "keeps the previous suggestions" "the good file was overwritten"; fi
if [ "$(attempts_made "$S")" -gt 1 ]; then ok "retries before giving up"
else no "retries before giving up" "only $(attempts_made "$S") attempt"; fi

# --- and leaves the reason behind -------------------------------------------
# The whole point. "claude exited 1" is not a diagnosis.
if grep -q "Not logged in" "$S/out/refresh.log" 2>/dev/null; then
  ok "records why Claude failed, not just that it did"
else no "records why Claude failed, not just that it did" "refresh.log has no trace of the error"; fi
rm -rf "$S"

# --- the happy path stays a single call --------------------------------------
S=$(mktemp -d); mkdir -p "$S/out"
STATUS=$(run_case "$S" ok)
if [ "$STATUS" -eq 0 ] && [ "$(attempts_made "$S")" -eq 1 ]; then
  ok "calls Claude once when the first run succeeds"
else no "calls Claude once when the first run succeeds" "exit $STATUS, $(attempts_made "$S") attempts"; fi
rm -rf "$S"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
