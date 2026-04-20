import { FEATURE_IDS, FEATURE_META, type FeatureId } from '../shared/feature';
import { getSettings, setFeatureEnabled } from '../shared/storage';

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
  renderPanel(activeId, settings.enabled[activeId]);
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

function renderPanel(id: FeatureId, enabled: boolean): void {
  const meta = FEATURE_META[id];

  const h2 = document.createElement('h2');
  h2.textContent = meta.label;

  const description = document.createElement('p');
  description.className = 'description';
  description.textContent = meta.description;

  const toggle = document.createElement('label');
  toggle.className = 'toggle';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = enabled;
  checkbox.addEventListener('change', () => {
    void setFeatureEnabled(id, checkbox.checked);
  });
  const toggleText = document.createElement('span');
  toggleText.textContent = enabled ? 'Enabled' : 'Disabled';
  toggle.append(checkbox, toggleText);

  const placeholder = document.createElement('p');
  placeholder.className = 'placeholder';
  placeholder.textContent = detailPlaceholder(id);

  panelEl!.replaceChildren(h2, description, toggle, placeholder);
}

function detailPlaceholder(id: FeatureId): string {
  switch (id) {
    case 'tab-cleaner':
      return 'Threshold, allowlist, and exclusion controls appear in milestone M4.';
    case 'cookie-editor':
      return 'Cookie table and nuke controls appear in milestone M5.';
    case 'redirect-tracer':
      return 'Buffer size and clear controls appear in milestone M6.';
    case 'video-speed':
      return 'Vendored from igrigorik/videospeed in milestone M3. Settings live on its own UI.';
    case 'news-feed-eradicator':
      return 'Vendored from jordwest/news-feed-eradicator in milestone M2. Settings live on its own UI.';
  }
}

function readHashId(): FeatureId | null {
  const raw = window.location.hash.replace(/^#/, '');
  return (FEATURE_IDS as readonly string[]).includes(raw) ? (raw as FeatureId) : null;
}
