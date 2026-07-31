import type { ActiveTimer, Subtask, Task } from './types';

/** Seconds the current run has been going, regardless of who it is crediting. */
export function runSeconds(timer: ActiveTimer | null, now: number): number {
  if (!timer) return 0;
  return Math.max(0, Math.floor((now - timer.startedAt) / 1000));
}

/**
 * Seconds accrued to the timer's current task since it was last settled. This
 * is the slice that has not been folded into `secondsSpent` yet.
 */
export function creditSeconds(timer: ActiveTimer | null, taskId: string, now: number): number {
  if (!timer || timer.creditTaskId !== taskId) return 0;
  return Math.max(0, Math.floor((now - timer.creditSince) / 1000));
}

/** Total time on a task: banked seconds plus the un-settled slice, if it is the one being credited. */
export function taskSeconds(task: Task, timer: ActiveTimer | null, now: number): number {
  return task.secondsSpent + creditSeconds(timer, task.id, now);
}

/**
 * Seconds left in the current run, or null when it is an open-ended stopwatch
 * or nothing is running. Clamps at 0 — an overrun reads as done, not negative.
 */
export function sessionRemaining(timer: ActiveTimer | null, now: number): number | null {
  if (!timer || timer.sessionMinutes <= 0) return null;
  const elapsed = Math.floor((now - timer.startedAt) / 1000);
  return Math.max(0, timer.sessionMinutes * 60 - elapsed);
}

/** Epoch ms this run is due to finish, or null for an open-ended stopwatch. */
export function sessionEndsAt(timer: ActiveTimer | null): number | null {
  if (!timer || timer.sessionMinutes <= 0) return null;
  return timer.startedAt + timer.sessionMinutes * 60_000;
}

/** True once a fixed-length run has served its time. */
export function isSessionOver(timer: ActiveTimer | null, now: number): boolean {
  const endsAt = sessionEndsAt(timer);
  return endsAt !== null && now >= endsAt;
}

/** The first unticked subtask — what "and right now, this bit" points at. */
export function currentSubtask(task: Task | undefined): Subtask | undefined {
  return task?.subtasks.find((s) => !s.done);
}

/** m:ss under an hour, h:mm above it. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  if (hours > 0) {
    const mins = Math.floor((total % 3600) / 60);
    return `${hours}:${String(mins).padStart(2, '0')}`;
  }
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/** Big-clock form: always h:mm:ss above an hour so a 2h block reads as one. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const tail = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${tail}` : tail;
}

/** Short badge text: minutes only, capped to 4 chars so Chrome doesn't clip it. */
export function formatBadge(seconds: number): string {
  const mins = Math.floor(Math.max(0, seconds) / 60);
  if (mins < 60) return String(mins);
  const hours = Math.floor(mins / 60);
  return `${hours}h`;
}

/** "50 min" / "1h 30m" / "stopwatch" — the slider's readout. */
export function formatSessionLength(minutes: number): string {
  if (minutes <= 0) return 'stopwatch';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

export function countDone(subtasks: readonly { done: boolean }[]): number {
  return subtasks.reduce((n, s) => n + (s.done ? 1 : 0), 0);
}

/** Local calendar day as YYYY-MM-DD. Used to decide when to roll the board over. */
export function dayKey(now: number): string {
  const d = new Date(now);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}
