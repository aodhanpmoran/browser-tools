import { getSettings, patchSettings } from '../../shared/storage';
import { backlogTasks, clearCompleted, clearBoard, getBoard, todayTasks } from './store';
import { formatDuration, taskSeconds } from './timer';
import { MAX_BLOCKED_SITES, normaliseSites } from './blocker';
import { TODAY_CAP } from './types';

export async function renderFocusBoardOptionsPanel(featureEnabled: boolean): Promise<HTMLElement> {
  const settings = await getSettings();
  const { sessionMinutes, autoRollover, showBadge, blockDuringFocus, blocklist, guardSettingsPages } =
    settings.focusBoard;
  const board = await getBoard();

  const root = document.createElement('section');
  root.className = 'fb-options-panel';

  // --- Session length ---
  const sessionHeader = document.createElement('h3');
  sessionHeader.className = 'subheader';
  sessionHeader.textContent = 'Session length';

  const sessionRow = document.createElement('div');
  sessionRow.className = 'range-row';
  const range = document.createElement('input');
  range.type = 'range';
  range.min = '0';
  range.max = '90';
  range.step = '5';
  range.value = String(sessionMinutes);
  range.disabled = !featureEnabled;
  const readout = document.createElement('output');
  readout.className = 'range-readout';
  readout.textContent = sessionLabel(sessionMinutes);
  range.addEventListener('input', () => {
    readout.textContent = sessionLabel(Number.parseInt(range.value, 10));
  });
  range.addEventListener('change', () => {
    void patchSettings({ focusBoard: { sessionMinutes: Number.parseInt(range.value, 10) } });
  });
  sessionRow.append(range, readout);

  const sessionHelp = document.createElement('p');
  sessionHelp.className = 'muted-note';
  sessionHelp.textContent =
    'The length pre-selected in the popup. You pick the actual length per session from the dropdown next to Start, so this is just the default. Set it to 0 for an open-ended stopwatch that counts up instead of down.';

  // --- Blocking ---
  const blockHeader = document.createElement('h3');
  blockHeader.className = 'subheader';
  blockHeader.textContent = 'Block during a session';

  const blockToggle = checkboxRow(
    'Block the sites below while a focus session is running',
    blockDuringFocus,
    !featureEnabled,
    (checked) => void patchSettings({ focusBoard: { blockDuringFocus: checked } }),
  );

  const guardToggle = checkboxRow(
    'Also lock chrome://extensions, chrome://settings and this page',
    guardSettingsPages,
    !featureEnabled || !blockDuringFocus,
    (checked) => void patchSettings({ focusBoard: { guardSettingsPages: checked } }),
  );

  const listLabel = document.createElement('label');
  listLabel.className = 'np-key-label';
  listLabel.textContent = 'Blocked sites — one per line';
  const list = document.createElement('textarea');
  list.className = 'fb-blocklist';
  list.rows = 9;
  list.spellcheck = false;
  list.placeholder = 'youtube.com\nreddit.com\nnews.ycombinator.com';
  list.value = blocklist.join('\n');
  list.disabled = !featureEnabled || !blockDuringFocus;
  const listStatus = document.createElement('p');
  listStatus.className = 'muted-note';
  listStatus.textContent = describeList(blocklist);
  list.addEventListener('change', () => {
    const entries = list.value.split('\n').map((s) => s.trim()).filter(Boolean);
    const clean = normaliseSites(entries);
    list.value = clean.join('\n');
    listStatus.textContent = describeList(clean);
    void patchSettings({ focusBoard: { blocklist: clean } });
  });
  listLabel.append(list);

  const blockHelp = document.createElement('p');
  blockHelp.className = 'muted-note';
  blockHelp.textContent =
    'Domains only — subdomains are included automatically, so youtube.com also covers m.youtube.com. Paths are ignored. Entries are cleaned up when you click away.';

  const caveat = document.createElement('p');
  caveat.className = 'muted-note';
  caveat.innerHTML =
    '<strong>Honest limits.</strong> Normal sites are blocked by Chrome\'s network layer, which holds even if the extension is idle. But <code>chrome://</code> pages cannot be filtered by any extension — the best available is to notice the tab and navigate it away, which is friction rather than a lock. Removing this extension from the toolbar right-click menu still works without ever opening <code>chrome://extensions</code>. To make it genuinely un-removable you need a managed-policy profile at the OS level, not an extension setting.';

  // --- Behaviour toggles ---
  const behaviourHeader = document.createElement('h3');
  behaviourHeader.className = 'subheader';
  behaviourHeader.textContent = 'Behaviour';

  const rolloverToggle = checkboxRow(
    'Clear finished tasks at the start of each day',
    autoRollover,
    !featureEnabled,
    (checked) => void patchSettings({ focusBoard: { autoRollover: checked } }),
  );

  const badgeToggle = checkboxRow(
    'Show the running timer on the toolbar badge',
    showBadge,
    !featureEnabled,
    (checked) => void patchSettings({ focusBoard: { showBadge: checked } }),
  );

  const rolloverHelp = document.createElement('p');
  rolloverHelp.className = 'muted-note';
  rolloverHelp.textContent =
    'Unfinished Today tasks always carry over — they were the priority yesterday and still are. Only completed ones get cleared.';

  // --- Board stats ---
  const statsHeader = document.createElement('h3');
  statsHeader.className = 'subheader';
  statsHeader.textContent = 'Board';

  const today = todayTasks(board);
  const backlog = backlogTasks(board);
  const doneCount = board.tasks.filter((t) => t.done).length;
  // Include the live run, otherwise a timer that is currently going reads as 0:00.
  const now = Date.now();
  const totalSeconds = board.tasks.reduce((n, t) => n + taskSeconds(t, board.timer, now), 0);

  const stats = document.createElement('ul');
  stats.className = 'fb-stats';
  for (const [label, value] of [
    ['Today', `${today.filter((t) => !t.done).length} of ${TODAY_CAP} open`],
    ['Backlog', `${backlog.length} parked`],
    ['Completed', `${doneCount} not yet cleared`],
    ['Time tracked', formatDuration(totalSeconds)],
  ] as const) {
    const li = document.createElement('li');
    const k = document.createElement('span');
    k.textContent = label;
    const v = document.createElement('strong');
    v.textContent = value;
    li.append(k, v);
    stats.append(li);
  }

  const clearDoneBtn = document.createElement('button');
  clearDoneBtn.type = 'button';
  clearDoneBtn.className = 'danger-button';
  clearDoneBtn.textContent = 'Clear completed tasks';
  clearDoneBtn.disabled = doneCount === 0;
  clearDoneBtn.addEventListener('click', () => {
    void clearCompleted();
  });

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'danger-button';
  resetBtn.textContent = 'Delete everything';
  resetBtn.disabled = board.tasks.length === 0;
  resetBtn.addEventListener('click', () => {
    if (!confirm(`Delete all ${board.tasks.length} tasks and their subtasks? This cannot be undone.`))
      return;
    void clearBoard();
  });

  const privacy = document.createElement('p');
  privacy.className = 'muted-note';
  privacy.textContent =
    'Tasks, subtasks, and tracked time are stored in chrome.storage.local on this machine only. Nothing is synced or sent anywhere.';

  root.append(
    sessionHeader,
    sessionRow,
    sessionHelp,
    blockHeader,
    blockToggle,
    guardToggle,
    listLabel,
    listStatus,
    blockHelp,
    caveat,
    behaviourHeader,
    rolloverToggle,
    badgeToggle,
    rolloverHelp,
    statsHeader,
    stats,
    clearDoneBtn,
    resetBtn,
    privacy,
  );
  return root;
}

function sessionLabel(minutes: number): string {
  return minutes === 0 ? 'stopwatch' : `${minutes} min`;
}

function describeList(sites: readonly string[]): string {
  if (sites.length === 0) return 'No sites blocked yet.';
  const capped = sites.length >= MAX_BLOCKED_SITES ? ` (capped at ${MAX_BLOCKED_SITES})` : '';
  return `${sites.length} site${sites.length === 1 ? '' : 's'} blocked${capped}.`;
}

function checkboxRow(
  text: string,
  checked: boolean,
  disabled: boolean,
  onChange: (checked: boolean) => void,
): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'site-row';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.disabled = disabled;
  input.addEventListener('change', () => onChange(input.checked));
  const span = document.createElement('span');
  span.textContent = text;
  label.append(input, span);
  return label;
}
