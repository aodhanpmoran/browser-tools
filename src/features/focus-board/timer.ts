import type { ActiveTimer, Task } from './types';

/** Seconds the current timer run has been going. 0 when the timer is not this task's. */
export function runSeconds(timer: ActiveTimer | null, taskId: string, now: number): number {
  if (!timer || timer.taskId !== taskId) return 0;
  return Math.max(0, Math.floor((now - timer.startedAt) / 1000));
}

/** Total time on a task: banked seconds plus the live run, if any. */
export function taskSeconds(task: Task, timer: ActiveTimer | null, now: number): number {
  return task.secondsSpent + runSeconds(timer, task.id, now);
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

/** Short badge text: minutes only, capped to 4 chars so Chrome doesn't clip it. */
export function formatBadge(seconds: number): string {
  const mins = Math.floor(Math.max(0, seconds) / 60);
  if (mins < 60) return String(mins);
  const hours = Math.floor(mins / 60);
  return `${hours}h`;
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
