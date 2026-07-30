import { FEATURE_IDS, FEATURE_META, type FeatureId } from '../shared/feature';
import { getSettings, setFeatureEnabled } from '../shared/storage';
import type { PanelContext, PopupPage } from '../shared/panel';
import { cookieEditorPopupPage } from '../features/cookie-editor/popup-panel';
import { redirectTracerPopupPage } from '../features/redirect-tracer/popup-panel';
import { nowPlayingPopupPage } from '../features/now-playing/popup-panel';
import { pictureInPicturePopupPage } from '../features/picture-in-picture/popup-panel';
import { imagePickerPopupPage } from '../features/image-picker/popup-panel';
import { focusBoardPopupPage } from '../features/focus-board/popup-panel';
import { renderRecentlyClosed } from '../features/tab-cleaner/popup-panel';

const PAGES: readonly PopupPage[] = [
  focusBoardPopupPage,
  imagePickerPopupPage,
  cookieEditorPopupPage,
  redirectTracerPopupPage,
  nowPlayingPopupPage,
  pictureInPicturePopupPage,
];

const navEl = document.querySelector<HTMLElement>('#nav')!;
const homePageEl = document.querySelector<HTMLElement>('#page-home')!;
const homeExtrasEl = document.querySelector<HTMLElement>('#home-extras')!;
const pagesHostEl = document.querySelector<HTMLElement>('#pages')!;
const optionsButton = document.querySelector<HTMLButtonElement>('#open-options')!;

interface PageSlot {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly pageEl: HTMLElement;
}

const pageSlots: readonly PageSlot[] = [
  { id: 'home', label: 'Home', icon: '⌂', pageEl: homePageEl },
  ...PAGES.map((page) => {
    const pageEl = document.createElement('div');
    pageEl.className = 'page';
    pageEl.hidden = true;
    const body = document.createElement('div');
    body.className = 'page-body';
    body.dataset.panel = page.id;
    pageEl.append(body);
    pagesHostEl.append(pageEl);
    return { id: page.id, label: page.label, icon: page.icon, pageEl };
  }),
];

let activePage = 'home';

optionsButton.addEventListener('click', () => chrome.runtime.openOptionsPage());

renderNav();
void render();

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'local') void render();
});

function renderNav(): void {
  navEl.replaceChildren(
    ...pageSlots.map((slot) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.page = slot.id;
      if (slot.id === activePage) btn.classList.add('active');
      const icon = document.createElement('span');
      icon.className = 'nav-icon';
      icon.textContent = slot.icon;
      const label = document.createElement('span');
      label.textContent = slot.label;
      btn.append(icon, label);
      btn.addEventListener('click', () => {
        activePage = slot.id;
        for (const s of pageSlots) s.pageEl.hidden = s.id !== slot.id;
        for (const b of navEl.querySelectorAll('button')) {
          b.classList.toggle('active', b.dataset.page === slot.id);
        }
      });
      return btn;
    }),
  );
}

async function render(): Promise<void> {
  const [settings, tab] = await Promise.all([getSettings(), getActiveTab()]);
  const ctx: PanelContext = {
    tab,
    settings,
    refresh: () => void render(),
  };

  renderFeatures(settings.enabled);
  await renderRecentlyClosed(homeExtrasEl, ctx);

  for (const page of PAGES) {
    const container = pagesHostEl.querySelector<HTMLElement>(`[data-panel="${page.id}"]`)!;
    await page.render(container, ctx);
  }
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

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
