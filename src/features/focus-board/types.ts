/** Hard cap on the Today lane. The constraint is the feature — see options panel copy. */
export const TODAY_CAP = 3;

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

export interface ActiveTimer {
  taskId: string;
  /** Epoch ms when the current run started. Pausing banks the run into the task. */
  startedAt: number;
  /**
   * Length of THIS run in minutes; 0 means an open-ended stopwatch. Snapshotted
   * onto the timer so changing the default mid-session cannot move the finish
   * line — and so the blocker knows exactly when to lift.
   */
  sessionMinutes: number;
}

export interface BoardState {
  tasks: Task[];
  timer: ActiveTimer | null;
  /** YYYY-MM-DD of the last rollover, so completed work clears once per day. */
  lastRollover: string;
}

export const EMPTY_BOARD: BoardState = {
  tasks: [],
  timer: null,
  lastRollover: '',
};
