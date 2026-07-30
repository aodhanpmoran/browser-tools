# Focus Board suggestions agent

The extension cannot reach Fathom or Gmail. Those live behind MCP connectors on
the desktop, and a Chrome extension has no route to them. So the flow is:

```
scheduled Claude agent (morning)
  Fathom MCP  ->  action items from recent calls
  Gmail MCP   ->  threads awaiting a reply, commitments made in sent mail
       |
       v   score each 1-10 for leverage, break into steps
  ~/.browser-tools/suggestions.json
       |
       v   extension reads it via file:// on popup open
  "Suggested" section above Today
```

Nothing is auto-added. Each suggestion is accepted or dismissed by hand — the
three-task cap is the whole point of the board and an agent must not spend it.

## File contract

Written to `~/.browser-tools/suggestions.json`. The extension validates
defensively (`src/features/focus-board/suggestions.ts`): unusable entries are
dropped rather than thrown on, so a partial file still yields a useful morning.

```json
{
  "generatedAt": "2026-07-30T07:00:00.000Z",
  "goal": "€10K/mo recurring",
  "suggestions": [
    {
      "id": "fathom-hobbs-q3",
      "title": "Send Eddie Hobbs the Q3 numbers with the renewal ask",
      "source": "fathom",
      "sourceDetail": "Tue call",
      "url": "https://fathom.video/calls/123",
      "leverage": 9,
      "leverageWhy": "Renewal unblocks recurring revenue; three other follow-ups wait on this",
      "subtasks": ["Pull Q3 open/click stats", "Draft one-page summary", "Send with renewal ask"]
    }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `id` | no | Stable across runs so a dismissal sticks. Derived from `source:title` when absent. |
| `title` | **yes** | Entries without one are dropped. Trimmed, capped at 200 chars. |
| `source` | no | Free-form chip, e.g. `fathom` / `gmail`. Defaults to `note`. |
| `sourceDetail` | no | Human context: "Tue call", "2 days unanswered". |
| `url` | no | Deep link back to the call or thread. |
| `leverage` | no | 1-10, clamped. Absent or unparseable scores land at a neutral 5, never 1. |
| `leverageWhy` | no | One line. Shown under the title — this is what makes a 9 legible. |
| `subtasks` | no | Max 10 strings. Attached to the task on accept. |

Caps: 8 suggestions per file (more and the suggestion list becomes the very
backlog graveyard the board exists to avoid), 10 subtasks each.

## The leverage question

Every item is scored on one question:

> **If this were done, how much easier or more irrelevant does it make
> everything else — measured against €10K/month recurring?**

That is not urgency and not effort. A 9 is a candidate for The One. A 3 is
something that will feel productive and change nothing. Scoring is the entire
value of running this through a model rather than scraping an API: a raw Fathom
action item is a string, whereas "this unblocks the renewal that three other
threads are waiting on" is a decision.

Rules of thumb:

- **8-10** — unblocks recurring revenue, or removes the need for several other
  tasks entirely.
- **5-7** — moves a live deal or commitment forward one concrete step.
- **1-4** — real but inert. Maintenance, tidying, courtesy replies.

Score sparingly at the top. If everything is a 9, nothing is.

## Sources

**Fathom** — action items from calls in the last ~3 days. Fathom's own summary
already extracts them; the job here is judging which matter and what the first
concrete step is.

**Gmail** — two classes, both agreed:
1. *Threads awaiting a reply.* Someone asked something and there has been no
   response in 2+ days.
2. *Commitments made in sent mail.* You wrote "I'll send that over" and did not.
   This one needs a model reading the thread, which is exactly why the bridge
   design was chosen over direct API access.

Skip newsletters, notifications, and anything already on the board — the
extension de-duplicates by title, but a clean file is easier to read.

## Prompt used by the schedule

> Read my Fathom calls from the last 3 days and my Gmail for (a) threads
> awaiting my reply for 2+ days and (b) commitments I made in sent mail that I
> have not delivered. Turn them into at most 8 suggested to-dos.
>
> Score each 1-10 on: if this were done, how much easier or more irrelevant
> does it make everything else, measured against the goal of €10K/month
> recurring? Put the reason in `leverageWhy` in one line. Break each into up to
> 3 concrete first steps — physical and specific, the smallest startable action,
> not restatements of the title.
>
> Write the result to `~/.browser-tools/suggestions.json` in the schema at
> `docs/suggestions-agent.md`. Overwrite the file. Do not add anything to the
> board itself.

## Setup on a new machine

1. Load the extension, open Settings → Focus Board → **Detect** to fill the path.
2. Tick **Allow access to file URLs** on the extension's card in
   `chrome://extensions`. Do it outside a focus session — the blocker guards
   that page.
3. Schedule the prompt above to run each morning.

If the file is missing the section simply does not render; that is the normal
state before the first run, not an error.
