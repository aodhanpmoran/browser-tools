import type { PanelContext, PopupPage } from '../../shared/panel';
import { emptyNote } from '../../shared/dom';
import type { NowPlayingSettings } from '../../shared/storage';
import type { DetectResponse, NowPlaying } from './index';
import { saveTrack } from './history';
import { runAcrIdentify, type IdentifyResult } from './popup-identify';

export const nowPlayingPopupPage: PopupPage = {
  id: 'music',
  featureId: 'now-playing',
  label: 'Music',
  icon: '🎵',
  render: renderNowPlaying,
};

async function renderNowPlaying(container: HTMLElement, ctx: PanelContext): Promise<void> {
  const tab = ctx.tab;
  const settings = ctx.settings.nowPlaying;
  if (!ctx.settings.enabled['now-playing']) {
    container.replaceChildren(emptyNote('Now Playing is disabled.'));
    return;
  }
  if (!tab?.id || !tab.url || !tab.url.startsWith('http')) {
    container.replaceChildren(emptyNote('No eligible tab.'));
    return;
  }

  container.replaceChildren(emptyNote('Checking…'));
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
  children.push(renderMusicHero(container, settings, result !== null));
  container.replaceChildren(...children);
}

function renderMusicHero(
  panel: HTMLElement,
  settings: NowPlayingSettings,
  hasNowPlaying: boolean,
): HTMLElement {
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
    void runIdentifyFlow(panel, btn, timer, label, hero, settings);
  });

  return wrap;
}

async function runIdentifyFlow(
  panel: HTMLElement,
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
