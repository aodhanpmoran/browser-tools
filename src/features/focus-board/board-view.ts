import type { Settings } from '../../shared/storage';
import { emptyNote, formatAge } from '../../shared/dom';
import {
  acceptSuggestion,
  addSubtask,
  addTask,
  backlogTasks,
  currentTask,
  deleteSubtask,
  deleteTask,
  demoteToBacklog,
  dismissSuggestion,
  isTodayFull,
  promoteToToday,
  renameSubtask,
  renameTask,
  setTheOne,
  toggleSubtask,
  toggleTaskDone,
  todayTasks,
} from './store';
import { countDone, formatDuration, taskSeconds } from './timer';
import {
  loadSuggestionsCached,
  toFileUrl,
  visibleSuggestions,
  type Suggestion,
  type SuggestionsResult,
} from './suggestions';
import { TODAY_CAP, type BoardState, type Subtask, type Task } from './types';

/**
 * The popup is 380px and the tab is a full window, so the two differ in how
 * much they can show at once — the backlog collapses in one and not the other.
 * Everything else is identical, and deliberately so.
 */
export type BoardMode = 'popup' | 'tab';

export interface BoardViewOptions {
  readonly mode: BoardMode;
  readonly settings: Settings;
  /** Re-run the host's render pass. */
  refresh(): void;
}

/** Set when a form submits, so focus returns to it after the re-render. */
let refocus: string | undefined;

/** Everything to the left of the timer: suggestions, Today, the add form, the backlog. */
export function buildTodos(board: BoardState, opts: BoardViewOptions): HTMLElement {
  const today = todayTasks(board);
  const backlog = backlogTasks(board);
  const nowId = board.timer ? currentTask(board)?.id : undefined;

  const root = document.createElement('div');
  root.className = 'fb';

  // Rendered synchronously without it: the file:// read can take up to its 1.5s
  // timeout, and nothing else on the page should wait for that.
  const suggestions = suggestionsSlot(board, opts);
  if (suggestions) root.append(suggestions);

  root.append(sectionHeading('Today', `${today.filter((t) => !t.done).length}/${TODAY_CAP}`));

  if (today.length === 0) {
    root.append(
      emptyNote('Nothing picked yet. Choose the one thing that has to happen.', 'fb-empty'),
    );
  } else {
    const list = document.createElement('ul');
    list.className = 'fb-list';
    list.append(...today.map((task) => taskCard(task, board, opts, task.id === nowId)));
    root.append(list);
  }

  root.append(addForm(board));
  root.append(backlogSection(backlog, board, opts));
  return root;
}

/** Puts focus back where a submitted form left it. Call after the host swaps in new DOM. */
export function restoreFocus(container: HTMLElement): void {
  if (!refocus) return;
  container.querySelector<HTMLInputElement>(`[data-focus="${refocus}"]`)?.focus();
  refocus = undefined;
}

/**
 * Suggestions handed over by the desktop agent. Deliberately not auto-added:
 * you accept one, which is the moment you decide it earns a slot.
 */
function suggestionsSlot(board: BoardState, opts: BoardViewOptions): HTMLElement | null {
  const { suggestionsEnabled, suggestionsPath } = opts.settings.focusBoard;
  if (!suggestionsEnabled || !suggestionsPath.trim()) return null;

  // The slot holds the place in the DOM; it is filled, or removed, once the read
  // lands. If the host re-rendered meanwhile the slot is detached and this is a no-op.
  const slot = document.createElement('div');
  slot.className = 'fb-suggest-slot';
  // The path is stored absolute — the options panel resolves it once, because
  // neither surface has a filesystem API to expand `~` with.
  void loadSuggestionsCached(toFileUrl(suggestionsPath)).then((result) => {
    const section = suggestionsSection(board, result);
    if (section) slot.replaceWith(section);
    else slot.remove();
  });
  return slot;
}

function suggestionsSection(board: BoardState, result: SuggestionsResult): HTMLElement | null {

  const pending = visibleSuggestions(
    result.suggestions,
    board.dismissed,
    board.tasks.map((t) => t.title),
  );
  // Nothing to offer and nothing worth reporting — stay out of the way.
  if (pending.length === 0 && result.status !== 'malformed') return null;

  const wrap = document.createElement('section');
  wrap.className = 'fb-suggest';
  wrap.append(sectionHeading('Suggested', result.goal ? `vs ${result.goal}` : undefined));

  if (result.status === 'malformed') {
    wrap.append(emptyNote(result.message ?? 'Suggestions file is unreadable.', 'fb-empty'));
    return wrap;
  }

  const list = document.createElement('ul');
  list.className = 'fb-suggest-list';
  list.append(...pending.map((s, i) => suggestionRow(s, i === 0)));
  wrap.append(list);

  if (result.generatedAt) {
    const stamp = document.createElement('p');
    stamp.className = 'fb-suggest-stamp muted';
    stamp.textContent = `Gathered ${formatAge(Date.now() - result.generatedAt)} ago`;
    wrap.append(stamp);
  }
  return wrap;
}

function suggestionRow(s: Suggestion, isTop: boolean): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'fb-suggest-row';
  // The top row is the highest-leverage item — the one most likely to earn
  // the star, so it is styled to be read first.
  li.classList.toggle('top', isTop);

  const score = document.createElement('span');
  score.className = 'fb-leverage';
  score.textContent = String(s.leverage);
  score.title = s.leverageWhy
    ? `Leverage ${s.leverage}/10 — ${s.leverageWhy}`
    : `Leverage ${s.leverage}/10`;

  const body = document.createElement('div');
  body.className = 'fb-suggest-body';

  const title = document.createElement('span');
  title.className = 'fb-suggest-title';
  title.textContent = s.title;
  body.append(title);

  const meta = document.createElement('span');
  meta.className = 'fb-suggest-meta';
  const bits = [s.source, s.sourceDetail].filter(Boolean) as string[];
  if (s.subtasks.length > 0) bits.push(`${s.subtasks.length} steps ready`);
  meta.textContent = bits.join(' · ');
  body.append(meta);

  if (s.leverageWhy) {
    const why = document.createElement('span');
    why.className = 'fb-suggest-why';
    why.textContent = s.leverageWhy;
    body.append(why);
  }

  const actions = document.createElement('span');
  actions.className = 'fb-actions';
  actions.append(
    iconButton('+', 'Add to the board', () => {
      void acceptSuggestion(s);
    }),
    iconButton('×', 'Not today', () => {
      void dismissSuggestion(s.id);
    }),
  );

  li.append(score, body, actions);
  return li;
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
  opts: BoardViewOptions,
  isCurrent: boolean,
): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'fb-card';
  li.classList.toggle('starred', task.starred && !task.done);
  li.classList.toggle('done', task.done);
  // The task the running clock is crediting. Marked so the board and the timer
  // panel visibly agree about what "now" means.
  li.classList.toggle('current', isCurrent);

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

  const title = editableText(task.title, 'fb-title', 'Rename this task', (value) => {
    void renameTask(task.id, value);
  });

  row.append(check, star, title, taskMenu(task, board, opts));
  li.append(row);

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

  if (!task.done) li.append(subtaskForm(task));

  // Time banked on this task. The clock that produced it lives elsewhere now,
  // so the card only ever reports — it has no controls.
  const spent = taskSeconds(task, board.timer, Date.now());
  if (spent > 0 || isCurrent) {
    const foot = document.createElement('div');
    foot.className = 'fb-spent';
    foot.dataset.spent = task.id;
    foot.textContent = spentText(spent, isCurrent);
    li.append(foot);
  }

  return li;
}

function spentText(seconds: number, isCurrent: boolean): string {
  const total = formatDuration(seconds);
  return isCurrent ? `${total} · counting` : total;
}

/** Repaints the per-card time totals on the tick, without rebuilding the cards. */
export function paintSpent(container: HTMLElement, board: BoardState, now: number): void {
  const nowId = board.timer ? currentTask(board)?.id : undefined;
  for (const el of container.querySelectorAll<HTMLElement>('[data-spent]')) {
    const task = board.tasks.find((t) => t.id === el.dataset.spent);
    if (task) el.textContent = spentText(taskSeconds(task, board.timer, now), task.id === nowId);
  }
}

function taskMenu(task: Task, board: BoardState, opts: BoardViewOptions): HTMLElement {
  const menu = document.createElement('span');
  menu.className = 'fb-actions';

  if (task.lane === 'today') {
    menu.append(
      iconButton('↓', 'Move to backlog', () => {
        void demoteToBacklog(task.id);
      }),
    );
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
      // A full-window board makes accidental clicks cheaper to make and more
      // expensive to notice, so it asks first when there is work to lose.
      if (opts.mode === 'tab' && task.subtasks.length > 0) {
        if (!confirm(`Delete "${task.title}" and its ${task.subtasks.length} steps?`)) return;
      }
      void deleteTask(task.id);
    }),
  );
  return menu;
}

function subtaskRow(taskId: string, sub: Subtask): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'fb-sub';
  li.classList.toggle('done', sub.done);

  const check = document.createElement('input');
  check.type = 'checkbox';
  check.checked = sub.done;
  check.addEventListener('change', () => {
    void toggleSubtask(taskId, sub.id);
  });

  const text = editableText(sub.title, 'fb-sub-title', 'Rename this step', (value) => {
    void renameSubtask(taskId, sub.id, value);
  });

  const del = iconButton('×', 'Remove subtask', () => {
    void deleteSubtask(taskId, sub.id);
  });

  li.append(check, text, del);
  return li;
}

/**
 * Click-to-edit text. Enter or blur commits, Escape reverts. Committing an
 * unchanged or empty value does nothing, so a stray click cannot blank a title.
 */
function editableText(
  value: string,
  className: string,
  title: string,
  onSave: (next: string) => void,
): HTMLElement {
  const span = document.createElement('span');
  span.className = `${className} editable`;
  span.textContent = value;
  span.title = title;
  span.tabIndex = 0;

  const begin = (): void => {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = `${className} fb-edit`;
    input.value = value;

    let settled = false;
    const commit = (save: boolean): void => {
      if (settled) return;
      settled = true;
      const next = input.value.trim();
      input.replaceWith(span);
      if (save && next && next !== value) onSave(next);
    };

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commit(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        commit(false);
      }
    });
    input.addEventListener('blur', () => commit(true));

    span.replaceWith(input);
    input.focus();
    input.select();
  };

  span.addEventListener('click', begin);
  span.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      begin();
    }
  });
  return span;
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

function addForm(board: BoardState): HTMLElement {
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
    hint.textContent = 'Three is the limit. Finish one, or send one back to the backlog.';
    const wrap = document.createElement('div');
    wrap.append(form, hint);
    return wrap;
  }
  return form;
}

/**
 * Collapsed behind a disclosure in the popup, where vertical space is the
 * scarce thing; open in the tab, where it is not.
 */
function backlogSection(backlog: Task[], board: BoardState, opts: BoardViewOptions): HTMLElement {
  const wrap =
    opts.mode === 'popup'
      ? document.createElement('details')
      : document.createElement('section');
  wrap.className = 'fb-backlog';

  if (wrap instanceof HTMLDetailsElement) {
    const summary = document.createElement('summary');
    summary.textContent = `Backlog (${backlog.length})`;
    wrap.append(summary);
  } else {
    wrap.append(sectionHeading('Backlog', String(backlog.length)));
  }

  if (backlog.length > 0) {
    const list = document.createElement('ul');
    list.className = 'fb-list';
    list.append(
      ...backlog.map((task) => {
        const li = document.createElement('li');
        li.className = 'fb-card compact';
        const row = document.createElement('div');
        row.className = 'fb-row';
        const title = editableText(task.title, 'fb-title', 'Rename this task', (value) => {
          void renameTask(task.id, value);
        });
        if (task.subtasks.length > 0) {
          const badge = document.createElement('span');
          badge.className = 'fb-count';
          badge.textContent = `${countDone(task.subtasks)}/${task.subtasks.length}`;
          row.append(title, badge, taskMenu(task, board, opts));
        } else {
          row.append(title, taskMenu(task, board, opts));
        }
        li.append(row);
        return li;
      }),
    );
    wrap.append(list);
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
    if (wrap instanceof HTMLDetailsElement) wrap.open = true;
    void addTask(input.value, 'backlog');
  });
  wrap.append(form);
  return wrap;
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

/** Opens the full-window board. Only the extension itself ever navigates here. */
export function openFullBoard(): void {
  void chrome.tabs.create({ url: chrome.runtime.getURL('src/features/focus-board/focus.html') });
}
