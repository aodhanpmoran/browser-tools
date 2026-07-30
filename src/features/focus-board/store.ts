import { dayKey, runSeconds } from './timer';
import { EMPTY_BOARD, TODAY_CAP, type BoardState, type Lane, type Task } from './types';

const KEY = 'focusBoard';

export async function getBoard(): Promise<BoardState> {
  const result = await chrome.storage.local.get(KEY);
  const stored = result[KEY] as Partial<BoardState> | undefined;
  return {
    tasks: Array.isArray(stored?.tasks) ? stored.tasks : [],
    timer: stored?.timer ?? null,
    lastRollover: typeof stored?.lastRollover === 'string' ? stored.lastRollover : '',
    dismissed: Array.isArray(stored?.dismissed) ? stored.dismissed : [],
  };
}

async function setBoard(next: BoardState): Promise<BoardState> {
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

/** Read-modify-write helper. Every mutation below goes through this. */
async function mutate(fn: (board: BoardState) => BoardState): Promise<BoardState> {
  return setBoard(fn(await getBoard()));
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
    timer: board.timer?.taskId === id ? null : board.timer,
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
    timer: board.timer?.taskId === id ? null : board.timer,
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
    // Completing a task banks any live timer time and stops the clock.
    const banked = done ? runSeconds(board.timer, id, Date.now()) : 0;
    return {
      ...board,
      tasks: board.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              done,
              completedAt: done ? Date.now() : undefined,
              secondsSpent: t.secondsSpent + banked,
              // Finishing a task also completes every subtask — no orphan checkboxes.
              subtasks: done ? t.subtasks.map((s) => ({ ...s, done: true })) : t.subtasks,
            }
          : t,
      ),
      timer: done && board.timer?.taskId === id ? null : board.timer,
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
 * Starts (or switches) the timer for a given number of minutes (0 = open-ended
 * stopwatch). Banks the outgoing task's run first.
 */
export async function startTimer(taskId: string, sessionMinutes: number): Promise<BoardState> {
  return mutate((board) => {
    const banked = bankRun(board);
    return {
      ...banked,
      timer: { taskId, startedAt: Date.now(), sessionMinutes: Math.max(0, sessionMinutes) },
    };
  });
}

export async function stopTimer(): Promise<BoardState> {
  return mutate((board) => ({ ...bankRun(board), timer: null }));
}

export async function toggleTimer(taskId: string, sessionMinutes: number): Promise<BoardState> {
  const board = await getBoard();
  return board.timer?.taskId === taskId ? stopTimer() : startTimer(taskId, sessionMinutes);
}

/** Folds the live run into its task's banked seconds. Timer itself is untouched. */
function bankRun(board: BoardState): BoardState {
  if (!board.timer) return board;
  const seconds = runSeconds(board.timer, board.timer.taskId, Date.now());
  if (seconds <= 0) return board;
  const taskId = board.timer.taskId;
  return {
    ...board,
    tasks: board.tasks.map((t) =>
      t.id === taskId ? { ...t, secondsSpent: t.secondsSpent + seconds } : t,
    ),
  };
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
