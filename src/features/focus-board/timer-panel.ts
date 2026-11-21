import { patchSettings, type Settings } from '../../shared/storage';
import { RULE_ID_BASE, normaliseSites } from './blocker';
import { currentTask, startTimer, stopTimer } from './store';
import {
  countDone,
  currentSubtask,
  formatClock,
  formatSessionLength,
  runSeconds,
  sessionEndsAt,
  sessionRemaining,
} from './timer';
import {
  SESSION_MAX_MINUTES,
  SESSION_MIN_MINUTES,
  SESSION_STEP_MINUTES,
  type BoardState,
} from './types';

/** Where the slider sits when the stored length is the stopwatch, which has no position. */
const FALLBACK_MINUTES = 25;

/**
 * The focus clock, as its own thing.
 *
 * It is not attached to a task and has no per-card start button: you start the
 * clock, and it reports what you are on by reading the board — top open task in
 * Today, and that task's first unticked subtask. Tick the subtask mid-run and
 * this rolls to the next one without touching the countdown.
 */
export async function renderTimerPanel(
  board: BoardState,
  settings: Settings,
  onChange: () => void,
): Promise<HTMLElement> {
  const running = board.timer !== null;

  const root = document.createElement('section');
  root.className = 'fb-tp';
  root.classList.toggle('running', running);

  const clock = document.createElement('div');
  clock.className = 'fb-tp-clock';
  clock.dataset.tpClock = '';

  const state = document.createElement('div');
  state.className = 'fb-tp-state';
  state.dataset.tpState = '';

  root.append(clock, state, nowBlock(board));
  paintClock(root, board, Date.now());

  if (running) {
    const stop = document.createElement('button');
    stop.type = 'button';
    stop.className = 'fb-tp-go stop';
    stop.textContent = 'Stop';
    stop.title = 'End this session now and bank the time';
    stop.addEventListener('click', () => {
      void stopTimer().then(onChange);
    });
    root.append(stop);
  } else {
    root.append(...lengthControls(settings, onChange));
  }

  const banner = await blockingStatus(board, settings);
  if (banner) root.append(banner);

  return root;
}

/**
 * The length slider and its stopwatch escape hatch.
 *
 * `∞` is a mode, not a duration — sitting it at position zero on the slider
 * would read as "a zero-minute session", so it gets its own toggle.
 */
function lengthControls(settings: Settings, onChange: () => void): HTMLElement[] {
  const stored = settings.focusBoard.sessionMinutes;
  let stopwatch = stored <= 0;
  let minutes = stopwatch ? FALLBACK_MINUTES : clampMinutes(stored);

  const row = document.createElement('div');
  row.className = 'fb-tp-length';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'fb-tp-slider';
  slider.min = String(SESSION_MIN_MINUTES);
  slider.max = String(SESSION_MAX_MINUTES);
  slider.step = String(SESSION_STEP_MINUTES);
  slider.value = String(minutes);
  slider.disabled = stopwatch;
  slider.title = 'Session length';

  const readout = document.createElement('output');
  readout.className = 'fb-tp-readout';
  readout.textContent = stopwatch ? 'stopwatch' : formatSessionLength(minutes);

  const infinite = document.createElement('button');
  infinite.type = 'button';
  infinite.className = 'fb-tp-inf';
  infinite.textContent = '∞';
  infinite.title = 'Count up instead, with no finish line';
  infinite.setAttribute('aria-pressed', String(stopwatch));
  infinite.classList.toggle('on', stopwatch);

  slider.addEventListener('input', () => {
    minutes = Number.parseInt(slider.value, 10);
    readout.textContent = formatSessionLength(minutes);
  });

  infinite.addEventListener('click', () => {
    stopwatch = !stopwatch;
    slider.disabled = stopwatch;
    infinite.classList.toggle('on', stopwatch);
    infinite.setAttribute('aria-pressed', String(stopwatch));
    readout.textContent = stopwatch ? 'stopwatch' : formatSessionLength(minutes);
  });

  row.append(slider, readout, infinite);

  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'fb-tp-go';
  go.textContent = 'Start focus';
  go.addEventListener('click', () => {
    const chosen = stopwatch ? 0 : minutes;
    // Remember where the slider was left, then run.
    void patchSettings({ focusBoard: { sessionMinutes: chosen } })
      .then(() => startTimer(chosen))
      .then(onChange);
  });

  return [row, go];
}

function clampMinutes(minutes: number): number {
  const stepped = Math.round(minutes / SESSION_STEP_MINUTES) * SESSION_STEP_MINUTES;
  return Math.min(SESSION_MAX_MINUTES, Math.max(SESSION_MIN_MINUTES, stepped));
}

/** "Now: <task> / <first unticked subtask>" — read off the board, not chosen. */
function nowBlock(board: BoardState): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'fb-tp-now';

  const task = currentTask(board);
  if (!task) {
    const empty = document.createElement('span');
    empty.className = 'fb-tp-now-empty muted';
    empty.textContent = 'Nothing picked for today.';
    wrap.append(empty);
    return wrap;
  }

  const label = document.createElement('span');
  label.className = 'fb-tp-now-label';
  label.textContent = 'Now';

  const title = document.createElement('span');
  title.className = 'fb-tp-now-task';
  title.textContent = task.title;
  wrap.append(label, title);

  const sub = currentSubtask(task);
  if (sub) {
    const step = document.createElement('span');
    step.className = 'fb-tp-now-sub';
    step.textContent = sub.title;
    const count = document.createElement('span');
    count.className = 'fb-tp-now-count';
    count.textContent = `${countDone(task.subtasks) + 1} of ${task.subtasks.length}`;
    step.append(' ', count);
    wrap.append(step);
  } else if (task.subtasks.length > 0) {
    const step = document.createElement('span');
    step.className = 'fb-tp-now-sub muted';
    step.textContent = 'All steps ticked.';
    wrap.append(step);
  }

  return wrap;
}

/**
 * Repaints just the clock and its caption. Called on a 1s interval so the
 * countdown moves without re-rendering (and stealing focus from) the board.
 */
export function paintClock(root: HTMLElement, board: BoardState, now: number): void {
  const clock = root.querySelector<HTMLElement>('[data-tp-clock]');
  const state = root.querySelector<HTMLElement>('[data-tp-state]');
  if (!clock || !state) return;

  if (!board.timer) {
    clock.textContent = '—';
    state.textContent = 'No session running';
    return;
  }

  const remaining = sessionRemaining(board.timer, now);
  if (remaining === null) {
    clock.textContent = formatClock(runSeconds(board.timer, now));
    state.textContent = 'Counting up · no finish line';
    return;
  }

  clock.textContent = formatClock(remaining);
  if (remaining === 0) {
    state.textContent = 'Session served';
    return;
  }
  const endsAt = sessionEndsAt(board.timer);
  const until = endsAt
    ? new Date(endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  state.textContent = `${formatSessionLength(board.timer.sessionMinutes)} session · until ${until}`;
}

/**
 * Says plainly what is blocked right now.
 *
 * Reports what is ACTUALLY installed, not what settings intend. Those two can
 * disagree — most commonly when `dist/` is rebuilt underneath a running Chrome,
 * which leaves a stale service worker that never installs the rules. A banner
 * that claims "9 sites blocked" while nothing is blocked is worse than no
 * banner at all, so the count is read back from the rule engine.
 */
async function blockingStatus(board: BoardState, settings: Settings): Promise<HTMLElement | null> {
  const { blockDuringFocus, blocklist, guardSettingsPages } = settings.focusBoard;
  if (!board.timer || !blockDuringFocus) return null;

  const wanted = normaliseSites(blocklist).length;
  if (wanted === 0 && !guardSettingsPages) return null;

  let installed = 0;
  let readable = true;
  try {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    installed = rules.filter((r) => r.id >= RULE_ID_BASE && r.id < RULE_ID_BASE + wanted).length;
  } catch {
    readable = false;
  }

  const el = document.createElement('div');
  const dot = document.createElement('span');
  dot.className = 'fb-banner-dot';
  const text = document.createElement('span');

  // Rules were wanted but are not there: say so loudly rather than reassure.
  if (readable && wanted > 0 && installed === 0) {
    el.className = 'fb-banner warn';
    text.textContent = 'Blocking is NOT active — reload the extension';
    text.title =
      'A focus session is running and sites are configured, but no rules are installed. ' +
      'Usually a stale service worker after dist/ was rebuilt: reload the extension in chrome://extensions.';
    el.append(dot, text);
    return el;
  }

  el.className = 'fb-banner';
  const parts: string[] = [];
  if (wanted > 0) {
    parts.push(
      installed < wanted && readable
        ? `${installed}/${wanted} sites blocked`
        : `${wanted} site${wanted === 1 ? '' : 's'} blocked`,
    );
  }
  if (guardSettingsPages) parts.push('settings locked');
  text.textContent = parts.join(' · ');
  el.append(dot, text);
  return el;
}
