/** Hard cap on the Today lane. The constraint is the feature — see options panel copy. */
export const TODAY_CAP = 3;

/**
 * Bounds of the session-length slider. Constants rather than settings: they
 * describe the control, not a preference. 5-minute steps keep the thumb
 * landing on round numbers you would actually say out loud.
 */
export const SESSION_MIN_MINUTES = 5;
export const SESSION_MAX_MINUTES = 120;
export const SESSION_STEP_MINUTES = 5;

export type Lane = 'today' | 'backlog';

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  lane: Lane;
  /** Exactly one task may be starred: "The One" that has to happen today. */
  starred: boolean;
  done: boolean;
  subtasks: Subtask[];
  /** Seconds banked from finished timer runs. Live time is added on top at render. */
  secondsSpent: number;
  createdAt: number;
  completedAt?: number;
}

/**
 * A focus run. Deliberately NOT tied to a task: you start the clock, and it
 * credits whatever Today's top open task happens to be, following along as you
 * tick things off. `startedAt` drives the countdown and is never re-pointed;
 * the credit pair moves underneath it.
 */
export interface ActiveTimer {
  /** Epoch ms when this run started. Fixes the finish line. */
  startedAt: number;
  /**
   * Length of THIS run in minutes; 0 means an open-ended stopwatch. Snapshotted
   * onto the timer so changing the default mid-session cannot move the finish
   * line — and so the blocker knows exactly when to lift.
   */
  sessionMinutes: number;
  /** Task being credited right now, or null when Today has nothing open. */
  creditTaskId: string | null;
  /** Time has accrued to `creditTaskId` since this instant. */
  creditSince: number;
}

/** The pre-decoupling timer shape, still on disk for anyone mid-session at update time. */
export interface LegacyActiveTimer {
  taskId: string;
  startedAt: number;
  sessionMinutes: number;
}

export interface BoardState {
  tasks: Task[];
  timer: ActiveTimer | null;
  /** YYYY-MM-DD of the last rollover, so completed work clears once per day. */
  lastRollover: string;
  /** Suggestion ids waved away, so a regenerated file does not re-offer them. */
  dismissed: string[];
}

export const EMPTY_BOARD: BoardState = {
  tasks: [],
  timer: null,
  lastRollover: '',
  dismissed: [],
};
