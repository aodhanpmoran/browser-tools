#!/bin/bash
#
# Focus Board suggestions refresh.
#
# Runs headless Claude Code against the Fathom and Gmail MCP connectors, scores
# each candidate to-do for leverage, and writes ~/.browser-tools/suggestions.json
# for the browser extension to read.
#
# This has to run LOCALLY. Cloud routines cannot write to this machine, which is
# the whole reason the bridge exists. Scheduled via launchd — see
# docs/suggestions-agent.md.
#
# Claude writes to a temp file; we validate the JSON and only then swap it into
# place, so a bad run leaves yesterday's good suggestions untouched rather than
# replacing them with garbage.
#
# Two things this script learned the hard way, on 1 Aug:
#
#   1. launchd fires this on WAKE when the Mac was asleep at 07:00, which means
#      it can start before the network is up. Claude then fails in about three
#      seconds with "Not logged in · Please run /login" — it cannot refresh its
#      OAuth token with no route out. A single attempt therefore costs the whole
#      day's suggestions. Hence the network wait and the retries below.
#   2. The failure said only "claude exited 1", because the output holding the
#      reason was deleted on the failure path. The reason had to be dug out of
#      Claude's own session transcript. Whatever fails now says why, in the log.
#
# Tests: bash tests/refresh-suggestions.test.sh (stubs Claude, no network).

set -uo pipefail

# Overridable so the tests can run against a throwaway directory and a stub
# binary. Nothing else should set these.
OUT_DIR="${BROWSER_TOOLS_DIR:-$HOME/.browser-tools}"
OUT_FILE="$OUT_DIR/suggestions.json"
LOG_FILE="$OUT_DIR/refresh.log"
FAIL_FILE="$OUT_DIR/last-failure.txt"

mkdir -p "$OUT_DIR"
exec 2>>"$LOG_FILE"
echo "=== $(date '+%Y-%m-%d %H:%M:%S') refresh starting ===" >&2

CLAUDE_BIN="${CLAUDE_BIN:-$(command -v claude || echo "$HOME/.local/bin/claude")}"
if [ ! -x "$CLAUDE_BIN" ]; then
  echo "ERROR: claude CLI not found on PATH" >&2
  exit 1
fi

# Waits between attempts, in seconds; one per retry, so N delays means N+1
# attempts. Generous on purpose — a wake-time network usually takes a minute or
# two to settle, and nothing downstream cares whether the file lands at 07:01 or
# 07:20.
read -r -a RETRY_DELAYS <<< "${REFRESH_RETRY_DELAYS:-60 300 900}"
MAX_ATTEMPTS=$(( ${#RETRY_DELAYS[@]} + 1 ))

# Any HTTP answer at all means we have a route out; the status code is
# irrelevant. Overridden to `true` in tests.
NET_PROBE="${REFRESH_NET_PROBE:-curl -sS --head --max-time 5 -o /dev/null https://api.anthropic.com/}"
NET_WAIT_MAX="${REFRESH_NET_WAIT_MAX:-300}"

# Fired on wake, this runs while Wi-Fi is still associating. Waiting costs
# nothing; not waiting costs the day.
wait_for_network() {
  local waited=0
  until $NET_PROBE >/dev/null 2>&1; do
    if [ "$waited" -ge "$NET_WAIT_MAX" ]; then
      echo "WARN: no network after ${waited}s; attempting anyway" >&2
      return 1
    fi
    sleep 10
    waited=$(( waited + 10 ))
  done
  [ "$waited" -gt 0 ] && echo "network up after ${waited}s" >&2
  return 0
}

read -r -d '' PROMPT <<'PROMPT_EOF'
Build my Focus Board suggestions for today.

SOURCES
1. Fathom: action items from my calls in the last 3 days.
2. Gmail, two classes only:
   a. Threads where someone asked me something and I have not replied in 2+ days.
   b. Commitments I made in sent mail ("I'll send that over") that I have not delivered.
Ignore newsletters, notifications, automated mail, and marketing.

SCORING
Score every item 1-10 on exactly one question: if this were done, how much
easier or more irrelevant does it make everything else, measured against the
goal of EUR 10K/month recurring revenue? This is leverage, NOT urgency and NOT
effort.
  8-10 unblocks recurring revenue, or removes the need for several other tasks
  5-7  moves a live deal or commitment forward one concrete step
  1-4  real but inert: maintenance, tidying, courtesy replies
Be sparing at the top. If everything is a 9, nothing is.
Put the reason in leverageWhy as ONE short line.

SUBTASKS
Up to 3 concrete first steps each. Physical and specific, the smallest
startable action. Never restate the title.

OUTPUT
Print ONE JSON object and absolutely nothing else. No prose, no markdown fence,
no commentary before or after. At most 8 suggestions, highest leverage first.

{"generatedAt":"<ISO8601 now>","goal":"EUR 10K/mo recurring","suggestions":[
  {"id":"<stable slug, e.g. fathom-hobbs-q3>","title":"...","source":"fathom|gmail",
   "sourceDetail":"<e.g. Tue call / 2 days unanswered>","url":"<deep link or omit>",
   "leverage":9,"leverageWhy":"...","subtasks":["...","..."]}
]}

If a source returns nothing usable, emit a valid object with fewer suggestions.
Never emit an empty response.
PROMPT_EOF

TOOLS="mcp__claude_ai_Fathom__list_meetings,mcp__claude_ai_Fathom__get_meeting_summary,mcp__claude_ai_Fathom__search_meetings,mcp__claude_ai_Gmail__search_threads,mcp__claude_ai_Gmail__get_thread"

# Models sometimes wrap JSON in a fence despite instructions. Strip it, then
# validate — only valid JSON with a suggestions array is allowed to land.
validate_and_install() {
  python3 - "$1" "$OUT_FILE" <<'PY'
import json, re, sys, pathlib

tmp, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
raw = tmp.read_text().strip()

fenced = re.search(r"```(?:json)?\s*(.*?)```", raw, re.S)
if fenced:
    raw = fenced.group(1).strip()
# Fall back to the outermost braces if the model added stray prose.
if not raw.startswith("{"):
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end == -1:
        print("no JSON object in model output", file=sys.stderr)
        sys.exit(1)
    raw = raw[start:end + 1]

try:
    doc = json.loads(raw)
except json.JSONDecodeError as e:
    print(f"invalid JSON ({e})", file=sys.stderr)
    sys.exit(1)

if not isinstance(doc, dict) or not isinstance(doc.get("suggestions"), list):
    print("missing suggestions array", file=sys.stderr)
    sys.exit(1)

out.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
print(f"wrote {len(doc['suggestions'])} suggestions", file=sys.stderr)
PY
}

# The bug that hid the bug: keep whatever Claude actually said. A one-line
# summary goes in the log for the common case, the full text on disk for when
# that is not enough.
record_failure() {
  local reason="$1" output="$2"
  echo "attempt $attempt/$MAX_ATTEMPTS failed: $reason" >&2
  if [ -s "$output" ]; then
    cp "$output" "$FAIL_FILE"
    echo "  Claude said: $(head -c 400 "$output" | tr '\n\t' '  ')" >&2
    echo "  (full output in $FAIL_FILE)" >&2
  else
    echo "  Claude produced no output at all" >&2
  fi
}

wait_for_network

attempt=1
while : ; do
  TMP_FILE="$OUT_DIR/.suggestions.$$.$attempt.json"

  # stdin must be closed explicitly: with -p and an open stdin the CLI waits
  # several seconds for piped input that is never coming.
  "$CLAUDE_BIN" -p "$PROMPT" \
    --allowedTools "$TOOLS" \
    --model claude-sonnet-5 \
    < /dev/null \
    > "$TMP_FILE"
  CLAUDE_STATUS=$?

  if [ $CLAUDE_STATUS -eq 0 ]; then
    # Prose instead of JSON is a bad run, not a bad file — a connector was
    # probably down — so it retries alongside the hard failures.
    if validate_and_install "$TMP_FILE"; then
      rm -f "$TMP_FILE"
      echo "=== $(date '+%Y-%m-%d %H:%M:%S') refresh finished (attempt $attempt) ===" >&2
      exit 0
    fi
    record_failure "output was not usable JSON" "$TMP_FILE"
  else
    record_failure "claude exited $CLAUDE_STATUS" "$TMP_FILE"
  fi
  rm -f "$TMP_FILE"

  if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
    echo "ERROR: all $MAX_ATTEMPTS attempts failed; keeping previous suggestions" >&2
    echo "=== $(date '+%Y-%m-%d %H:%M:%S') refresh finished (failed) ===" >&2
    exit 1
  fi

  delay=${RETRY_DELAYS[$(( attempt - 1 ))]}
  echo "  retrying in ${delay}s" >&2
  sleep "$delay"
  attempt=$(( attempt + 1 ))
done
