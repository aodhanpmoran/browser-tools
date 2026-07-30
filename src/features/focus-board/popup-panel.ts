import type { PanelContext, PopupPage } from '../../shared/panel';
import { emptyNote } from '../../shared/dom';
import {
  addSubtask,
  addTask,
  backlogTasks,
  deleteSubtask,
  deleteTask,
  demoteToBacklog,
  getBoard,
  isTodayFull,
  promoteToToday,
  rolloverIfNewDay,
  setTheOne,
  toggleSubtask,
  toggleTaskDone,
  toggleTimer,
  todayTasks,
} from './store';
import { countDone, formatDuration, sessionRemaining, taskSeconds } from './timer';
import { normaliseSites } from './blocker';
import { TODAY_CAP, type BoardState, type Task } from './types';

export const focusBoardPopupPage: PopupPage = {
  id: 'focus',
  featureId: 'focus-board',
  label: 'Focus',
  icon: '◎',
  render: renderFocusBoard,
};

/** Ticks the live timer readouts between storage-driven re-renders. */
let tickHandle: number | undefined;
/** Set when an add-form submits, so focus returns to it after the re-render. */
let refocus: string | undefined;

async function renderFocusBoard(container: HTMLElement, ctx: PanelContext): Promise<void> {
  if (tickHandle !== undefined) {
    clearInterval(tickHandle);
    tickHandle = undefined;
  }

  if (!ctx.settings.enabled['focus-board']) {
    container.replaceChildren(emptyNote('Focus Board is disabled.', 'fb-empty'));
    return;
  }

  await rolloverIfNewDay(ctx.settings.focusBoard.autoRollover);
  const board = await getBoard();
  const today = todayTasks(board);
  const backlog = backlogTasks(board);
  const sessionMinutes = ctx.settings.focusBoard.sessionMinutes;

  const root = document.createElement('div');
  root.className = 'fb';

  const banner = blockingBanner(board, ctx);
  if (banner) root.append(banner);

  root.append(sectionHeading('Today', `${today.filter((t) => !t.done).length}/${TODAY_CAP}`));

  if (today.length === 0) {
    root.append(
      emptyNote('Nothing picked yet. Choose the one thing that has to happen.', 'fb-empty'),
    );
  } else {
    const list = document.createElement('ul');
    list.className = 'fb-list';
    list.append(...today.map((task) => taskCard(task, board, sessionMinutes, ctx)));
    root.append(list);
  }

  root.append(addForm(board, ctx));
  root.append(backlogSection(backlog, board, ctx));

  container.replaceChildren(root);

  if (refocus) {
    container.querySelector<HTMLInputElement>(`[data-focus="${refocus}"]`)?.focus();
    refocus = undefined;
  }

  // Only run a clock when there is something to count.
  if (board.timer) {
    tickHandle = window.setInterval(() => updateClocks(container, board, sessionMinutes), 1000);
    updateClocks(container, board, sessionMinutes);
  }
}

/** Says plainly what is blocked right now, so the state is never a surprise. */
function blockingBanner(board: BoardState, ctx: PanelContext): HTMLElement | null {
  const { blockDuringFocus, blocklist, guardSettingsPages } = ctx.settings.focusBoard;
  if (!board.timer || !blockDuringFocus) return null;

  const count = normaliseSites(blocklist).length;
  if (count === 0 && !guardSettingsPages) return null;

  const el = document.createElement('div');
  el.className = 'fb-banner';
  const dot = document.createElement('span');
  dot.className = 'fb-banner-dot';
  const text = document.createElement('span');
  const parts: string[] = [];
  if (count > 0) parts.push(`${count} site${count === 1 ? '' : 's'} blocked`);
  if (guardSettingsPages) parts.push('settings locked');
  text.textContent = parts.join(' · ');
  el.append(dot, text);
  return el;
}

function sectionHeading(text: string, badge?: string): HTMLElement {
  const h = document.createElement('div');
  h.className = 'fb-heading';
  const label = document.createElement('span');
  label.textContent = text;
  h.append(label);
  if (badge) {
    const count = document.createElement('span');
    count.className = 'fb-count';
    count.textContent = badge;
    h.append(count);
  }
  return h;
}

function taskCard(
  task: Task,
  board: BoardState,
  sessionMinutes: number,
  ctx: PanelContext,
): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'fb-card';
  li.classList.toggle('starred', task.starred && !task.done);
  li.classList.toggle('done', task.done);

  // --- main row ---
  const row = document.createElement('div');
  row.className = 'fb-row';

  const check = document.createElement('input');
  check.type = 'checkbox';
  check.className = 'fb-check';
  check.checked = task.done;
  check.title = task.done ? 'Reopen' : 'Complete';
  check.addEventListener('change', () => {
    void toggleTaskDone(task.id);
  });

  const star = document.createElement('button');
  star.type = 'button';
  star.className = 'fb-star';
  star.textContent = task.starred ? '★' : '☆';
  star.title = task.starred ? 'This is The One' : 'Make this The One';
  star.disabled = task.done;
  star.addEventListener('click', () => {
    void setTheOne(task.id);
  });

  const title = document.createElement('span');
  title.className = 'fb-title';
  title.textContent = task.title;

  row.append(check, star, title, taskMenu(task, board));
  li.append(row);

  // --- subtask progress ---
  if (task.subtasks.length > 0) {
    const done = countDone(task.subtasks);
    const meter = document.createElement('div');
    meter.className = 'fb-progress';
    const label = document.createElement('span');
    label.className = 'fb-progress-label';
    label.textContent = `${done} of ${task.subtasks.length} subtasks`;
    const bar = document.createElement('span');
    bar.className = 'fb-bar';
    const fill = document.createElement('span');
    fill.className = 'fb-bar-fill';
    fill.style.width = `${Math.round((done / task.subtasks.length) * 100)}%`;
    bar.append(fill);
    meter.append(label, bar);
    li.append(meter);

    const subs = document.createElement('ul');
    subs.className = 'fb-subs';
    subs.append(...task.subtasks.map((sub) => subtaskRow(task.id, sub)));
    li.append(subs);
  }

  if (!task.done) {
    li.append(subtaskForm(task));
    li.append(timerRow(task, board, sessionMinutes, ctx));
  }

  return li;
}

function taskMenu(task: Task, board: BoardState): HTMLElement {
  const menu = document.createElement('span');
  menu.className = 'fb-actions';

  if (task.lane === 'today') {
    const down = iconButton('↓', 'Move to backlog', () => {
      void demoteToBacklog(task.id);
    });
    menu.append(down);
  } else {
    const up = iconButton('↑', 'Move to Today', () => {
      void promoteToToday(task.id);
    });
    up.disabled = isTodayFull(board);
    if (up.disabled) up.title = 'Today is full — finish or demote one first';
    menu.append(up);
  }

  menu.append(
    iconButton('×', 'Delete', () => {
      void deleteTask(task.id);
    }),
  );
  return menu;
}

function subtaskRow(taskId: string, sub: { id: string; title: string; done: boolean }): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'fb-sub';
  li.classList.toggle('done', sub.done);

  const check = document.createElement('input');
  check.type = 'checkbox';
  check.checked = sub.done;
  check.addEventListener('change', () => {
    void toggleSubtask(taskId, sub.id);
  });

  const text = document.createElement('span');
  text.className = 'fb-sub-title';
  text.textContent = sub.title;

  const del = iconButton('×', 'Remove subtask', () => {
    void deleteSubtask(taskId, sub.id);
  });

  li.append(check, text, del);
  return li;
}

function subtaskForm(task: Task): HTMLFormElement {
  const form = document.createElement('form');
  form.className = 'fb-sub-form';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'fb-sub-input';
  input.placeholder = task.subtasks.length === 0 ? 'Break it into first steps…' : 'Next step…';
  input.dataset.focus = `sub-${task.id}`;

  form.append(input);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = input.value;
    if (!value.trim()) return;
    refocus = `sub-${task.id}`;
    void addSubtask(task.id, value);
  });
  return form;
}

function timerRow(
  task: Task,
  board: BoardState,
  sessionMinutes: number,
  ctx: PanelContext,
): HTMLElement {
  const running = board.timer?.taskId === task.id;
  const row = document.createElement('div');
  row.className = 'fb-timer';
  row.classList.toggle('running', running);

  const clock = document.createElement('span');
  clock.className = 'fb-clock';
  clock.dataset.clock = task.id;
  clock.textContent = clockText(task, board, sessionMinutes);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'fb-timer-btn';
  btn.textContent = running ? '⏸ Stop' : '▶ Start';

  if (running) {
    btn.title = 'End this session early';
    row.append(clock, btn);
  } else {
    // Duration is chosen per session, not just in settings — the right length
    // for "reply to an email" is not the right length for "ship the feature".
    const picker = document.createElement('select');
    picker.className = 'fb-duration';
    picker.title = 'Session length';
    const presets = ctx.settings.focusBoard.sessionPresets;
    for (const minutes of presets) {
      const opt = document.createElement('option');
      opt.value = String(minutes);
      opt.textContent = minutes === 0 ? '∞' : `${minutes}m`;
      opt.selected = minutes === sessionMinutes;
      picker.append(opt);
    }
    btn.title = 'Start a focus session at the selected length';
    btn.addEventListener('click', () => {
      void toggleTimer(task.id, Number.parseInt(picker.value, 10)).then(() => ctx.refresh());
    });
    row.append(clock, picker, btn);
    return row;
  }

  btn.addEventListener('click', () => {
    void toggleTimer(task.id, sessionMinutes).then(() => ctx.refresh());
  });
  return row;
}

/**
 * A running fixed-length session counts down; anything else shows total time
 * banked on the task, so a paused card still says what it has cost so far.
 * The running case reads the length off the timer, not off settings, so
 * changing the default mid-session cannot move the finish line.
 */
function clockText(task: Task, board: BoardState, _sessionMinutes: number): string {
  const now = Date.now();
  const running = board.timer?.taskId === task.id;
  if (running) {
    const remaining = sessionRemaining(board.timer, now);
    if (remaining === null) return `${formatDuration(taskSeconds(task, board.timer, now))} elapsed`;
    if (remaining === 0) return `session done · ${formatDuration(taskSeconds(task, board.timer, now))}`;
    return `${formatDuration(remaining)} left`;
  }
  const total = taskSeconds(task, board.timer, now);
  return total === 0 ? 'not started' : formatDuration(total);
}

function updateClocks(container: HTMLElement, board: BoardState, sessionMinutes: number): void {
  for (const el of container.querySelectorAll<HTMLElement>('[data-clock]')) {
    const task = board.tasks.find((t) => t.id === el.dataset.clock);
    if (task) el.textContent = clockText(task, board, sessionMinutes);
  }
}

function addForm(board: BoardState, ctx: PanelContext): HTMLElement {
  const full = isTodayFull(board);
  const form = document.createElement('form');
  form.className = 'fb-add';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'fb-add-input';
  input.placeholder = full ? 'Today is full' : 'What has to happen today?';
  input.disabled = full;
  input.dataset.focus = 'add-today';

  const btn = document.createElement('button');
  btn.type = 'submit';
  btn.className = 'fb-add-btn';
  btn.textContent = 'Add';
  btn.disabled = full;

  form.append(input, btn);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!input.value.trim()) return;
    refocus = 'add-today';
    void addTask(input.value, 'today');
  });

  if (full) {
    const hint = document.createElement('p');
    hint.className = 'fb-hint muted';
    hint.textContent = `Three is the limit. Finish one, or send one back to the backlog.`;
    const wrap = document.createElement('div');
    wrap.append(form, hint);
    return wrap;
  }
  void ctx;
  return form;
}

function backlogSection(backlog: Task[], board: BoardState, ctx: PanelContext): HTMLElement {
  const details = document.createElement('details');
  details.className = 'fb-backlog';

  const summary = document.createElement('summary');
  summary.textContent = `Backlog (${backlog.length})`;
  details.append(summary);

  if (backlog.length > 0) {
    const list = document.createElement('ul');
    list.className = 'fb-list';
    list.append(
      ...backlog.map((task) => {
        const li = document.createElement('li');
        li.className = 'fb-card compact';
        const row = document.createElement('div');
        row.className = 'fb-row';
        const title = document.createElement('span');
        title.className = 'fb-title';
        title.textContent = task.title;
        if (task.subtasks.length > 0) {
          const badge = document.createElement('span');
          badge.className = 'fb-count';
          badge.textContent = `${countDone(task.subtasks)}/${task.subtasks.length}`;
          title.append(' ', badge);
        }
        row.append(title, taskMenu(task, board));
        li.append(row);
        return li;
      }),
    );
    details.append(list);
  }

  const form = document.createElement('form');
  form.className = 'fb-add';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'fb-add-input';
  input.placeholder = 'Park something for later…';
  input.dataset.focus = 'add-backlog';
  const btn = document.createElement('button');
  btn.type = 'submit';
  btn.className = 'fb-add-btn';
  btn.textContent = 'Add';
  form.append(input, btn);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!input.value.trim()) return;
    refocus = 'add-backlog';
    details.open = true;
    void addTask(input.value, 'backlog');
  });
  details.append(form);

  void ctx;
  return details;
}

function iconButton(glyph: string, title: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'fb-icon-btn';
  btn.textContent = glyph;
  btn.title = title;
  btn.addEventListener('click', onClick);
  return btn;
}
