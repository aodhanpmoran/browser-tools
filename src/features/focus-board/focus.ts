import { getSettings, setFeatureEnabled } from '../../shared/storage';
import { buildTodos, paintSpent, restoreFocus } from './board-view';
import { paintClock, renderTimerPanel } from './timer-panel';
import { getBoard, rolloverIfNewDay } from './store';
import { dayKey } from './timer';

const todosEl = document.querySelector<HTMLElement>('#todos')!;
const timerEl = document.querySelector<HTMLElement>('#timer')!;
const dateEl = document.querySelector<HTMLElement>('#today-date')!;
const optionsBtn = document.querySelector<HTMLButtonElement>('#open-options')!;

let tickHandle: number | undefined;
/** True while a pass is in flight, so two never interleave. */
let rendering = false;
/** Set when a storage event lands mid-pass — that pass read stale data, so run again. */
let dirty = false;

optionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());

dateEl.textContent = new Date().toLocaleDateString([], {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

void render();

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'local') void render();
});

// A tab can sit open across midnight, so re-check the rollover when it comes back.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void render();
});

/**
 * Serialises render passes and re-runs when one is superseded.
 *
 * Starting a session writes settings and then the board, so a pass kicked off
 * by the first write can read the board before the second lands. Dropping the
 * second event instead of re-running leaves the page showing an idle timer
 * while one is actually going.
 */
async function render(): Promise<void> {
  if (rendering) {
    dirty = true;
    return;
  }
  rendering = true;
  try {
    do {
      dirty = false;
      await renderOnce();
    } while (dirty);
  } finally {
    rendering = false;
  }
}

async function renderOnce(): Promise<void> {
  if (tickHandle !== undefined) {
    clearInterval(tickHandle);
    tickHandle = undefined;
  }

  const settings = await getSettings();
  if (!settings.enabled['focus-board']) {
    todosEl.replaceChildren(disabledNote());
    timerEl.replaceChildren();
    return;
  }

  await rolloverIfNewDay(settings.focusBoard.autoRollover);
  const board = await getBoard();

  const panel = await renderTimerPanel(board, settings, () => void render());
  const todos = await buildTodos(board, {
    mode: 'tab',
    settings,
    refresh: () => void render(),
  });

  timerEl.replaceChildren(panel);
  todosEl.replaceChildren(todos);
  restoreFocus(todosEl);
  document.title = titleFor(board.timer !== null);
  dateEl.textContent = new Date(dayKeyToNoon(dayKey(Date.now()))).toLocaleDateString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  if (board.timer) {
    const tick = (): void => {
      const now = Date.now();
      paintClock(panel, board, now);
      paintSpent(todosEl, board, now);
    };
    tickHandle = window.setInterval(tick, 1000);
    tick();
  }
}

function titleFor(running: boolean): string {
  return running ? '● Focus Board' : 'Focus Board';
}

/** Midday of a YYYY-MM-DD key, so formatting can never slip a day on a DST edge. */
function dayKeyToNoon(key: string): number {
  const [year = 1970, month = 1, day = 1] = key.split('-').map((n) => Number.parseInt(n, 10));
  return new Date(year, month - 1, day, 12).getTime();
}

/**
 * This page is also the new tab page, so a switched-off Focus Board must not
 * leave a dead end — the way back on is right here, not buried in Settings.
 */
function disabledNote(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'fb-off';

  const p = document.createElement('p');
  p.className = 'fb-empty muted';
  p.textContent = 'Focus Board is switched off, so there is nothing to show here.';

  const on = document.createElement('button');
  on.type = 'button';
  on.className = 'fb-add-btn';
  on.textContent = 'Turn Focus Board on';
  on.addEventListener('click', () => {
    void setFeatureEnabled('focus-board', true);
  });

  wrap.append(p, on);
  return wrap;
}
