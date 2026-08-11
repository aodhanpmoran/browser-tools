import { getSettings, patchSettings } from '../../shared/storage';
import {
  backlogTasks,
  clearBoard,
  clearCompleted,
  clearDismissed,
  getBoard,
  todayTasks,
} from './store';
import { detectSuggestionsPath, loadSuggestions, toFileUrl } from './suggestions';
import { formatDuration, taskSeconds } from './timer';
import { MAX_BLOCKED_SITES, normaliseSites } from './blocker';
import { TODAY_CAP } from './types';

export async function renderFocusBoardOptionsPanel(featureEnabled: boolean): Promise<HTMLElement> {
  const settings = await getSettings();
  const {
    sessionMinutes,
    autoRollover,
    showBadge,
    blockDuringFocus,
    blocklist,
    guardSettingsPages,
    suggestionsEnabled,
    suggestionsPath,
  } = settings.focusBoard;
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

  // --- Daily suggestions ---
  const sugHeader = document.createElement('h3');
  sugHeader.className = 'subheader';
  sugHeader.textContent = 'Daily suggestions';

  const sugToggle = checkboxRow(
    'Offer suggestions from the desktop agent',
    suggestionsEnabled,
    !featureEnabled,
    (checked) => void patchSettings({ focusBoard: { suggestionsEnabled: checked } }),
  );

  const pathLabel = document.createElement('label');
  pathLabel.className = 'np-key-label';
  pathLabel.textContent = 'Suggestions file (absolute path)';
  const pathRow = document.createElement('div');
  pathRow.className = 'fb-path-row';
  const pathInput = document.createElement('input');
  pathInput.type = 'text';
  pathInput.className = 'np-key-input';
  pathInput.placeholder = '/Users/you/.browser-tools/suggestions.json';
  pathInput.value = suggestionsPath;
  pathInput.disabled = !featureEnabled || !suggestionsEnabled;
  const detectBtn = document.createElement('button');
  detectBtn.type = 'button';
  detectBtn.className = 'fb-detect-btn';
  detectBtn.textContent = 'Detect';
  detectBtn.disabled = pathInput.disabled;
  const sugStatus = document.createElement('p');
  sugStatus.className = 'muted-note';

  async function refreshStatus(path: string): Promise<void> {
    if (!path.trim()) {
      sugStatus.textContent = 'No path set. Click Detect, or paste the absolute path.';
      return;
    }
    const result = await loadSuggestions(toFileUrl(path));
    if (result.status === 'ok') {
      const when = result.generatedAt ? new Date(result.generatedAt).toLocaleString() : 'unknown time';
      sugStatus.textContent = `${result.suggestions.length} suggestion${result.suggestions.length === 1 ? '' : 's'} · written ${when}`;
    } else if (result.status === 'empty') {
      sugStatus.textContent = 'File read fine, but it contains no suggestions yet.';
    } else {
      sugStatus.textContent = result.message ?? 'Could not read the file.';
    }
  }
  void refreshStatus(suggestionsPath);

  pathInput.addEventListener('change', () => {
    const value = pathInput.value.trim();
    void patchSettings({ focusBoard: { suggestionsPath: value } });
    void refreshStatus(value);
  });
  detectBtn.addEventListener('click', () => {
    detectBtn.disabled = true;
    sugStatus.textContent = 'Looking…';
    void detectSuggestionsPath()
      .then(async (found) => {
        if (!found) {
          sugStatus.textContent =
            'Could not read any home directory. Enable "Allow access to file URLs" for this extension, then try again.';
          return;
        }
        pathInput.value = found;
        await patchSettings({ focusBoard: { suggestionsPath: found } });
        await refreshStatus(found);
      })
      .finally(() => {
        detectBtn.disabled = false;
      });
  });
  pathRow.append(pathInput, detectBtn);
  pathLabel.append(pathRow);

  const sugHelp = document.createElement('p');
  sugHelp.className = 'muted-note';
  sugHelp.innerHTML =
    'The extension cannot reach Fathom or Gmail itself — those live behind desktop connectors. A scheduled agent reads them each morning, scores each item 1-10 on whether doing it makes everything else easier or irrelevant, and writes this file. Suggestions never enter Today on their own; you accept one, which is the moment it earns a slot. Reading a local file needs <strong>Allow access to file URLs</strong> ticked on this extension\'s card in <code>chrome://extensions</code> — do that outside a focus session, since the guard hides that page.';

  const dismissedBtn = document.createElement('button');
  dismissedBtn.type = 'button';
  dismissedBtn.className = 'danger-button';
  dismissedBtn.textContent = `Un-dismiss ${board.dismissed.length} suggestion${board.dismissed.length === 1 ? '' : 's'}`;
  dismissedBtn.disabled = board.dismissed.length === 0;
  dismissedBtn.addEventListener('click', () => {
    void clearDismissed();
  });

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
    sugHeader,
    sugToggle,
    pathLabel,
    sugStatus,
    sugHelp,
    dismissedBtn,
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
