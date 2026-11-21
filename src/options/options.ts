import { FEATURE_IDS, FEATURE_META, type FeatureId } from '../shared/feature';
import { getSettings, setFeatureEnabled } from '../shared/storage';

type OptionsPanelRenderer = (enabled: boolean) => Promise<HTMLElement> | HTMLElement;

const PANELS: Readonly<Record<FeatureId, () => Promise<OptionsPanelRenderer>>> = {
  'tab-cleaner': async () => (await import('../features/tab-cleaner/options-panel')).renderTabCleanerOptionsPanel,
  'cookie-editor': async () => (await import('../features/cookie-editor/options-panel')).renderCookieEditorPanel,
  'redirect-tracer': async () => (await import('../features/redirect-tracer/options-panel')).renderRedirectTracerOptionsPanel,
  'video-speed': async () => (await import('../features/video-speed/options-panel')).renderVideoSpeedOptionsPanel,
  'news-feed-eradicator': async () => (await import('../features/news-feed-eradicator/options-panel')).renderNfeOptionsPanel,
  'google-unhobble': async () => (await import('../features/google-unhobble/options-panel')).renderGoogleUnhobbleOptionsPanel,
  'now-playing': async () => (await import('../features/now-playing/options-panel')).renderNowPlayingOptionsPanel,
  'picture-in-picture': async () => (await import('../features/picture-in-picture/options-panel')).renderPictureInPictureOptionsPanel,
  'image-picker': async () => (await import('../features/image-picker/options-panel')).renderImagePickerOptionsPanel,
  'focus-board': async () => (await import('../features/focus-board/options-panel')).renderFocusBoardOptionsPanel,
  'house-inspiration': async () => (await import('../features/house-inspiration/options-panel')).renderHouseInspirationOptionsPanel,
};

/** Local-storage keys the options panels render from. */
const WATCHED_KEYS = ['settings', 'focusBoard', 'recentlyClosed', 'nowPlayingHistory'];

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

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && WATCHED_KEYS.some((k) => k in changes)) void render();
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

  const renderDetails = await PANELS[id]();
  const details = await renderDetails(enabled);

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
