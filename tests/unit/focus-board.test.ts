import { describe, expect, it } from 'vitest';
import {
  countDone,
  creditSeconds,
  currentSubtask,
  dayKey,
  formatBadge,
  formatClock,
  formatDuration,
  formatSessionLength,
  isSessionOver,
  runSeconds,
  sessionEndsAt,
  sessionRemaining,
  taskSeconds,
} from '../../src/features/focus-board/timer';
import {
  currentTask,
  normaliseBoard,
  settleCredit,
  todayTasks,
} from '../../src/features/focus-board/store';
import type { ActiveTimer, BoardState, Task } from '../../src/features/focus-board/types';

const T0 = 1_700_000_000_000;

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'a',
    title: 'Ship it',
    lane: 'today',
    starred: false,
    done: false,
    subtasks: [],
    secondsSpent: 0,
    createdAt: T0,
    ...overrides,
  };
}

const timerOn = (
  creditTaskId: string | null,
  sessionMinutes = 25,
  startedAt = T0,
  creditSince = startedAt,
): ActiveTimer => ({ startedAt, sessionMinutes, creditTaskId, creditSince });

function board(tasks: Task[], timer: ActiveTimer | null = null): BoardState {
  return { tasks, timer, lastRollover: '', dismissed: [] };
}

describe('runSeconds', () => {
  it('is 0 when no timer is running', () => {
    expect(runSeconds(null, T0 + 60_000)).toBe(0);
  });

  it('counts whole seconds since the run started, whoever is being credited', () => {
    expect(runSeconds(timerOn('a'), T0 + 90_500)).toBe(90);
    expect(runSeconds(timerOn(null), T0 + 90_500)).toBe(90);
  });

  it('never goes negative if the clock jumps backwards', () => {
    expect(runSeconds(timerOn('a'), T0 - 5_000)).toBe(0);
  });
});

describe('creditSeconds', () => {
  it('is 0 when the credit points at a different task', () => {
    expect(creditSeconds(timerOn('b'), 'a', T0 + 60_000)).toBe(0);
  });

  it('counts from the last settle, not from the start of the run', () => {
    const timer = timerOn('a', 50, T0, T0 + 30_000);
    expect(creditSeconds(timer, 'a', T0 + 90_000)).toBe(60);
  });

  it('is 0 when nothing is running', () => {
    expect(creditSeconds(null, 'a', T0)).toBe(0);
  });
});

describe('taskSeconds', () => {
  it('adds the un-settled slice to banked time', () => {
    expect(taskSeconds(task({ secondsSpent: 300 }), timerOn('a'), T0 + 60_000)).toBe(360);
  });

  it('returns only banked time for a task the clock is not crediting', () => {
    expect(taskSeconds(task({ secondsSpent: 300 }), timerOn('b'), T0 + 60_000)).toBe(300);
  });

  it('returns only banked time when nothing is running', () => {
    expect(taskSeconds(task({ secondsSpent: 300 }), null, T0 + 60_000)).toBe(300);
  });
});

describe('currentTask', () => {
  it('is undefined when Today is empty', () => {
    expect(currentTask(board([]))).toBeUndefined();
    expect(currentTask(board([task({ lane: 'backlog' })]))).toBeUndefined();
  });

  it('prefers The One over an earlier-created task', () => {
    const b = board([
      task({ id: 'first', createdAt: T0 }),
      task({ id: 'starred', createdAt: T0 + 1000, starred: true }),
    ]);
    expect(currentTask(b)?.id).toBe('starred');
  });

  it('skips completed tasks', () => {
    const b = board([
      task({ id: 'done', starred: true, done: true }),
      task({ id: 'next', createdAt: T0 + 1000 }),
    ]);
    expect(currentTask(b)?.id).toBe('next');
  });

  it('ignores the backlog entirely', () => {
    const b = board([task({ id: 'parked', lane: 'backlog' })]);
    expect(currentTask(b)).toBeUndefined();
  });

  it('does not reorder the caller’s task array', () => {
    const tasks = [task({ id: 'first' }), task({ id: 'starred', starred: true })];
    const b = board(tasks);
    todayTasks(b);
    currentTask(b);
    expect(b.tasks.map((t) => t.id)).toEqual(['first', 'starred']);
  });
});

describe('currentSubtask', () => {
  it('is the first unticked step', () => {
    const t = task({
      subtasks: [
        { id: 's1', title: 'one', done: true },
        { id: 's2', title: 'two', done: false },
        { id: 's3', title: 'three', done: false },
      ],
    });
    expect(currentSubtask(t)?.id).toBe('s2');
  });

  it('is undefined when every step is ticked, or there are none', () => {
    expect(currentSubtask(task({ subtasks: [{ id: 's', title: 'x', done: true }] }))).toBeUndefined();
    expect(currentSubtask(task())).toBeUndefined();
    expect(currentSubtask(undefined)).toBeUndefined();
  });
});

describe('settleCredit', () => {
  it('does nothing when no timer is running', () => {
    const b = board([task()]);
    expect(settleCredit(b, T0 + 60_000)).toBe(b);
  });

  it('does nothing while the current task is unchanged', () => {
    const b = board([task({ id: 'a' })], timerOn('a'));
    expect(settleCredit(b, T0 + 60_000)).toBe(b);
  });

  it('banks the outgoing task’s share and re-points when it is completed', () => {
    const b = board(
      [
        task({ id: 'a', starred: true, done: true, secondsSpent: 120 }),
        task({ id: 'b', createdAt: T0 + 1000 }),
      ],
      timerOn('a'),
    );
    const next = settleCredit(b, T0 + 60_000);
    expect(next.tasks[0]!.secondsSpent).toBe(180);
    expect(next.timer?.creditTaskId).toBe('b');
    expect(next.timer?.creditSince).toBe(T0 + 60_000);
  });

  it('leaves the countdown alone — only the credit moves', () => {
    const b = board(
      [task({ id: 'a', done: true }), task({ id: 'b', createdAt: T0 + 1000 })],
      timerOn('a', 50),
    );
    const next = settleCredit(b, T0 + 60_000);
    expect(next.timer?.startedAt).toBe(T0);
    expect(next.timer?.sessionMinutes).toBe(50);
    expect(sessionRemaining(next.timer, T0 + 60_000)).toBe(49 * 60);
  });

  it('splits time between two tasks when the star moves mid-run', () => {
    const before = board(
      [task({ id: 'a', starred: true }), task({ id: 'b', createdAt: T0 + 1000 })],
      timerOn('a'),
    );
    // Star moves to b at the 10-minute mark.
    const starred = {
      ...before,
      tasks: before.tasks.map((t) => ({ ...t, starred: t.id === 'b' })),
    };
    const mid = settleCredit(starred, T0 + 600_000);
    expect(mid.tasks.find((t) => t.id === 'a')?.secondsSpent).toBe(600);
    expect(mid.timer?.creditTaskId).toBe('b');

    // Then b finishes at the 25-minute mark, with only its own 15 minutes.
    const bDone = {
      ...mid,
      tasks: mid.tasks.map((t) => (t.id === 'b' ? { ...t, done: true } : t)),
    };
    const end = settleCredit(bDone, T0 + 1_500_000);
    expect(end.tasks.find((t) => t.id === 'b')?.secondsSpent).toBe(900);
  });

  it('re-points to null when nothing open is left, and keeps running', () => {
    const b = board([task({ id: 'a', done: true, secondsSpent: 60 })], timerOn('a'));
    const next = settleCredit(b, T0 + 60_000);
    expect(next.tasks[0]!.secondsSpent).toBe(120);
    expect(next.timer).not.toBeNull();
    expect(next.timer?.creditTaskId).toBeNull();
  });

  it('picks credit back up when a task enters an empty Today mid-run', () => {
    const b = board([task({ id: 'fresh' })], timerOn(null, 25, T0, T0 + 60_000));
    const next = settleCredit(b, T0 + 120_000);
    expect(next.timer?.creditTaskId).toBe('fresh');
    expect(next.timer?.creditSince).toBe(T0 + 120_000);
  });

  it('drops time credited to a task that has since been deleted', () => {
    // There is nowhere honest to bank it — the task it belonged to is gone.
    const b = board([task({ id: 'b', createdAt: T0 + 1000 })], timerOn('a'));
    const next = settleCredit(b, T0 + 60_000);
    expect(next.tasks).toHaveLength(1);
    expect(next.tasks[0]!.secondsSpent).toBe(0);
    expect(next.timer?.creditTaskId).toBe('b');
  });
});

describe('normaliseBoard', () => {
  it('returns an empty board for junk', () => {
    for (const junk of [undefined, null, 'nope', 42]) {
      expect(normaliseBoard(junk)).toEqual({
        tasks: [],
        timer: null,
        lastRollover: '',
        dismissed: [],
      });
    }
  });

  it('migrates a pre-decoupling timer, crediting its task from the start of the run', () => {
    const legacy = { tasks: [], timer: { taskId: 'a', startedAt: T0, sessionMinutes: 50 } };
    expect(normaliseBoard(legacy).timer).toEqual({
      startedAt: T0,
      sessionMinutes: 50,
      creditTaskId: 'a',
      creditSince: T0,
    });
  });

  it('leaves an already-migrated timer alone', () => {
    const current = { tasks: [], timer: timerOn('b', 90, T0, T0 + 30_000) };
    expect(normaliseBoard(current).timer).toEqual(timerOn('b', 90, T0, T0 + 30_000));
  });

  it('drops a timer with no start time', () => {
    expect(normaliseBoard({ timer: { sessionMinutes: 25 } }).timer).toBeNull();
  });
});

describe('sessionRemaining', () => {
  it('is null for an open-ended stopwatch', () => {
    expect(sessionRemaining(timerOn('a', 0), T0 + 60_000)).toBeNull();
  });

  it('is null when nothing is running', () => {
    expect(sessionRemaining(null, T0)).toBeNull();
  });

  it('counts down from the length stored on the timer', () => {
    expect(sessionRemaining(timerOn('a', 25), T0 + 60_000)).toBe(24 * 60);
    expect(sessionRemaining(timerOn('a', 120), T0 + 60_000)).toBe(119 * 60);
  });

  it('clamps at 0 instead of going negative on an overrun', () => {
    expect(sessionRemaining(timerOn('a', 25), T0 + 40 * 60_000)).toBe(0);
  });
});

describe('sessionEndsAt / isSessionOver', () => {
  it('has no end time for an open-ended stopwatch', () => {
    expect(sessionEndsAt(timerOn('a', 0))).toBeNull();
    expect(isSessionOver(timerOn('a', 0), T0 + 10 * 60 * 60_000)).toBe(false);
  });

  it('ends exactly one session length after the start', () => {
    expect(sessionEndsAt(timerOn('a', 15))).toBe(T0 + 15 * 60_000);
    expect(sessionEndsAt(timerOn('a', 120))).toBe(T0 + 2 * 60 * 60_000);
  });

  it('is not over a second early and is over on the tick', () => {
    expect(isSessionOver(timerOn('a', 15), T0 + 15 * 60_000 - 1)).toBe(false);
    expect(isSessionOver(timerOn('a', 15), T0 + 15 * 60_000)).toBe(true);
  });

  it('is unaffected by the credit having moved mid-run', () => {
    const resettled = timerOn('b', 120, T0, T0 + 90 * 60_000);
    expect(isSessionOver(resettled, T0 + 119 * 60_000)).toBe(false);
    expect(isSessionOver(resettled, T0 + 120 * 60_000)).toBe(true);
  });

  it('is never over when nothing is running', () => {
    expect(isSessionOver(null, T0)).toBe(false);
  });
});

describe('formatDuration', () => {
  it('renders m:ss under an hour', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3599)).toBe('59:59');
  });

  it('renders h:mm at an hour and above', () => {
    expect(formatDuration(3600)).toBe('1:00');
    expect(formatDuration(3600 + 25 * 60)).toBe('1:25');
  });

  it('clamps negatives to zero', () => {
    expect(formatDuration(-30)).toBe('0:00');
  });
});

describe('formatClock', () => {
  it('keeps seconds visible below an hour', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(65)).toBe('01:05');
    expect(formatClock(3599)).toBe('59:59');
  });

  it('shows h:mm:ss above an hour, so a two-hour block reads as one', () => {
    expect(formatClock(3600)).toBe('1:00:00');
    expect(formatClock(2 * 3600)).toBe('2:00:00');
    expect(formatClock(2 * 3600 - 1)).toBe('1:59:59');
  });
});

describe('formatSessionLength', () => {
  it('names the stopwatch rather than calling it zero', () => {
    expect(formatSessionLength(0)).toBe('stopwatch');
    expect(formatSessionLength(-5)).toBe('stopwatch');
  });

  it('renders minutes below an hour and hours above', () => {
    expect(formatSessionLength(5)).toBe('5 min');
    expect(formatSessionLength(50)).toBe('50 min');
    expect(formatSessionLength(60)).toBe('1h');
    expect(formatSessionLength(90)).toBe('1h 30m');
    expect(formatSessionLength(120)).toBe('2h');
  });
});

describe('formatBadge', () => {
  it('shows whole minutes below an hour', () => {
    expect(formatBadge(0)).toBe('0');
    expect(formatBadge(119)).toBe('1');
    expect(formatBadge(59 * 60)).toBe('59');
  });

  it('switches to hours so the badge never exceeds 4 characters', () => {
    expect(formatBadge(60 * 60)).toBe('1h');
    expect(formatBadge(150 * 60)).toBe('2h');
  });
});

describe('countDone', () => {
  it('counts completed subtasks', () => {
    expect(countDone([])).toBe(0);
    expect(countDone([{ done: true }, { done: false }, { done: true }])).toBe(2);
  });
});

describe('dayKey', () => {
  it('formats the local date as YYYY-MM-DD with zero padding', () => {
    const jan5 = new Date(2026, 0, 5, 13, 30).getTime();
    expect(dayKey(jan5)).toBe('2026-01-05');
  });

  it('changes across a local midnight boundary', () => {
    const lateNight = new Date(2026, 2, 9, 23, 59).getTime();
    const justAfter = new Date(2026, 2, 10, 0, 1).getTime();
    expect(dayKey(lateNight)).not.toBe(dayKey(justAfter));
  });
});
