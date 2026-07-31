# Focus Board: full-screen tab and a timer that stands on its own

Date: 2026-07-31
Branch: `feat/focus-board` (PR #1, unmerged — this lands as further commits on it)

## Problem

Focus Board today lives only in the 380px popup, and its timer is welded to a
task: `ActiveTimer.taskId` names one task, and every card carries its own
start/stop row. Three consequences:

1. There is nowhere to actually *work on* the board. The popup is too narrow to
   edit in, and it has no rename affordance at all — `renameTask` exists in the
   store and is called by nothing.
2. Starting the clock means picking a card, which is a second decision on top of
   the one the board already forced ("what is The One?"). The board knows what
   you are on. The timer should read that, not ask again.
3. Session length comes from a fixed preset list (`[15, 25, 50, 90, 0]`). Two
   hours is not on it.

## Design

### Timer decoupled from tasks

`ActiveTimer` loses `taskId` and gains a credit pointer:

```ts
export interface ActiveTimer {
  /** When this run started. Drives the countdown; never re-pointed. */
  startedAt: number;
  /** Length of THIS run in minutes; 0 means an open-ended stopwatch. */
  sessionMinutes: number;
  /** Task the clock is crediting right now, or null when Today has nothing open. */
  creditTaskId: string | null;
  /** Time has accrued to creditTaskId since this instant. */
  creditSince: number;
}
```

Two selectors in `timer.ts` define "what am I on":

- `currentTask(board)` — the first open task in Today. `todayTasks` already sorts
  The One first, so **starring is how you re-point the timer**. No separate
  control, and no second ordering mechanism to keep consistent with the star.
- `currentSubtask(task)` — that task's first unticked subtask, or null.

Every board write already funnels through `mutate()` in `store.ts`. `mutate`
gains one responsibility: after applying the change, if `currentTask(board)?.id`
no longer equals `timer.creditTaskId`, fold `now - creditSince` seconds into the
outgoing task's `secondsSpent`, then set `creditTaskId` to the new current task
and `creditSince` to now.

Putting it in `mutate` rather than in each mutation is deliberate — completing a
task, starring another, deleting the current one, and promoting from the backlog
all change what you are on, and none of them should have to remember to bank.
The invariant is stated once and cannot be routed around, which is the same
reason the three-task cap lives in the store.

When Today has nothing open, `creditTaskId` is null and the run keeps going
uncredited. That is honest: the time was spent, the board cannot say on what.

`startTimer` no longer takes a task id. `stopTimer` banks the outstanding credit
and clears the timer. `toggleTimer(taskId, …)` goes away.

### Timer panel

One module, `timer-panel.ts`, rendered into both surfaces:

- **Clock** — remaining time on a fixed run, elapsed on the stopwatch.
- **Now** — current task, and beneath it the current subtask. Ticking that
  subtask mid-run rolls the line to the next one without touching the clock.
  Falls back to "Nothing picked" when Today is empty.
- **Length** — a range input, 5 to 120 minutes in 5-minute steps, with a live
  label. Beside it an `∞` toggle for the open-ended stopwatch, which disables the
  slider while active. `∞` is a mode, not a duration; putting it at position zero
  on the slider would read as "a zero-minute session".
- **Start / Stop.** Stop banks the run and ends the session, as today. There is
  no pause — the store has no concept of one and nothing asked for it.
- **Blocking status** — the existing `blockingBanner` logic (which reads back
  installed DNR rules rather than trusting settings) moves in here.

Chosen session length is written back to `settings.focusBoard.sessionMinutes`
when a run starts, so the slider remembers where you left it.

### Full-screen tab

`src/features/focus-board/focus.html` + `focus.ts` + a `focus.css` for
tab-specific layout only. Registered in `vite.config.ts` `rollupOptions.input`
alongside the two existing standalone pages.

Opened with `chrome.tabs.create({ url: chrome.runtime.getURL(…) })` from a
**⤢ Open full board** button in the popup's Focus header, and from the Focus
Board options panel. Deliberately *not* a `web_accessible_resource`: only the
extension opens it. `blocked.html` needs that listing because DNR redirects to it
from web origins; this page has no such caller.

Layout is two columns — to-dos left (Today, add form, Suggested, Backlog), timer
panel sticky on the right. Below ~900px the columns stack, timer first. The popup
stays single-column and puts the same timer panel above the list.

### Editing

The tab's reason to exist. Click a task or subtask title to swap it for a text
input; Enter commits, Escape reverts, blur commits. `renameTask` already exists;
`renameSubtask` is new and mirrors it. Enabled in the popup too — it is the same
builder, and withholding it there would be an arbitrary difference.

Task reordering is **not** in scope. Today holds at most three items and the star
already decides which one leads.

### Refactor this requires

`popup-panel.ts` is 603 lines and owns every DOM builder; the `.fb-*` rules live
inside `popup.css`. Neither can be shared with a second surface as it stands.

| File | Role after |
|---|---|
| `board-view.ts` | new — shared DOM builders, taking a `'popup' \| 'tab'` mode |
| `timer-panel.ts` | new — the panel above |
| `popup-panel.ts` | shrinks to a thin `PopupPage` adapter over `board-view` |
| `focus.ts` / `focus.html` / `focus.css` | new — tab entry and its layout |
| `board.css` | new — the `.fb-*` block moved out of `popup.css`, `<link>`ed by both pages |

`mode` controls only what differs: the tab shows both lanes expanded
side-by-side and offers no "open full board" button; the popup collapses the
backlog into a `<details>` and does. Everything else is identical.

### Settings

`FocusBoardSettings.sessionPresets` is dropped — the slider replaces it. Its
bounds are constants in `types.ts` (`SESSION_MIN_MINUTES = 5`,
`SESSION_MAX_MINUTES = 120`, `SESSION_STEP_MINUTES = 5`), not settings; they
describe the control, not a preference. `sessionMinutes` stays as the remembered
length. A stored blob keeping a dead `sessionPresets` key is harmless — the
deep-merge only walks keys present in `DEFAULT_SETTINGS`.

## Migration

A `BoardState` persisted by the current build has `timer: { taskId, startedAt,
sessionMinutes }`. `getBoard` normalises it: a timer with a `taskId` and no
`creditSince` becomes `{ startedAt, sessionMinutes, creditTaskId: taskId,
creditSince: startedAt }`. That preserves an in-flight session across the update
rather than dropping it.

## Testing

Extends `tests/unit/focus-board.test.ts`:

- `currentTask` picks The One over an earlier-created task, skips done tasks,
  returns undefined on an empty Today
- `currentSubtask` returns the first unticked subtask, null when all are done
- completing the current task banks its share and re-points credit to the next
  open task
- starring another task mid-run splits the time between the two
- deleting the current task banks and re-points; deleting the last one leaves
  `creditTaskId` null with the timer still running
- `stopTimer` banks the outstanding credit
- an open-ended run accrues credit the same way
- a legacy `{ taskId, startedAt, sessionMinutes }` timer migrates on read

Then `npm run typecheck`, `CI=true npx vitest run` (plain `npm test` hangs
without a TTY — see CLAUDE.md), `npm run build`, and a manual pass in Chromium:
open the tab, rename a task and a subtask, run a 2-hour session, tick subtasks
underneath it, confirm the credit lands on the right cards and that blocking
still lifts at the end.

## Out of scope

- Pausing a run.
- Reordering tasks by drag.
- A "back to the board" link on `blocked.html`.

## As built — where the implementation departed from the above

- **`currentTask` lives in `store.ts`, not `timer.ts`.** It needs `todayTasks`,
  which is a board selector; importing that into `timer.ts` would have made the
  two modules circular. `currentSubtask` stayed in `timer.ts` — it only needs a
  task. Both are pure and unit-tested.
- **`mutate` gained a write queue and a no-op guard**, which the design did not
  anticipate. Mutations are read-modify-write against one storage key, and two in
  flight at once means the slower one writes a board it read before the faster
  one landed. Starting a session hits this exactly: it writes settings then the
  board, the settings write triggers a re-render, and that render's
  `rolloverIfNewDay` is itself a mutation that read a timer-less board and wrote
  it back over the timer. The timer silently failed to start, with no error.
  Fixed by serialising mutations through a promise chain and by skipping the
  write when `fn` returns the board unchanged.
- **`focus.ts` coalesces renders rather than dropping them.** The first cut used
  a plain `if (rendering) return;` guard, which discarded the storage event that
  mattered and left an idle-looking timer on screen while one was running. It now
  sets a `dirty` flag and re-runs.
- **The options page lost its session-length slider** instead of gaining a
  wider one. With the slider on the board next to the clock it governs, a second
  copy in settings would have been two places to change one number. That section
  is now an "Open the full board" button plus a note saying where length is set.
- **`src/shared/tokens.css` is new.** The design said `board.css` would be linked
  by both pages, but both pages also need the theme variables, and duplicating
  them in `popup.css` and `board.css` would let the two surfaces drift.
- **`blocked.ts` now uses `currentTask`** rather than the timer's task id, which
  no longer exists. The block page and the timer panel therefore always name the
  same task.
