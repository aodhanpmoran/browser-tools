import { FEATURE_IDS, FEATURE_META, type FeatureId } from '../shared/feature';
import { getSettings, patchSettings, setFeatureEnabled } from '../shared/storage';
import { SITE_RULES } from '../features/news-feed-eradicator/rules';

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
    case 'redirect-tracer':
      return placeholder(placeholderText(id));
  }
}

function placeholder(text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'placeholder';
  p.textContent = text;
  return p;
}

function placeholderText(id: FeatureId): string {
  switch (id) {
    case 'tab-cleaner':
      return 'Threshold, allowlist, and exclusion controls appear in milestone M4.';
    case 'cookie-editor':
      return 'Cookie table and nuke controls appear in milestone M5.';
    case 'redirect-tracer':
      return 'Buffer size and clear controls appear in milestone M6.';
    case 'video-speed':
    case 'news-feed-eradicator':
    case 'tab-cleaner':
      return '';
  }
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
