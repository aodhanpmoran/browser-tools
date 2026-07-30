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

set -uo pipefail

OUT_DIR="$HOME/.browser-tools"
OUT_FILE="$OUT_DIR/suggestions.json"
TMP_FILE="$OUT_DIR/.suggestions.$$.json"
LOG_FILE="$OUT_DIR/refresh.log"

mkdir -p "$OUT_DIR"
exec 2>>"$LOG_FILE"
echo "=== $(date '+%Y-%m-%d %H:%M:%S') refresh starting ===" >&2

CLAUDE_BIN="$(command -v claude || echo "$HOME/.local/bin/claude")"
if [ ! -x "$CLAUDE_BIN" ]; then
  echo "ERROR: claude CLI not found on PATH" >&2
  exit 1
fi

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

"$CLAUDE_BIN" -p "$PROMPT" \
  --allowedTools "$TOOLS" \
  --model claude-sonnet-5 \
  > "$TMP_FILE"
STATUS=$?

if [ $STATUS -ne 0 ]; then
  echo "ERROR: claude exited $STATUS; keeping previous suggestions" >&2
  rm -f "$TMP_FILE"
  exit $STATUS
fi

# Models sometimes wrap JSON in a fence despite instructions. Strip it, then
# validate — only valid JSON with a suggestions array is allowed to land.
python3 - "$TMP_FILE" "$OUT_FILE" <<'PY'
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
        print("ERROR: no JSON object in model output", file=sys.stderr)
        tmp.unlink(missing_ok=True)
        sys.exit(1)
    raw = raw[start:end + 1]

try:
    doc = json.loads(raw)
except json.JSONDecodeError as e:
    print(f"ERROR: invalid JSON ({e}); keeping previous suggestions", file=sys.stderr)
    tmp.unlink(missing_ok=True)
    sys.exit(1)

if not isinstance(doc, dict) or not isinstance(doc.get("suggestions"), list):
    print("ERROR: missing suggestions array; keeping previous", file=sys.stderr)
    tmp.unlink(missing_ok=True)
    sys.exit(1)

out.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
tmp.unlink(missing_ok=True)
print(f"wrote {len(doc['suggestions'])} suggestions", file=sys.stderr)
PY
PY_STATUS=$?

echo "=== $(date '+%Y-%m-%d %H:%M:%S') refresh finished (status $PY_STATUS) ===" >&2
exit $PY_STATUS
