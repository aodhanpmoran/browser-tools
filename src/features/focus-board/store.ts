import { creditSeconds, dayKey } from './timer';
import {
  EMPTY_BOARD,
  TODAY_CAP,
  type ActiveTimer,
  type BoardState,
  type Lane,
  type LegacyActiveTimer,
  type Task,
} from './types';

const KEY = 'focusBoard';
const LOCK_NAME = 'bt-focusBoard';

export async function getBoard(): Promise<BoardState> {
  const result = await chrome.storage.local.get(KEY);
  return normaliseBoard(result[KEY]);
}

/**
 * Shapes whatever is on disk into a BoardState, including a timer written by
 * the pre-decoupling build. Migrating rather than dropping means a session
 * running when the extension updates survives the update.
 */
export function normaliseBoard(stored: unknown): BoardState {
  if (!stored || typeof stored !== 'object') return structuredClone(EMPTY_BOARD);
  const board = stored as Partial<BoardState> & { timer?: unknown };
  return {
    tasks: Array.isArray(board.tasks) ? board.tasks : [],
    timer: normaliseTimer(board.timer),
    lastRollover: typeof board.lastRollover === 'string' ? board.lastRollover : '',
    dismissed: Array.isArray(board.dismissed) ? board.dismissed : [],
  };
}

function normaliseTimer(stored: unknown): ActiveTimer | null {
  if (!stored || typeof stored !== 'object') return null;
  const timer = stored as Partial<ActiveTimer> & Partial<LegacyActiveTimer>;
  if (typeof timer.startedAt !== 'number') return null;
  const sessionMinutes = typeof timer.sessionMinutes === 'number' ? timer.sessionMinutes : 0;

  // Legacy shape: one task owned the clock for its whole run, so all of the
  // time so far belongs to that task and none of it has been settled yet.
  if (typeof timer.creditSince !== 'number') {
    return {
      startedAt: timer.startedAt,
      sessionMinutes,
      creditTaskId: typeof timer.taskId === 'string' ? timer.taskId : null,
      creditSince: timer.startedAt,
    };
  }

  return {
    startedAt: timer.startedAt,
    sessionMinutes,
    creditTaskId: typeof timer.creditTaskId === 'string' ? timer.creditTaskId : null,
    creditSince: timer.creditSince,
  };
}

async function setBoard(next: BoardState): Promise<BoardState> {
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

/**
 * Serialises mutations within a page. Every mutation here is a read-modify-write
 * against one storage key, so two in flight at once means the slower one writes
 * a board it read before the faster one landed — silently undoing it.
 *
 * That is not theoretical: starting a session writes settings and the board in
 * quick succession, and the settings write triggers a re-render whose rollover
 * check is itself a mutation. Without this queue the rollover read a timer-less
 * board and wrote it back over the timer that had just started.
 */
let writeQueue: Promise<unknown> = Promise.resolve();
// (Fallback only: used when navigator.locks is unavailable.)

/**
 * Read-modify-write helper. Every mutation below goes through this, and every
 * one of them settles the timer's credit afterwards — completing a task,
 * starring another, deleting the current one and promoting from the backlog all
 * change what you are working on, and none of them should have to remember.
 */
async function mutate(fn: (board: BoardState) => BoardState): Promise<BoardState> {
  const body = async (): Promise<BoardState> => {
    const board = await getBoard();
    const next = settleCredit(fn(board), Date.now());
    // A mutation that changed nothing must not write: the write would still
    // land as a storage event and could stamp on a concurrent one from another
    // page. `fn` returns the board it was given when there is nothing to do.
    return next === board ? board : setBoard(next);
  };
  // A Web Lock serialises across the worker and every extension page, which the
  // in-page queue cannot. It queues FIFO, so it also orders this page's own calls.
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(LOCK_NAME, body);
  }
  const run = writeQueue.then(body);
  writeQueue = run.catch(() => undefined);
  return run;
}

export async function clearBoard(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}

export function todayTasks(board: BoardState): Task[] {
  const today = board.tasks.filter((t) => t.lane === 'today');
  // The One first, then insertion order — starred work should be impossible to scroll past.
  return today.sort((a, b) => Number(b.starred) - Number(a.starred) || a.createdAt - b.createdAt);
}

export function backlogTasks(board: BoardState): Task[] {
  return board.tasks.filter((t) => t.lane === 'backlog').sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * What you are on right now: the top open task in Today. Because `todayTasks`
 * sorts The One first, starring a task is how you re-point the timer — there is
 * no second mechanism to keep in step with the star.
 */
export function currentTask(board: BoardState): Task | undefined {
  return todayTasks(board).find((t) => !t.done);
}

/**
 * Points the timer's credit at whatever is current, folding what the outgoing
 * task earned into its banked seconds first.
 *
 * Only acts when the current task actually changed. Re-settling on every write
 * would drop the sub-second remainder each time, and the drift would be real
 * over a two-hour block.
 *
 * Time credited to a task that has since been deleted goes with it — there is
 * nowhere honest to put it.
 */
export function settleCredit(board: BoardState, now: number): BoardState {
  if (!board.timer) return board;
  const nextId = currentTask(board)?.id ?? null;
  if (nextId === board.timer.creditTaskId) return board;

  const outgoingId = board.timer.creditTaskId;
  const earned = outgoingId ? creditSeconds(board.timer, outgoingId, now) : 0;
  const tasks =
    earned > 0
      ? board.tasks.map((t) =>
          t.id === outgoingId ? { ...t, secondsSpent: t.secondsSpent + earned } : t,
        )
      : board.tasks;

  return { ...board, tasks, timer: { ...board.timer, creditTaskId: nextId, creditSince: now } };
}

/** Open (not-done) Today tasks — this is what the cap counts. */
export function todayOpenCount(board: BoardState): number {
  return board.tasks.filter((t) => t.lane === 'today' && !t.done).length;
}

export function isTodayFull(board: BoardState): boolean {
  return todayOpenCount(board) >= TODAY_CAP;
}

export function findTask(board: BoardState, id: string): Task | undefined {
  return board.tasks.find((t) => t.id === id);
}

function newId(): string {
  return crypto.randomUUID();
}

/**
 * Adds a task. A `today` request silently lands in the backlog when Today is
 * full — the cap is enforced here so no caller can route around it.
 */
export async function addTask(title: string, lane: Lane): Promise<BoardState> {
  const trimmed = title.trim();
  if (!trimmed) return getBoard();
  return mutate((board) => {
    const target: Lane = lane === 'today' && isTodayFull(board) ? 'backlog' : lane;
    const task: Task = {
      id: newId(),
      title: trimmed,
      lane: target,
      // First task into an empty Today becomes The One automatically.
      starred: target === 'today' && !board.tasks.some((t) => t.starred && !t.done),
      done: false,
      subtasks: [],
      secondsSpent: 0,
      createdAt: Date.now(),
    };
    return { ...board, tasks: [...board.tasks, task] };
  });
}

export async function renameTask(id: string, title: string): Promise<BoardState> {
  const trimmed = title.trim();
  if (!trimmed) return getBoard();
  return mutate((board) => ({
    ...board,
    tasks: board.tasks.map((t) => (t.id === id ? { ...t, title: trimmed } : t)),
  }));
}

export async function deleteTask(id: string): Promise<BoardState> {
  return mutate((board) => ({
    ...board,
    tasks: board.tasks.filter((t) => t.id !== id),
  }));
}

/** Moves a backlog task into Today. No-op when Today is already full. */
export async function promoteToToday(id: string): Promise<BoardState> {
  return mutate((board) => {
    if (isTodayFull(board)) return board;
    const hasTheOne = board.tasks.some((t) => t.starred && !t.done && t.lane === 'today');
    return {
      ...board,
      tasks: board.tasks.map((t) =>
        t.id === id ? { ...t, lane: 'today' as Lane, done: false, starred: !hasTheOne } : t,
      ),
    };
  });
}

export async function demoteToBacklog(id: string): Promise<BoardState> {
  return mutate((board) => ({
    ...board,
    tasks: board.tasks.map((t) =>
      t.id === id ? { ...t, lane: 'backlog' as Lane, starred: false } : t,
    ),
  }));
}

/** Stars one task as The One and un-stars every other. */
export async function setTheOne(id: string): Promise<BoardState> {
  return mutate((board) => ({
    ...board,
    tasks: board.tasks.map((t) => ({ ...t, starred: t.id === id })),
  }));
}

export async function toggleTaskDone(id: string): Promise<BoardState> {
  return mutate((board) => {
    const task = findTask(board, id);
    if (!task) return board;
    const done = !task.done;
    return {
      ...board,
      tasks: board.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              done,
              completedAt: done ? Date.now() : undefined,
              // Finishing a task also completes every subtask — no orphan checkboxes.
              subtasks: done ? t.subtasks.map((s) => ({ ...s, done: true })) : t.subtasks,
            }
          : t,
      ),
    };
  });
}

export async function addSubtask(taskId: string, title: string): Promise<BoardState> {
  const trimmed = title.trim();
  if (!trimmed) return getBoard();
  return mutate((board) => ({
    ...board,
    tasks: board.tasks.map((t) =>
      t.id === taskId
        ? { ...t, subtasks: [...t.subtasks, { id: newId(), title: trimmed, done: false }] }
        : t,
    ),
  }));
}

export async function renameSubtask(
  taskId: string,
  subtaskId: string,
  title: string,
): Promise<BoardState> {
  const trimmed = title.trim();
  if (!trimmed) return getBoard();
  return mutate((board) => ({
    ...board,
    tasks: board.tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            subtasks: t.subtasks.map((s) => (s.id === subtaskId ? { ...s, title: trimmed } : s)),
          }
        : t,
    ),
  }));
}

export async function toggleSubtask(taskId: string, subtaskId: string): Promise<BoardState> {
  return mutate((board) => ({
    ...board,
    tasks: board.tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            subtasks: t.subtasks.map((s) => (s.id === subtaskId ? { ...s, done: !s.done } : s)),
          }
        : t,
    ),
  }));
}

export async function deleteSubtask(taskId: string, subtaskId: string): Promise<BoardState> {
  return mutate((board) => ({
    ...board,
    tasks: board.tasks.map((t) =>
      t.id === taskId ? { ...t, subtasks: t.subtasks.filter((s) => s.id !== subtaskId) } : t,
    ),
  }));
}

/**
 * Starts a run of the given length (0 = open-ended stopwatch), crediting
 * whatever is current. Takes no task id: the board already knows what you are
 * on, and asking again would be a second decision on top of the star.
 */
export async function startTimer(sessionMinutes: number): Promise<BoardState> {
  return mutate((board) => {
    const now = Date.now();
    const settled = settleCredit(board, now);
    return {
      ...settled,
      timer: {
        startedAt: now,
        sessionMinutes: Math.max(0, sessionMinutes),
        creditTaskId: currentTask(settled)?.id ?? null,
        creditSince: now,
      },
    };
  });
}

/** Ends the run, banking whatever the current task has earned since the last settle. */
export async function stopTimer(): Promise<BoardState> {
  return mutate((board) => {
    if (!board.timer) return board;
    const now = Date.now();
    const earned = board.timer.creditTaskId
      ? creditSeconds(board.timer, board.timer.creditTaskId, now)
      : 0;
    const creditTaskId = board.timer.creditTaskId;
    return {
      ...board,
      tasks:
        earned > 0
          ? board.tasks.map((t) =>
              t.id === creditTaskId ? { ...t, secondsSpent: t.secondsSpent + earned } : t,
            )
          : board.tasks,
      timer: null,
    };
  });
}

export async function dismissSuggestion(id: string): Promise<BoardState> {
  return mutate((board) =>
    board.dismissed.includes(id) ? board : { ...board, dismissed: [...board.dismissed, id] },
  );
}

export async function clearDismissed(): Promise<BoardState> {
  return mutate((board) => ({ ...board, dismissed: [] }));
}

/**
 * Turns a suggestion into a real task, with its pre-broken steps attached, and
 * marks it dismissed so it cannot be added twice. Lands in Today when there is
 * room, otherwise the backlog — the cap still wins.
 */
export async function acceptSuggestion(suggestion: {
  id: string;
  title: string;
  subtasks: readonly string[];
}): Promise<BoardState> {
  return mutate((board) => {
    const lane: Lane = isTodayFull(board) ? 'backlog' : 'today';
    const task: Task = {
      id: newId(),
      title: suggestion.title,
      lane,
      starred: lane === 'today' && !board.tasks.some((t) => t.starred && !t.done),
      done: false,
      subtasks: suggestion.subtasks.map((title) => ({ id: newId(), title, done: false })),
      secondsSpent: 0,
      createdAt: Date.now(),
    };
    const dismissed = board.dismissed.includes(suggestion.id)
      ? board.dismissed
      : [...board.dismissed, suggestion.id];
    return { ...board, tasks: [...board.tasks, task], dismissed };
  });
}

/** Drops finished tasks. Used by the daily rollover and the manual clear button. */
export async function clearCompleted(): Promise<BoardState> {
  return mutate((board) => ({ ...board, tasks: board.tasks.filter((t) => !t.done) }));
}

/**
 * Once per local day, clear out yesterday's finished work so Today starts empty.
 * Unfinished Today tasks carry over deliberately — they were the priority and
 * still are. Returns the (possibly unchanged) board.
 */
export async function rolloverIfNewDay(enabled: boolean): Promise<BoardState> {
  return mutate((board) => {
    const today = dayKey(Date.now());
    if (board.lastRollover === today) return board;
    const tasks = enabled && board.lastRollover ? board.tasks.filter((t) => !t.done) : board.tasks;
    return { ...board, tasks, lastRollover: today };
  });
}
