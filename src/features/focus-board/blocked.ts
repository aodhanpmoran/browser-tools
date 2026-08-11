import { getBoard } from './store';
import { countDone, formatDuration, sessionRemaining } from './timer';

const clockEl = document.querySelector<HTMLElement>('#clock')!;
const subEl = document.querySelector<HTMLElement>('#sub')!;
const eyebrowEl = document.querySelector<HTMLElement>('#eyebrow')!;
const cardEl = document.querySelector<HTMLElement>('#card')!;
const titleEl = document.querySelector<HTMLElement>('#task-title')!;
const progressEl = document.querySelector<HTMLElement>('#task-progress')!;
const progressLabelEl = document.querySelector<HTMLElement>('#task-progress-label')!;
const barEl = document.querySelector<HTMLElement>('#task-bar')!;
const subsEl = document.querySelector<HTMLUListElement>('#task-subs')!;
const footEl = document.querySelector<HTMLElement>('#foot')!;

const from = new URLSearchParams(window.location.search).get('from') ?? '';

void render();
setInterval(() => void render(), 1000);
// The session ending is a storage write, so this repaints the moment it lifts.
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'local') void render();
});

async function render(): Promise<void> {
  const board = await getBoard();
  const remaining = sessionRemaining(board.timer, Date.now());

  if (!board.timer) {
    eyebrowEl.textContent = 'Session over';
    clockEl.textContent = 'Done';
    subEl.textContent = from
      ? `${from} is available again. Go back or close this tab.`
      : 'The block has lifted.';
    cardEl.hidden = true;
    footEl.textContent = '';
    return;
  }

  eyebrowEl.textContent = from === 'settings' ? 'Locked during focus' : 'Blocked during focus';
  clockEl.textContent = remaining === null ? 'Focusing' : formatDuration(remaining);
  subEl.textContent =
    remaining === null
      ? 'Open-ended session running. Stop it from the extension popup.'
      : `left in this session${from && from !== 'settings' ? ` · ${from} is blocked` : ''}`;

  const task = board.tasks.find((t) => t.id === board.timer!.taskId);
  if (!task) {
    cardEl.hidden = true;
    return;
  }

  cardEl.hidden = false;
  titleEl.textContent = task.title;

  if (task.subtasks.length > 0) {
    const done = countDone(task.subtasks);
    progressEl.hidden = false;
    progressLabelEl.textContent = `${done}/${task.subtasks.length}`;
    barEl.style.width = `${Math.round((done / task.subtasks.length) * 100)}%`;
    subsEl.replaceChildren(
      ...task.subtasks.map((sub) => {
        const li = document.createElement('li');
        li.classList.toggle('done', sub.done);
        const mark = document.createElement('span');
        mark.className = 'mark';
        mark.textContent = sub.done ? '✓' : '○';
        const text = document.createElement('span');
        text.textContent = sub.title;
        li.append(mark, text);
        return li;
      }),
    );
  } else {
    progressEl.hidden = true;
    subsEl.replaceChildren();
  }

  footEl.textContent =
    from === 'settings'
      ? 'Settings are locked until the session ends. Stop the timer from the extension popup if you really need them.'
      : 'Stop the timer from the extension popup to unblock early.';
}
