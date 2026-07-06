import { FEATURE_IDS, FEATURE_META, type FeatureId } from '../shared/feature';
import { getSettings, setFeatureEnabled, type NowPlayingSettings } from '../shared/storage';
import { getClosed, type ClosedTab } from '../features/tab-cleaner/recently-closed';
import { listForUrl, nukeSite } from '../features/cookie-editor/operations';
import type { RedirectTrace } from '../features/redirect-tracer';
import type { DetectResponse, NowPlaying } from '../features/now-playing';
import { saveTrack } from '../features/now-playing/history';
import { runAcrIdentify, type IdentifyResult } from '../features/now-playing/popup-identify';
import type { PipResult } from '../features/picture-in-picture';

type PageId = 'home' | 'cookies' | 'redirects' | 'music' | 'pip';

interface NavItem {
  id: PageId;
  label: string;
  icon: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  { id: 'home', label: 'Home', icon: '⌂' },
  { id: 'cookies', label: 'Cookies', icon: '🍪' },
  { id: 'redirects', label: 'Hops', icon: '🔀' },
  { id: 'music', label: 'Music', icon: '🎵' },
  { id: 'pip', label: 'PiP', icon: '🖼' },
];

const navEl = document.querySelector<HTMLElement>('#nav')!;
const pages: Record<PageId, HTMLElement> = {
  home: document.querySelector<HTMLElement>('#page-home')!,
  cookies: document.querySelector<HTMLElement>('#page-cookies')!,
  redirects: document.querySelector<HTMLElement>('#page-redirects')!,
  music: document.querySelector<HTMLElement>('#page-music')!,
  pip: document.querySelector<HTMLElement>('#page-pip')!,
};
const optionsButton = document.querySelector<HTMLButtonElement>('#open-options')!;

let activePage: PageId = 'home';

optionsButton.addEventListener('click', () => chrome.runtime.openOptionsPage());

renderNav();
void render();

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'local') void render();
});

function renderNav(): void {
  navEl.replaceChildren(
    ...NAV_ITEMS.map((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.page = item.id;
      if (item.id === activePage) btn.classList.add('active');
      const icon = document.createElement('span');
      icon.className = 'nav-icon';
      icon.textContent = item.icon;
      const label = document.createElement('span');
      label.textContent = item.label;
      btn.append(icon, label);
      btn.addEventListener('click', () => {
        activePage = item.id;
        for (const [, el] of Object.entries(pages)) el.hidden = true;
        pages[item.id].hidden = false;
        for (const b of navEl.querySelectorAll('button')) {
          b.classList.toggle('active', b.dataset.page === item.id);
        }
      });
      return btn;
    }),
  );
}

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
  renderPip(activeTab, settings.enabled['picture-in-picture']);
  await renderNowPlaying(activeTab, settings.enabled['now-playing'], settings.nowPlaying);
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

/* ─── Home: feature toggles + recently closed ────────────────────── */

function renderFeatures(enabled: Record<FeatureId, boolean>): void {
  const list = document.querySelector<HTMLUListElement>('#feature-list')!;
  list.replaceChildren(
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

  const text = document.createElement('span');
  text.className = 'feature-text';
  const strong = document.createElement('strong');
  strong.textContent = label;
  const small = document.createElement('small');
  small.textContent = description;
  text.append(strong, small);

  const sw = document.createElement('span');
  sw.className = 'switch';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = enabled;
  checkbox.addEventListener('change', () => {
    void setFeatureEnabled(id, checkbox.checked);
  });
  const slider = document.createElement('span');
  slider.className = 'slider';
  sw.append(checkbox, slider);

  toggle.append(text, sw);
  li.append(toggle);
  return li;
}

function renderRecentlyClosed(closed: readonly ClosedTab[], tabCleanerOn: boolean): void {
  const section = document.querySelector<HTMLElement>('#recently-closed-section')!;
  const list = document.querySelector<HTMLUListElement>('#recently-closed')!;
  if (!tabCleanerOn || closed.length === 0) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  const slice = closed.slice(0, 10);
  list.replaceChildren(...slice.map(renderClosedRow));
}

function renderClosedRow(entry: ClosedTab): HTMLLIElement {
  const li = document.createElement('li');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'closed-item';
  btn.title = entry.url;
  btn.addEventListener('click', () => void chrome.tabs.create({ url: entry.url }));

  const img = document.createElement('img');
  if (entry.favicon) img.src = entry.favicon;
  img.alt = '';
  img.width = 16;
  img.height = 16;

  const title = document.createElement('span');
  title.className = 'closed-title';
  title.textContent = entry.title || entry.url;

  const time = document.createElement('time');
  time.className = 'closed-time';
  time.textContent = formatAge(Date.now() - entry.closedAt);

  btn.append(img, title, time);
  li.append(btn);
  return li;
}

/* ─── Cookies ─────────────────────────────────────────────────── */

async function renderCookies(
  tab: chrome.tabs.Tab | undefined,
  enabled: boolean,
): Promise<void> {
  const summary = document.querySelector<HTMLElement>('#cookies-summary')!;
  if (!enabled || !tab?.url || !isEditableUrl(tab.url)) {
    summary.replaceChildren(emptyNote('No cookies to edit on this tab.'));
    return;
  }

  const cookies = await listForUrl(tab.url).catch(() => []);
  const host = safeHost(tab.url);

  const head = document.createElement('div');
  head.className = 'cookies-head';
  const count = document.createElement('div');
  count.className = 'cookies-count';
  count.textContent = `${cookies.length} cookie${cookies.length === 1 ? '' : 's'}`;
  const hostEl = document.createElement('div');
  hostEl.className = 'cookies-host';
  hostEl.textContent = host;
  head.append(count, hostEl);

  const actions = document.createElement('div');
  actions.className = 'cookies-actions';
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'secondary-button';
  editBtn.textContent = 'Open editor';
  editBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
  const nukeBtn = document.createElement('button');
  nukeBtn.type = 'button';
  nukeBtn.className = 'danger-button-small';
  nukeBtn.textContent = `Nuke ${cookies.length}`;
  nukeBtn.disabled = cookies.length === 0;
  nukeBtn.addEventListener('click', () => {
    if (!confirm(`Delete ${cookies.length} cookie${cookies.length === 1 ? '' : 's'} for ${host}?`))
      return;
    void nukeSite(tab.url!).then(() => render());
  });
  actions.append(editBtn, nukeBtn);

  summary.replaceChildren(head, actions);
}

function isEditableUrl(url: string): boolean {
  return /^https?:\/\//.test(url);
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/* ─── Redirects ─────────────────────────────────────────── */

async function renderRedirects(
  tab: chrome.tabs.Tab | undefined,
  enabled: boolean,
): Promise<void> {
  const container = document.querySelector<HTMLElement>('#redirect-summary')!;
  if (!enabled || tab?.id === undefined) {
    container.replaceChildren(emptyNote('No active tab.', 'redirect-empty'));
    return;
  }
  const trace = (await chrome.runtime.sendMessage({
    kind: 'redirect.get',
    tabId: tab.id,
  })) as RedirectTrace | undefined;

  if (!trace || (trace.chain.length === 0 && !trace.finalUrl)) {
    container.replaceChildren(emptyNote('No redirects captured for this tab yet.', 'redirect-empty'));
    return;
  }

  container.replaceChildren(renderTrace(trace));
}

function renderTrace(trace: RedirectTrace): HTMLElement {
  const wrap = document.createElement('div');

  const list = document.createElement('ol');
  list.className = 'redirect-list';

  const steps: Array<{ url: string; status: number | null; label: string; isFinal: boolean }> = [];
  for (const hop of trace.chain) {
    steps.push({
      url: hop.url,
      status: hop.statusCode,
      label: redirectLabel(hop.statusCode),
      isFinal: false,
    });
  }
  if (trace.finalUrl) {
    steps.push({
      url: trace.finalUrl,
      status: trace.finalStatus,
      label: 'Final destination',
      isFinal: true,
    });
  }
  if (steps.length === 1 && steps[0]) {
    steps[0].isFinal = true;
    steps[0].label = 'Final destination';
  }

  for (const step of steps) {
    const li = document.createElement('li');
    li.className = 'redirect-step';
    if (step.isFinal) li.classList.add('final');

    const url = document.createElement('div');
    url.className = 'redirect-url';
    url.textContent = step.url;
    url.title = step.url;

    const meta = document.createElement('div');
    meta.className = 'redirect-meta';
    if (step.status) {
      const badge = document.createElement('span');
      badge.className = `redirect-status-badge ${classifyStatus(step.status)}`;
      badge.textContent = String(step.status);
      meta.append(badge);
    }
    const label = document.createElement('span');
    label.className = 'redirect-status-label';
    label.textContent = step.label;
    meta.append(label);

    li.append(url, meta);
    list.append(li);
  }

  wrap.append(list);

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'secondary-button';
  copyBtn.textContent = 'Copy chain';
  copyBtn.addEventListener('click', () => {
    const text = traceToText(trace);
    void navigator.clipboard.writeText(text).then(() => {
      copyBtn.textContent = 'Copied';
      setTimeout(() => (copyBtn.textContent = 'Copy chain'), 1200);
    });
  });
  wrap.append(copyBtn);

  return wrap;
}

function traceToText(trace: RedirectTrace): string {
  const lines: string[] = [];
  for (const hop of trace.chain) {
    lines.push(hop.url);
    lines.push(`${hop.statusCode}: ${redirectLabel(hop.statusCode)} → ${hop.redirectUrl}`);
    lines.push('');
  }
  if (trace.finalUrl) {
    lines.push(trace.finalUrl);
    lines.push(`${trace.finalStatus ?? '—'}: Final destination`);
  }
  return lines.join('\n');
}

function classifyStatus(code: number): string {
  if (code >= 200 && code < 300) return 'ok';
  if (code >= 300 && code < 400) return 'redirect';
  if (code >= 400) return 'error';
  return 'unknown';
}

function redirectLabel(code: number): string {
  const labels: Record<number, string> = {
    301: 'Permanent redirect',
    302: 'Temporary redirect (Found)',
    303: 'See Other',
    307: 'Temporary redirect',
    308: 'Permanent redirect',
  };
  return labels[code] ?? `Redirect (${code})`;
}

/* ─── Music (Now Playing) ───────────────────────────────── */

async function renderNowPlaying(
  tab: chrome.tabs.Tab | undefined,
  enabled: boolean,
  settings: NowPlayingSettings,
): Promise<void> {
  const panel = document.querySelector<HTMLElement>('#now-playing-panel')!;
  if (!enabled) {
    panel.replaceChildren(emptyNote('Now Playing is disabled.'));
    return;
  }
  if (!tab?.id || !tab.url || !tab.url.startsWith('http')) {
    panel.replaceChildren(emptyNote('No eligible tab.'));
    return;
  }

  panel.replaceChildren(emptyNote('Checking…'));
  let result: NowPlaying | null = null;
  try {
    const res = (await chrome.tabs.sendMessage(tab.id, {
      kind: 'now-playing.detect',
    })) as DetectResponse | undefined;
    result = res?.result ?? null;
  } catch {
    // content script not present
  }

  const children: HTMLElement[] = [];
  if (result) {
    children.push(renderNowPlayingCard(result, settings.historyCap));
  }
  children.push(renderMusicHero(settings, result !== null));
  panel.replaceChildren(...children);
}

function renderMusicHero(settings: NowPlayingSettings, hasNowPlaying: boolean): HTMLElement {
  const wrap = document.createElement('div');

  if (hasNowPlaying) {
    const divider = document.createElement('div');
    divider.className = 'np-hero-head';
    divider.textContent = 'Not this track? Identify what’s actually playing';
    wrap.append(divider);
  }

  const hero = document.createElement('div');
  hero.className = 'np-hero';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'np-listen-btn';
  btn.disabled = !settings.acrKey;

  const mic = document.createElement('span');
  mic.className = 'mic-icon';
  mic.innerHTML =
    '<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';

  const bars = document.createElement('span');
  bars.className = 'bars-icon';
  const soundBars = document.createElement('div');
  soundBars.className = 'sound-bars';
  for (let i = 0; i < 5; i++) {
    const bar = document.createElement('div');
    bar.className = 'bar';
    soundBars.append(bar);
  }
  bars.append(soundBars);
  btn.append(mic, bars);

  const timer = document.createElement('div');
  timer.className = 'np-timer';

  const label = document.createElement('div');
  label.className = 'np-label';
  label.textContent = settings.acrKey
    ? hasNowPlaying
      ? 'Tap to discover'
      : 'Tap to listen'
    : 'Add keys in Settings';

  hero.append(btn, timer, label);

  wrap.append(hero);

  if (!hasNowPlaying) {
    const hint = document.createElement('p');
    hint.className = 'np-hint';
    hint.textContent = settings.acrKey
      ? 'No metadata detected on this tab. Listen ~10 s and identify via ACRCloud. Keep this popup open while recording.'
      : 'Open Settings → Now Playing to add ACRCloud host, access key, and secret.';
    wrap.append(hint);
  }

  btn.addEventListener('click', () => {
    if (!settings.acrKey) {
      chrome.runtime.openOptionsPage();
      return;
    }
    void runIdentifyFlow(btn, timer, label, hero, settings);
  });

  return wrap;
}

async function runIdentifyFlow(
  btn: HTMLButtonElement,
  timer: HTMLElement,
  label: HTMLElement,
  hero: HTMLElement,
  settings: NowPlayingSettings,
): Promise<void> {
  btn.disabled = true;
  btn.classList.add('recording');
  hero.classList.add('active');
  label.textContent = 'Listening…';

  let result: IdentifyResult;
  try {
    result = await runAcrIdentify(settings, (p) => {
      if (p.phase === 'listening') {
        timer.textContent = `${p.secondsRemaining ?? '?'}s`;
      } else {
        timer.textContent = '';
        label.textContent = 'Identifying…';
      }
    });
  } catch (err) {
    label.textContent = err instanceof Error ? err.message : String(err);
    btn.disabled = false;
    btn.classList.remove('recording');
    hero.classList.remove('active');
    return;
  }

  btn.classList.remove('recording');
  hero.classList.remove('active');

  if (!result.ok) {
    timer.textContent = '';
    label.textContent = result.error;
    btn.disabled = false;
    if (result.needsCreds) {
      setTimeout(() => chrome.runtime.openOptionsPage(), 400);
    }
    return;
  }

  const panel = document.querySelector<HTMLElement>('#now-playing-panel')!;
  panel.replaceChildren(renderNowPlayingCard(result.nowPlaying, settings.historyCap));
}

function renderNowPlayingCard(track: NowPlaying, historyCap: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'np-card';

  const cover = document.createElement('div');
  cover.className = 'np-cover';
  if (track.artworkUrl) {
    const img = document.createElement('img');
    img.src = track.artworkUrl;
    img.alt = '';
    cover.append(img);
  } else {
    cover.textContent = '♪';
  }

  const meta = document.createElement('div');
  meta.className = 'np-meta';

  const title = document.createElement('div');
  title.className = 'np-title';
  title.textContent = track.title;
  title.title = track.title;

  const artist = document.createElement('div');
  artist.className = 'np-artist';
  artist.textContent = track.artist || '—';

  const sourceTag = document.createElement('span');
  sourceTag.className = `np-source src-${track.source}`;
  sourceTag.textContent = sourceLabel(track);

  meta.append(title, artist, sourceTag);

  const actions = document.createElement('div');
  actions.className = 'np-actions';

  const q = encodeURIComponent(`${track.title} ${track.artist}`.trim());
  const links: Array<[string, string]> = [
    ['YouTube', track.externalUrl ?? `https://www.youtube.com/results?search_query=${q}`],
    ['Spotify', `https://open.spotify.com/search/${q}`],
    ['Lyrics', `https://www.google.com/search?q=${q}+lyrics`],
  ];
  for (const [linkLabel, href] of links) {
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noreferrer noopener';
    a.className = 'np-link';
    a.textContent = linkLabel;
    actions.append(a);
  }

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'np-save';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', () => {
    void saveTrack(track, historyCap).then(() => {
      saveBtn.textContent = 'Saved';
      setTimeout(() => (saveBtn.textContent = 'Save'), 1200);
    });
  });

  wrap.append(cover, meta, actions, saveBtn);
  return wrap;
}

function sourceLabel(track: NowPlaying): string {
  switch (track.source) {
    case 'mediaSession':
      return 'media session';
    case 'site':
      return track.siteId ?? 'site';
    case 'meta':
      return 'og:music';
    case 'title':
      return 'page title';
    case 'acrcloud':
      return 'acrcloud';
  }
}

/* ─── PiP ────────────────────────────────────────────────── */

function renderPip(tab: chrome.tabs.Tab | undefined, enabled: boolean): void {
  const panel = document.querySelector<HTMLElement>('#pip-panel')!;
  if (!enabled) {
    panel.replaceChildren(emptyNote('Picture-in-Picture is disabled.'));
    return;
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pip-btn';
  btn.disabled = !tab?.id;
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><rect x="12" y="9" width="8" height="6" rx="1" ry="1" fill="currentColor" opacity="0.3"/><polyline points="8 21 12 17 16 21"/></svg>';

  const label = document.createElement('div');
  label.className = 'pip-label';
  label.textContent = 'Toggle Picture-in-Picture';

  const status = document.createElement('div');
  status.className = 'pip-status';

  const hint = document.createElement('p');
  hint.className = 'pip-hint';
  hint.textContent = 'Pops the largest video on the current tab into a floating window. Click again to exit.';

  btn.addEventListener('click', () => {
    if (!tab?.id) return;
    btn.disabled = true;
    status.className = 'pip-status';
    status.textContent = 'Working…';
    void chrome.runtime
      .sendMessage({ kind: 'pip.toggle', tabId: tab.id })
      .then((result: PipResult | undefined) => {
        if (!result) {
          status.className = 'pip-status err';
          status.textContent = 'No response from service worker.';
        } else if ('error' in result) {
          status.className = 'pip-status err';
          status.textContent = result.error;
          btn.classList.remove('active');
        } else {
          status.className = 'pip-status ok';
          status.textContent = result.action === 'entered' ? 'Popped out.' : 'Returned.';
          btn.classList.toggle('active', result.action === 'entered');
        }
      })
      .catch((err: unknown) => {
        status.className = 'pip-status err';
        status.textContent = err instanceof Error ? err.message : String(err);
      })
      .finally(() => {
        btn.disabled = !tab?.id;
      });
  });

  panel.replaceChildren(btn, label, status, hint);
}

/* ─── Shared helpers ────────────────────────────────────── */

function emptyNote(text: string, className = 'np-empty'): HTMLElement {
  const p = document.createElement('p');
  p.className = `${className} muted`;
  p.textContent = text;
  return p;
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
