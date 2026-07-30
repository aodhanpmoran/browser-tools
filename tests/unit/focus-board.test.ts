import { describe, expect, it } from 'vitest';
import {
  countDone,
  dayKey,
  formatBadge,
  formatDuration,
  isSessionOver,
  runSeconds,
  sessionEndsAt,
  sessionRemaining,
  taskSeconds,
} from '../../src/features/focus-board/timer';
import type { ActiveTimer, Task } from '../../src/features/focus-board/types';

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

const timerOn = (taskId: string, sessionMinutes = 25, startedAt = T0): ActiveTimer => ({
  taskId,
  startedAt,
  sessionMinutes,
});

describe('runSeconds', () => {
  it('is 0 when no timer is running', () => {
    expect(runSeconds(null, 'a', T0 + 60_000)).toBe(0);
  });

  it('is 0 when the timer belongs to a different task', () => {
    expect(runSeconds(timerOn('b'), 'a', T0 + 60_000)).toBe(0);
  });

  it('counts whole seconds since the run started', () => {
    expect(runSeconds(timerOn('a'), 'a', T0 + 90_500)).toBe(90);
  });

  it('never goes negative if the clock jumps backwards', () => {
    expect(runSeconds(timerOn('a'), 'a', T0 - 5_000)).toBe(0);
  });
});

describe('taskSeconds', () => {
  it('adds the live run to banked time', () => {
    const t = task({ secondsSpent: 300 });
    expect(taskSeconds(t, timerOn('a'), T0 + 60_000)).toBe(360);
  });

  it('returns only banked time when paused', () => {
    expect(taskSeconds(task({ secondsSpent: 300 }), null, T0 + 60_000)).toBe(300);
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
    expect(sessionRemaining(timerOn('a', 50), T0 + 60_000)).toBe(49 * 60);
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
  });

  it('is not over a second early and is over on the tick', () => {
    expect(isSessionOver(timerOn('a', 15), T0 + 15 * 60_000 - 1)).toBe(false);
    expect(isSessionOver(timerOn('a', 15), T0 + 15 * 60_000)).toBe(true);
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
