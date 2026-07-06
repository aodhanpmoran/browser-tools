// Content script injected on google.com search and image results.
// Restores links that Google hides for EU users:
//   - "Maps" tab in the search tab-strip
//   - "View image" button on the Google Images side panel

import { getSettings } from '../../shared/storage';

const MAPS_LINK_ID = 'browser-tools-maps-link';
const VIEW_IMAGE_ID = 'browser-tools-view-image';

interface State {
  featureOn: boolean;
  mapsOn: boolean;
  viewImageOn: boolean;
}

let state: State = { featureOn: false, mapsOn: false, viewImageOn: false };

void refreshState();

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'local') void refreshState();
});

async function refreshState(): Promise<void> {
  const settings = await getSettings();
  state = {
    featureOn: settings.enabled['google-unhobble'],
    mapsOn: settings.googleUnhobble.restoreMapsLink,
    viewImageOn: settings.googleUnhobble.restoreViewImage,
  };
  run();
}

function run(): void {
  if (!state.featureOn) {
    removeInjected();
    return;
  }
  if (state.mapsOn) ensureMapsLink();
  else document.getElementById(MAPS_LINK_ID)?.remove();
  if (state.viewImageOn) ensureViewImageButtons();
  else removeViewImageButtons();
}

function removeInjected(): void {
  document.getElementById(MAPS_LINK_ID)?.remove();
  removeViewImageButtons();
}

// Re-run on SPA navigation & DOM mutations — Google is a heavy client-side app.
const observer = new MutationObserver(() => {
  if (!state.featureOn) return;
  if (state.mapsOn) ensureMapsLink();
  if (state.viewImageOn) ensureViewImageButtons();
});
observer.observe(document.documentElement, { childList: true, subtree: true });

// -- Maps link ----------------------------------------------------------------

function ensureMapsLink(): void {
  if (document.getElementById(MAPS_LINK_ID)) return;
  const tabStrip = findTabStrip();
  if (!tabStrip) return;

  const query = new URLSearchParams(location.search).get('q') ?? '';
  const href = query
    ? `https://www.google.com/maps/search/${encodeURIComponent(query)}`
    : 'https://www.google.com/maps';

  const anchor = document.createElement('a');
  anchor.id = MAPS_LINK_ID;
  anchor.href = href;
  anchor.textContent = 'Maps';
  anchor.setAttribute('role', 'link');
  anchor.className = 'browser-tools-tab-link';

  // Match existing tab style as closely as possible by copying a sibling's classes.
  const sibling = tabStrip.querySelector<HTMLElement>('a[role="link"], div[role="listitem"] a');
  if (sibling) {
    anchor.className = `${sibling.className} ${anchor.className}`;
  }

  tabStrip.appendChild(anchor);
}

function findTabStrip(): HTMLElement | null {
  // Google's search tab strip has varied over the years. Try a few selectors.
  const candidates = [
    'div[role="navigation"] div[role="list"]',
    '#hdtb-msb',
    'div[jsname="ibnC6b"]',
    'div[role="navigation"]',
  ];
  for (const sel of candidates) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el && containsSearchTabs(el)) return el;
  }
  return null;
}

function containsSearchTabs(el: HTMLElement): boolean {
  const text = el.textContent ?? '';
  // Heuristic: the tab strip contains at least two of these labels.
  const hits = ['All', 'Images', 'Videos', 'News', 'Shopping', 'Books', 'Web'].filter((w) =>
    text.includes(w),
  );
  return hits.length >= 2;
}

// -- View image ---------------------------------------------------------------

function ensureViewImageButtons(): void {
  if (!location.pathname.startsWith('/search')) return;
  const params = new URLSearchParams(location.search);
  if (params.get('udm') !== '2' && params.get('tbm') !== 'isch') return;

  // Google's images preview panel varies. Target any large preview image not
  // yet annotated with a view-image button.
  const previews = document.querySelectorAll<HTMLImageElement>(
    'img[jsname="kn3ccd"], img.sFlh5c, img.iPVvYb, div[jsname="figiqf"] img',
  );
  for (const img of previews) {
    if (!img.src || img.src.startsWith('data:')) continue;
    const panel = img.closest<HTMLElement>('div[jsname], [role="dialog"], aside') ?? img.parentElement;
    if (!panel) continue;
    if (panel.querySelector(`#${VIEW_IMAGE_ID}`)) continue;

    const button = document.createElement('a');
    button.id = VIEW_IMAGE_ID;
    button.textContent = 'View image';
    button.href = img.src;
    button.target = '_blank';
    button.rel = 'noreferrer noopener';
    Object.assign(button.style, {
      display: 'inline-block',
      margin: '8px 0',
      padding: '6px 12px',
      borderRadius: '18px',
      background: '#1a73e8',
      color: '#fff',
      fontFamily: 'Google Sans, Roboto, Arial, sans-serif',
      fontSize: '13px',
      fontWeight: '500',
      textDecoration: 'none',
      cursor: 'pointer',
    } satisfies Partial<CSSStyleDeclaration>);
    panel.insertBefore(button, panel.firstChild);
  }
}

function removeViewImageButtons(): void {
  document.querySelectorAll(`#${VIEW_IMAGE_ID}`).forEach((el) => el.remove());
}
