import { FEATURE_IDS, FEATURE_META, type FeatureId } from '../shared/feature';
import { getSettings, setFeatureEnabled } from '../shared/storage';
import { renderNfeOptionsPanel } from '../features/news-feed-eradicator/options-panel';
import { renderVideoSpeedOptionsPanel } from '../features/video-speed/options-panel';
import { renderTabCleanerOptionsPanel } from '../features/tab-cleaner/options-panel';
import { renderCookieEditorPanel } from '../features/cookie-editor/options-panel';
import { renderRedirectTracerOptionsPanel } from '../features/redirect-tracer/options-panel';
import { renderGoogleUnhobbleOptionsPanel } from '../features/google-unhobble/options-panel';
import { renderNowPlayingOptionsPanel } from '../features/now-playing/options-panel';
import { renderPictureInPictureOptionsPanel } from '../features/picture-in-picture/options-panel';

type OptionsPanelRenderer = (enabled: boolean) => Promise<HTMLElement> | HTMLElement;

const PANELS: Readonly<Record<FeatureId, OptionsPanelRenderer>> = {
  'tab-cleaner': renderTabCleanerOptionsPanel,
  'cookie-editor': renderCookieEditorPanel,
  'redirect-tracer': renderRedirectTracerOptionsPanel,
  'video-speed': renderVideoSpeedOptionsPanel,
  'news-feed-eradicator': renderNfeOptionsPanel,
  'google-unhobble': renderGoogleUnhobbleOptionsPanel,
  'now-playing': renderNowPlayingOptionsPanel,
  'picture-in-picture': renderPictureInPictureOptionsPanel,
};

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
  await renderPanel(activeId, settings.enabled[activeId]);
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

async function renderPanel(id: FeatureId, enabled: boolean): Promise<void> {
  const meta = FEATURE_META[id];

  const header = document.createElement('header');
  const h2 = document.createElement('h2');
  h2.textContent = meta.label;
  const description = document.createElement('p');
  description.className = 'description';
  description.textContent = meta.description;
  header.append(h2, description);

  const toggle = featureToggle(id, enabled);

  const details = await PANELS[id](enabled);

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

function readHashId(): FeatureId | null {
  const raw = window.location.hash.replace(/^#/, '');
  return (FEATURE_IDS as readonly string[]).includes(raw) ? (raw as FeatureId) : null;
}
