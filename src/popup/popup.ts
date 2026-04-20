import { FEATURE_IDS, FEATURE_META, type FeatureId } from '../shared/feature';
import { getSettings, setFeatureEnabled } from '../shared/storage';
import { getClosed, type ClosedTab } from '../features/tab-cleaner/recently-closed';
import { listForUrl, nukeSite } from '../features/cookie-editor/operations';
import { currentChain, type RedirectChain } from '../features/redirect-tracer/chains';

const listEl = document.querySelector<HTMLUListElement>('#feature-list');
const recentEl = document.querySelector<HTMLUListElement>('#recently-closed');
const recentSection = document.querySelector<HTMLElement>('#recently-closed-section');
const cookiesSection = document.querySelector<HTMLElement>('#cookies-section');
const cookiesSummary = document.querySelector<HTMLElement>('#cookies-summary');
const redirectSection = document.querySelector<HTMLElement>('#redirect-section');
const redirectSummary = document.querySelector<HTMLElement>('#redirect-summary');
const optionsButton = document.querySelector<HTMLButtonElement>('#open-options');

if (!listEl) throw new Error('#feature-list not found');
if (!recentEl) throw new Error('#recently-closed not found');
if (!recentSection) throw new Error('#recently-closed-section not found');
if (!cookiesSection) throw new Error('#cookies-section not found');
if (!cookiesSummary) throw new Error('#cookies-summary not found');
if (!redirectSection) throw new Error('#redirect-section not found');
if (!redirectSummary) throw new Error('#redirect-summary not found');
if (!optionsButton) throw new Error('#open-options not found');

optionsButton.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

void render();

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'local') void render();
});

async function render(): Promise<void> {
  const [settings, closed, activeTab] = await Promise.all([
    getSettings(),
    getClosed(),
    getActiveTab(),
  ]);
  renderFeatures(settings.enabled);
  renderRecentlyClosed(closed, settings.enabled['tab-cleaner']);
  await renderCookies(activeTab, settings.enabled['cookie-editor']);
  await renderRedirects(activeTab, settings.enabled['redirect-tracer']);
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
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

async function renderCookies(
  tab: chrome.tabs.Tab | undefined,
  cookieEditorOn: boolean,
): Promise<void> {
  if (!cookieEditorOn || !tab?.url || !isEditableUrl(tab.url)) {
    cookiesSection!.hidden = true;
    return;
  }
  cookiesSection!.hidden = false;
  cookiesSummary!.replaceChildren();

  const cookies = await listForUrl(tab.url).catch(() => []);
  const count = document.createElement('p');
  count.className = 'cookies-count';
  count.textContent = `${cookies.length} cookie${cookies.length === 1 ? '' : 's'}`;
  const host = document.createElement('small');
  host.className = 'muted';
  try {
    host.textContent = new URL(tab.url).hostname;
  } catch {
    host.textContent = tab.url;
  }

  const actions = document.createElement('div');
  actions.className = 'cookies-actions';
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'secondary-button';
  editBtn.textContent = 'Open editor';
  editBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    // Options page reads current tab URL on its own.
  });
  const nukeBtn = document.createElement('button');
  nukeBtn.type = 'button';
  nukeBtn.className = 'danger-button-small';
  nukeBtn.textContent = `Nuke ${cookies.length}`;
  nukeBtn.disabled = cookies.length === 0;
  nukeBtn.addEventListener('click', () => {
    if (!confirm(`Delete ${cookies.length} cookie${cookies.length === 1 ? '' : 's'} for ${host.textContent}?`)) return;
    void nukeSite(tab.url!).then(() => render());
  });
  actions.append(editBtn, nukeBtn);

  cookiesSummary!.append(count, host, actions);
}

function isEditableUrl(url: string): boolean {
  return /^https?:\/\//.test(url);
}

async function renderRedirects(
  tab: chrome.tabs.Tab | undefined,
  tracerOn: boolean,
): Promise<void> {
  if (!tracerOn || tab?.id === undefined) {
    redirectSection!.hidden = true;
    return;
  }
  const chain = await currentChain(tab.id);
  if (!chain || chain.entries.length <= 1) {
    redirectSection!.hidden = true;
    return;
  }
  redirectSection!.hidden = false;
  redirectSummary!.replaceChildren(renderChain(chain));
}

function renderChain(chain: RedirectChain): HTMLElement {
  const list = document.createElement('ol');
  list.className = 'redirect-list';
  for (const entry of chain.entries) {
    const li = document.createElement('li');
    li.className = 'redirect-entry';
    const status = document.createElement('span');
    status.className = 'redirect-status';
    status.textContent = entry.statusCode ? String(entry.statusCode) : '—';
    const url = document.createElement('span');
    url.className = 'redirect-url';
    url.textContent = entry.url;
    url.title = entry.url;
    li.append(status, url);
    list.append(li);
  }

  const actions = document.createElement('div');
  actions.className = 'redirect-actions';
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'secondary-button';
  copyBtn.textContent = 'Copy chain';
  copyBtn.addEventListener('click', () => {
    const text = chain.entries
      .map((e) => `${e.statusCode ?? '—'} ${e.url}`)
      .join('\n');
    void navigator.clipboard.writeText(text).then(() => {
      copyBtn.textContent = 'Copied';
      setTimeout(() => {
        copyBtn.textContent = 'Copy chain';
      }, 1200);
    });
  });
  actions.append(copyBtn);

  const wrap = document.createElement('div');
  wrap.append(list, actions);
  return wrap;
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
