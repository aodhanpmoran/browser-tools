import { FEATURE_IDS, FEATURE_META, type FeatureId } from '../shared/feature';
import { getSettings, patchSettings, setFeatureEnabled } from '../shared/storage';
import { SITE_RULES } from '../features/news-feed-eradicator/rules';
import { renderCookieEditorPanel } from '../features/cookie-editor/options-panel';

const navEl = document.querySelector<HTMLElement>('#feature-nav');
const panelEl = document.querySelector<HTMLElement>('#feature-panel');

if (!navEl) throw new Error('#feature-nav not found');
if (!panelEl) throw new Error('#feature-panel not found');

let activeId: FeatureId = readHashId() ?? FEATURE_IDS[0]!;

window.addEventListener('hashchange', () => {
  const next = readHashId();
  if (next && next !== activeId) {
    activeId = next;
    void render();
  }
});

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'local') void render();
});

void render();

async function render(): Promise<void> {
  const settings = await getSettings();
  renderNav(settings.enabled);
  await renderPanel(activeId);
}

function renderNav(enabled: Record<FeatureId, boolean>): void {
  navEl!.replaceChildren(
    ...FEATURE_IDS.map((id) => {
      const meta = FEATURE_META[id];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav-item';
      if (id === activeId) button.classList.add('active');
      const dot = document.createElement('span');
      dot.className = enabled[id] ? 'dot on' : 'dot off';
      const label = document.createElement('span');
      label.textContent = meta.label;
      button.append(dot, label);
      button.addEventListener('click', () => {
        activeId = id;
        window.location.hash = `#${id}`;
        void render();
      });
      return button;
    }),
  );
}

async function renderPanel(id: FeatureId): Promise<void> {
  const meta = FEATURE_META[id];
  const settings = await getSettings();
  const enabled = settings.enabled[id];

  const header = document.createElement('header');
  const h2 = document.createElement('h2');
  h2.textContent = meta.label;
  const description = document.createElement('p');
  description.className = 'description';
  description.textContent = meta.description;
  header.append(h2, description);

  const toggle = featureToggle(id, enabled);

  const details = await renderDetails(id, enabled);

  panelEl!.replaceChildren(header, toggle, details);
}

function featureToggle(id: FeatureId, enabled: boolean): HTMLLabelElement {
  const toggle = document.createElement('label');
  toggle.className = 'toggle';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = enabled;
  checkbox.addEventListener('change', () => {
    void setFeatureEnabled(id, checkbox.checked);
  });
  const text = document.createElement('span');
  text.textContent = enabled ? 'Enabled' : 'Disabled';
  toggle.append(checkbox, text);
  return toggle;
}

async function renderDetails(id: FeatureId, enabled: boolean): Promise<HTMLElement> {
  switch (id) {
    case 'news-feed-eradicator':
      return renderNfePanel(enabled);
    case 'video-speed':
      return renderVideoSpeedPanel();
    case 'tab-cleaner':
      return renderTabCleanerPanel(enabled);
    case 'cookie-editor':
      return renderCookieEditorPanel(enabled);
    case 'redirect-tracer':
      return renderRedirectTracerPanel(enabled);
    case 'google-unhobble':
      return renderGoogleUnhobblePanel(enabled);
    case 'now-playing':
      return renderNowPlayingPanel(enabled);
    case 'picture-in-picture':
      return renderPictureInPicturePanel();
  }
}

async function renderNowPlayingPanel(featureEnabled: boolean): Promise<HTMLElement> {
  const [settings, { getSavedTracks, clearSavedTracks }] = await Promise.all([
    getSettings(),
    import('../features/now-playing/history'),
  ]);
  const { historyCap, acrHost, acrKey, acrSecret, audioCaptureSeconds } = settings.nowPlaying;

  const root = document.createElement('section');
  root.className = 'np-options-panel';

  // Audio identification settings
  const audioHeader = document.createElement('h3');
  audioHeader.className = 'subheader';
  audioHeader.textContent = 'Audio identification (ACRCloud)';

  const makeInput = (
    labelText: string,
    placeholder: string,
    value: string,
    onChange: (v: string) => void,
    inputType: 'text' | 'password' = 'text',
  ): HTMLLabelElement => {
    const label = document.createElement('label');
    label.className = 'np-key-label';
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = inputType;
    input.className = 'np-key-input';
    input.placeholder = placeholder;
    input.value = value;
    input.disabled = !featureEnabled;
    input.addEventListener('change', () => onChange(input.value.trim()));
    label.append(input);
    return label;
  };

  const hostLabel = makeInput(
    'Host',
    'identify-eu-west-1.acrcloud.com',
    acrHost,
    (v) => void patchSettings({ nowPlaying: { acrHost: v || 'identify-eu-west-1.acrcloud.com' } }),
  );
  const keyLabel = makeInput(
    'Access key',
    'Paste your ACRCloud access key',
    acrKey,
    (v) => void patchSettings({ nowPlaying: { acrKey: v } }),
  );
  const secretLabel = makeInput(
    'Access secret',
    'Paste your ACRCloud access secret',
    acrSecret,
    (v) => void patchSettings({ nowPlaying: { acrSecret: v } }),
    'password',
  );

  const keyHelp = document.createElement('p');
  keyHelp.className = 'muted-note';
  keyHelp.innerHTML =
    'Create an Audio Recognition project at <a href="https://www.acrcloud.com/sign-up/" target="_blank" rel="noopener">acrcloud.com/sign-up</a>. The free trial runs for 14 days and caps at 500 recognitions per day. Copy the host, access key, and access secret from the project into the fields above.';

  const secHeader = document.createElement('h4');
  secHeader.className = 'subheader';
  secHeader.textContent = 'Capture duration';
  const secRow = document.createElement('div');
  secRow.className = 'range-row';
  const secRange = document.createElement('input');
  secRange.type = 'range';
  secRange.min = '5';
  secRange.max = '20';
  secRange.step = '1';
  secRange.value = String(audioCaptureSeconds);
  secRange.disabled = !featureEnabled;
  const secReadout = document.createElement('output');
  secReadout.className = 'range-readout';
  secReadout.textContent = `${audioCaptureSeconds}s`;
  secRange.addEventListener('input', () => {
    secReadout.textContent = `${secRange.value}s`;
  });
  secRange.addEventListener('change', () => {
    void patchSettings({
      nowPlaying: { audioCaptureSeconds: Number.parseInt(secRange.value, 10) },
    });
  });
  secRow.append(secRange, secReadout);

  const secHelp = document.createElement('p');
  secHelp.className = 'muted-note';
  secHelp.textContent =
    'ACRCloud needs ~5–10 s of clean audio. Longer captures slightly improve match rate but block the popup for the duration — closing the popup aborts the identify.';

  const capHeader = document.createElement('h3');
  capHeader.className = 'subheader';
  capHeader.textContent = 'History size';
  const capRow = document.createElement('div');
  capRow.className = 'range-row';
  const range = document.createElement('input');
  range.type = 'range';
  range.min = '20';
  range.max = '1000';
  range.step = '20';
  range.value = String(historyCap);
  range.disabled = !featureEnabled;
  const readout = document.createElement('output');
  readout.className = 'range-readout';
  readout.textContent = String(historyCap);
  range.addEventListener('input', () => {
    readout.textContent = range.value;
  });
  range.addEventListener('change', () => {
    void patchSettings({ nowPlaying: { historyCap: Number.parseInt(range.value, 10) } });
  });
  capRow.append(range, readout);

  const savedHeader = document.createElement('h3');
  savedHeader.className = 'subheader';
  savedHeader.textContent = 'Saved tracks';

  const list = document.createElement('ul');
  list.className = 'np-saved-list';
  const saved = await getSavedTracks();
  if (saved.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted-note';
    empty.textContent = 'No tracks saved yet. Open the popup on a page playing music, then click Save.';
    list.append(empty);
  } else {
    for (const t of saved) {
      const li = document.createElement('li');
      li.className = 'np-saved-row';
      const titleEl = document.createElement('span');
      titleEl.className = 'np-saved-title';
      titleEl.textContent = t.title;
      const artistEl = document.createElement('span');
      artistEl.className = 'np-saved-artist';
      artistEl.textContent = t.artist ? `— ${t.artist}` : '';
      const when = document.createElement('time');
      when.className = 'np-saved-time';
      when.textContent = new Date(t.savedAt).toLocaleString();
      li.append(titleEl, artistEl, when);
      list.append(li);
    }
  }

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'danger-button';
  clearBtn.textContent = 'Clear saved tracks';
  clearBtn.disabled = saved.length === 0;
  clearBtn.addEventListener('click', async () => {
    if (!confirm(`Delete ${saved.length} saved track${saved.length === 1 ? '' : 's'}?`)) return;
    await clearSavedTracks();
  });

  const privacy = document.createElement('p');
  privacy.className = 'muted-note';
  privacy.textContent =
    'Metadata detection (MediaSession / DOM / title) runs entirely in-page with no network calls. Audio identification, when you click “Listen & identify”, captures ~10 s of tab audio and uploads the compressed audio sample to your configured ACRCloud host. No audio is stored by this extension.';

  root.append(
    audioHeader,
    hostLabel,
    keyLabel,
    secretLabel,
    keyHelp,
    secHeader,
    secRow,
    secHelp,
    capHeader,
    capRow,
    savedHeader,
    list,
    clearBtn,
    privacy,
  );
  return root;
}

async function renderGoogleUnhobblePanel(featureEnabled: boolean): Promise<HTMLElement> {
  const settings = await getSettings();
  const { restoreMapsLink, restoreViewImage } = settings.googleUnhobble;

  const root = document.createElement('section');
  root.className = 'gu-panel';

  const subhead = document.createElement('h3');
  subhead.className = 'subheader';
  subhead.textContent = 'Restorations';

  const list = document.createElement('div');
  list.className = 'site-list';

  const rows: Array<[keyof typeof settings.googleUnhobble, string, string]> = [
    ['restoreMapsLink', 'Maps link on Google Search', 'Injects a Maps tab next to All / Images / Videos. Uses your current query.'],
    ['restoreViewImage', 'View image on Google Images', 'Adds a "View image" button to the image preview panel.'],
  ];
  const values = { restoreMapsLink, restoreViewImage };

  for (const [key, label, help] of rows) {
    const row = document.createElement('label');
    row.className = 'site-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = values[key];
    cb.disabled = !featureEnabled;
    cb.addEventListener('change', () => {
      void patchSettings({ googleUnhobble: { [key]: cb.checked } });
    });
    const text = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = label;
    const small = document.createElement('small');
    small.className = 'muted';
    small.textContent = help;
    small.style.display = 'block';
    text.append(strong, small);
    row.append(cb, text);
    list.append(row);
  }

  const note = document.createElement('p');
  note.className = 'muted-note';
  note.textContent =
    'Google removes these affordances for EU users under DMA compliance. Works best-effort — Google changes markup frequently.';

  root.append(subhead, list, note);
  return root;
}

async function renderRedirectTracerPanel(_featureEnabled: boolean): Promise<HTMLElement> {
  const root = document.createElement('section');
  root.className = 'rt-panel';

  const note = document.createElement('p');
  note.className = 'muted-note';
  note.textContent =
    'Captures main-frame redirects for the current page. Resets every time the tab navigates. Stored in chrome.storage.session — cleared on browser restart.';

  root.append(note);
  return root;
}

function renderPictureInPicturePanel(): HTMLElement {
  const root = document.createElement('section');
  root.className = 'pip-panel-options';
  const note = document.createElement('p');
  note.className = 'muted-note';
  note.textContent =
    'Click the "Pop out video" button in the popup to push the largest video on the current tab into a floating Picture-in-Picture window. Click again to return it.';
  root.append(note);
  return root;
}

async function renderTabCleanerPanel(featureEnabled: boolean): Promise<HTMLElement> {
  const settings = await getSettings();
  const tc = settings.tabCleaner;

  const root = document.createElement('section');
  root.className = 'tc-panel';

  const thresholdHeader = document.createElement('h3');
  thresholdHeader.className = 'subheader';
  thresholdHeader.textContent = 'Inactivity threshold';
  const thresholdRow = document.createElement('div');
  thresholdRow.className = 'range-row';
  const range = document.createElement('input');
  range.type = 'range';
  range.min = '5';
  range.max = '240';
  range.step = '5';
  range.value = String(tc.thresholdMinutes);
  range.disabled = !featureEnabled;
  const readout = document.createElement('output');
  readout.className = 'range-readout';
  readout.textContent = `${tc.thresholdMinutes} min`;
  range.addEventListener('input', () => {
    readout.textContent = `${range.value} min`;
  });
  range.addEventListener('change', () => {
    void patchSettings({
      tabCleaner: { thresholdMinutes: Number.parseInt(range.value, 10) },
    });
  });
  thresholdRow.append(range, readout);

  const exclusionsHeader = document.createElement('h3');
  exclusionsHeader.className = 'subheader';
  exclusionsHeader.textContent = 'Auto-exclude';
  const exclusionList = document.createElement('div');
  exclusionList.className = 'exclusion-list';
  const exclusions: Array<{ key: keyof typeof tc; label: string }> = [
    { key: 'excludePinned', label: 'Pinned tabs' },
    { key: 'excludeAudible', label: 'Tabs playing audio' },
    { key: 'excludeDirtyInput', label: 'Tabs with unsaved form input' },
  ];
  for (const { key, label } of exclusions) {
    const row = document.createElement('label');
    row.className = 'site-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = tc[key] as boolean;
    cb.disabled = !featureEnabled;
    cb.addEventListener('change', () => {
      void patchSettings({ tabCleaner: { [key]: cb.checked } });
    });
    const text = document.createElement('span');
    text.textContent = label;
    row.append(cb, text);
    exclusionList.append(row);
  }

  const allowlistHeader = document.createElement('h3');
  allowlistHeader.className = 'subheader';
  allowlistHeader.textContent = 'Host allowlist';
  const allowlistHelp = document.createElement('p');
  allowlistHelp.className = 'muted-note';
  allowlistHelp.textContent =
    'One hostname per line. Use *.example.com to match all subdomains. Matches are never auto-closed.';
  const allowlistArea = document.createElement('textarea');
  allowlistArea.className = 'allowlist-textarea';
  allowlistArea.rows = 6;
  allowlistArea.value = tc.allowlist.join('\n');
  allowlistArea.disabled = !featureEnabled;
  allowlistArea.placeholder = 'mail.google.com\n*.figma.com';
  allowlistArea.addEventListener('blur', () => {
    const next = allowlistArea.value
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    void patchSettings({ tabCleaner: { allowlist: next } });
  });

  const activeNote = document.createElement('p');
  activeNote.className = 'muted-note';
  activeNote.textContent =
    'The currently focused tab in each window is always preserved, regardless of exclusions.';

  root.append(
    thresholdHeader,
    thresholdRow,
    exclusionsHeader,
    exclusionList,
    allowlistHeader,
    allowlistHelp,
    allowlistArea,
    activeNote,
  );
  return root;
}

function renderVideoSpeedPanel(): HTMLElement {
  const root = document.createElement('section');
  root.className = 'vsc-panel';

  const subhead = document.createElement('h3');
  subhead.className = 'subheader';
  subhead.textContent = 'Keyboard shortcuts';

  const dl = document.createElement('dl');
  dl.className = 'shortcut-list';
  const shortcuts: Array<[string, string]> = [
    ['S', 'decrease playback speed by 0.1'],
    ['D', 'increase playback speed by 0.1'],
    ['Z', 'rewind 10 seconds'],
    ['X', 'advance 10 seconds'],
    ['R', 'reset speed to 1.0'],
    ['G', 'toggle preferred speed (default 1.8)'],
    ['V', 'show / hide the speed controller overlay'],
  ];
  for (const [key, label] of shortcuts) {
    const dt = document.createElement('dt');
    dt.textContent = key;
    const dd = document.createElement('dd');
    dd.textContent = label;
    dl.append(dt, dd);
  }

  const attribution = document.createElement('p');
  attribution.className = 'muted-note';
  attribution.innerHTML =
    'Vendored from <a href="https://github.com/igrigorik/videospeed" target="_blank" rel="noopener">igrigorik/videospeed</a> (MIT). Advanced configuration is not currently exposed through this UI — see the upstream README if you need to tweak key bindings.';

  root.append(subhead, dl, attribution);
  return root;
}

async function renderNfePanel(featureEnabled: boolean): Promise<HTMLElement> {
  const settings = await getSettings();
  const { sitesEnabled, showReplacement } = settings.newsFeedEradicator;

  const root = document.createElement('section');
  root.className = 'nfe-panel';

  const sitesHeader = document.createElement('h3');
  sitesHeader.textContent = 'Sites';
  sitesHeader.className = 'subheader';

  const sitesList = document.createElement('div');
  sitesList.className = 'site-list';

  for (const rule of SITE_RULES) {
    const row = document.createElement('label');
    row.className = 'site-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = sitesEnabled[rule.id] ?? true;
    cb.disabled = !featureEnabled;
    cb.addEventListener('change', () => {
      void patchSettings({
        newsFeedEradicator: { sitesEnabled: { [rule.id]: cb.checked } },
      });
    });
    const name = document.createElement('span');
    name.textContent = rule.label;
    row.append(cb, name);
    sitesList.append(row);
  }

  const bannerToggle = document.createElement('label');
  bannerToggle.className = 'secondary-toggle';
  const bannerCb = document.createElement('input');
  bannerCb.type = 'checkbox';
  bannerCb.checked = showReplacement;
  bannerCb.disabled = !featureEnabled;
  bannerCb.addEventListener('change', () => {
    void patchSettings({ newsFeedEradicator: { showReplacement: bannerCb.checked } });
  });
  const bannerText = document.createElement('span');
  bannerText.textContent = 'Show replacement banner';
  bannerToggle.append(bannerCb, bannerText);

  root.append(sitesHeader, sitesList, bannerToggle);
  return root;
}

function readHashId(): FeatureId | null {
  const raw = window.location.hash.replace(/^#/, '');
  return (FEATURE_IDS as readonly string[]).includes(raw) ? (raw as FeatureId) : null;
}
