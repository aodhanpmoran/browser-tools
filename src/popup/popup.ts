import { FEATURE_IDS, FEATURE_META, type FeatureId } from '../shared/feature';
import { getSettings, setFeatureEnabled } from '../shared/storage';
import { getClosed, type ClosedTab } from '../features/tab-cleaner/recently-closed';

const listEl = document.querySelector<HTMLUListElement>('#feature-list');
const recentEl = document.querySelector<HTMLUListElement>('#recently-closed');
const recentSection = document.querySelector<HTMLElement>('#recently-closed-section');
const optionsButton = document.querySelector<HTMLButtonElement>('#open-options');

if (!listEl) throw new Error('#feature-list not found');
if (!recentEl) throw new Error('#recently-closed not found');
if (!recentSection) throw new Error('#recently-closed-section not found');
if (!optionsButton) throw new Error('#open-options not found');

optionsButton.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

void render();

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'local') void render();
});

async function render(): Promise<void> {
  const [settings, closed] = await Promise.all([getSettings(), getClosed()]);
  renderFeatures(settings.enabled);
  renderRecentlyClosed(closed, settings.enabled['tab-cleaner']);
}

function renderFeatures(enabled: Record<FeatureId, boolean>): void {
  listEl!.replaceChildren(
    ...FEATURE_IDS.map((id) => {
      const meta = FEATURE_META[id];
      return renderFeatureRow(id, meta.label, meta.description, enabled[id]);
    }),
  );
}

function renderFeatureRow(
  id: FeatureId,
  label: string,
  description: string,
  enabled: boolean,
): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'feature-row';

  const toggle = document.createElement('label');
  toggle.className = 'feature-toggle';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = enabled;
  checkbox.addEventListener('change', () => {
    void setFeatureEnabled(id, checkbox.checked);
  });

  const text = document.createElement('span');
  text.className = 'feature-text';
  const strong = document.createElement('strong');
  strong.textContent = label;
  const small = document.createElement('small');
  small.textContent = description;
  text.append(strong, small);

  toggle.append(checkbox, text);
  li.append(toggle);
  return li;
}

function renderRecentlyClosed(closed: readonly ClosedTab[], tabCleanerOn: boolean): void {
  if (!tabCleanerOn || closed.length === 0) {
    recentSection!.hidden = true;
    return;
  }
  recentSection!.hidden = false;
  const slice = closed.slice(0, 10);
  recentEl!.replaceChildren(...slice.map(renderClosedRow));
}

function renderClosedRow(entry: ClosedTab): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'recent-row';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'recent-link';
  button.title = entry.url;
  button.addEventListener('click', () => {
    void chrome.tabs.create({ url: entry.url });
  });

  const img = document.createElement('img');
  img.className = 'recent-favicon';
  if (entry.favicon) img.src = entry.favicon;
  img.alt = '';
  img.width = 14;
  img.height = 14;

  const title = document.createElement('span');
  title.className = 'recent-title';
  title.textContent = entry.title || entry.url;

  const time = document.createElement('time');
  time.className = 'recent-time';
  time.textContent = formatAge(Date.now() - entry.closedAt);

  button.append(img, title, time);
  li.append(button);
  return li;
}

function formatAge(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}
