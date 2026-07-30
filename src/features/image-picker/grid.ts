import { safeHost } from '../../shared/dom';
import { extractImagesFromHtml, filenameForUrl, type FoundImage } from './scan';
import { collectImagesInPage } from './collect';

interface Card {
  image: FoundImage;
  el: HTMLElement;
  checkbox: HTMLInputElement;
  width: number;
  height: number;
  loaded: boolean;
  broken: boolean;
}

const sourceEl = document.querySelector<HTMLElement>('#source')!;
const statusEl = document.querySelector<HTMLElement>('#status')!;
const gridEl = document.querySelector<HTMLElement>('#grid')!;
const controlsEl = document.querySelector<HTMLElement>('#controls')!;
const selectAllEl = document.querySelector<HTMLInputElement>('#select-all')!;
const selectAllLabel = document.querySelector<HTMLElement>('#select-all-label')!;
const downloadBtn = document.querySelector<HTMLButtonElement>('#download-btn')!;
const minWEl = document.querySelector<HTMLInputElement>('#min-w')!;
const minHEl = document.querySelector<HTMLInputElement>('#min-h')!;
const urlForm = document.querySelector<HTMLFormElement>('#url-form')!;
const urlInput = document.querySelector<HTMLInputElement>('#url-input')!;

let cards: Card[] = [];
/** Hostname used to group downloads; the scanned page's host, not the image host. */
let sourceHost = 'images';

void init();

selectAllEl.addEventListener('change', () => {
  for (const card of visibleCards()) {
    if (card.broken) continue;
    card.checkbox.checked = selectAllEl.checked;
  }
  updateDownloadState();
});

minWEl.addEventListener('input', applyFilters);
minHEl.addEventListener('input', applyFilters);
downloadBtn.addEventListener('click', () => void downloadSelected());

urlForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;
  const target = new URL(location.href);
  target.searchParams.delete('tab');
  target.searchParams.set('url', url);
  location.href = target.href;
});

async function init(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const tabParam = params.get('tab');
  const urlParam = params.get('url');

  try {
    if (urlParam) {
      urlInput.value = urlParam;
      await scanUrl(urlParam);
    } else if (tabParam) {
      await scanTab(Number.parseInt(tabParam, 10));
    } else {
      setStatus('Paste a link above, or open this from the extension popup on a page.');
    }
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), true);
  }
}

async function scanTab(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  if (!tab || !tab.url || !/^https?:/.test(tab.url)) {
    setStatus("Can't scan this page — it isn't a normal web page.", true);
    return;
  }
  sourceHost = safeHost(tab.url);
  sourceEl.textContent = `Scanning tab: ${tab.title || tab.url}`;

  let results: FoundImage[];
  try {
    const injected = await chrome.scripting.executeScript({
      target: { tabId },
      func: collectImagesInPage,
    });
    results = (injected[0]?.result as FoundImage[] | undefined) ?? [];
  } catch (err) {
    setStatus(
      `Couldn't read images from that tab (${err instanceof Error ? err.message : String(err)}).`,
      true,
    );
    return;
  }
  renderResults(results);
}

async function scanUrl(url: string): Promise<void> {
  let normalized: string;
  try {
    normalized = new URL(url).href;
  } catch {
    setStatus('That doesn’t look like a valid URL.', true);
    return;
  }
  sourceHost = safeHost(normalized);
  sourceEl.textContent = `Scanning URL: ${normalized}`;
  setStatus('Fetching…');

  let res: Response;
  try {
    res = await fetch(normalized, { credentials: 'omit' });
  } catch (err) {
    setStatus(
      `Fetch failed: ${err instanceof Error ? err.message : String(err)}. The site may block cross-origin requests — open it in a tab and scan from the popup instead.`,
      true,
    );
    return;
  }
  if (!res.ok) {
    setStatus(`Fetch returned HTTP ${res.status}. Can't read the page.`, true);
    return;
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('html')) {
    setStatus(`That URL returned ${contentType || 'a non-HTML response'}, not a web page.`, true);
    return;
  }
  const html = await res.text();
  renderResults(extractImagesFromHtml(html, normalized));
}

function renderResults(images: FoundImage[]): void {
  if (images.length === 0) {
    setStatus('No images found on this page.', false);
    controlsEl.hidden = true;
    gridEl.hidden = true;
    return;
  }

  cards = images.map(buildCard);
  gridEl.replaceChildren(...cards.map((c) => c.el));
  gridEl.hidden = false;
  controlsEl.hidden = false;
  statusEl.hidden = true;
  applyFilters();
}

function buildCard(image: FoundImage): Card {
  const el = document.createElement('figure');
  el.className = 'card';

  const label = document.createElement('label');
  label.className = 'card-media';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'card-check';

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.src = image.url;
  img.alt = image.alt ?? '';

  label.append(checkbox, img);

  const meta = document.createElement('figcaption');
  meta.className = 'card-meta';
  const dim = document.createElement('span');
  dim.className = 'card-dim';
  dim.textContent = '…';
  const host = document.createElement('span');
  host.className = 'card-host';
  host.textContent = safeHost(image.url);
  host.title = image.url;
  if (image.source === 'meta') {
    const tag = document.createElement('span');
    tag.className = 'card-tag';
    tag.textContent = 'meta';
    meta.append(dim, tag, host);
  } else {
    meta.append(dim, host);
  }

  el.append(label, meta);

  const card: Card = { image, el, checkbox, width: 0, height: 0, loaded: false, broken: false };

  img.addEventListener('load', () => {
    card.width = img.naturalWidth;
    card.height = img.naturalHeight;
    card.loaded = true;
    dim.textContent = `${img.naturalWidth}×${img.naturalHeight}`;
    applyFilters();
  });
  img.addEventListener('error', () => {
    card.broken = true;
    el.classList.add('broken');
    dim.textContent = 'failed to load';
    checkbox.checked = false;
    checkbox.disabled = true;
    applyFilters();
  });

  checkbox.addEventListener('change', updateDownloadState);
  return card;
}

function applyFilters(): void {
  const minW = Number.parseInt(minWEl.value, 10) || 0;
  const minH = Number.parseInt(minHEl.value, 10) || 0;
  for (const card of cards) {
    // Unloaded cards stay visible until we know their size.
    const tooSmall = card.loaded && (card.width < minW || card.height < minH);
    const hidden = card.broken ? true : tooSmall;
    card.el.hidden = hidden;
    if (hidden) card.checkbox.checked = false;
  }
  updateDownloadState();
}

function visibleCards(): Card[] {
  return cards.filter((c) => !c.el.hidden);
}

function updateDownloadState(): void {
  const selected = cards.filter((c) => c.checkbox.checked && !c.broken);
  downloadBtn.disabled = selected.length === 0;
  downloadBtn.textContent = selected.length
    ? `Download selected (${selected.length})`
    : 'Download selected';

  const selectable = visibleCards().filter((c) => !c.broken);
  const allChecked = selectable.length > 0 && selectable.every((c) => c.checkbox.checked);
  selectAllEl.checked = allChecked;
  selectAllLabel.textContent = allChecked ? 'Deselect all' : 'Select all';
}

async function downloadSelected(): Promise<void> {
  const selected = cards.filter((c) => c.checkbox.checked && !c.broken);
  if (selected.length === 0) return;

  downloadBtn.disabled = true;
  let ok = 0;
  let failed = 0;
  for (const [index, card] of selected.entries()) {
    const filename = `browser-tools/${sanitizeHost(sourceHost)}/${filenameForUrl(card.image.url, index)}`;
    try {
      await chrome.downloads.download({
        url: card.image.url,
        filename,
        conflictAction: 'uniquify',
      });
      ok += 1;
    } catch {
      failed += 1;
      card.el.classList.add('dl-failed');
    }
  }

  statusEl.hidden = false;
  setStatus(
    failed === 0
      ? `Started ${ok} download${ok === 1 ? '' : 's'} into Downloads/browser-tools/${sanitizeHost(sourceHost)}/.`
      : `Started ${ok}, ${failed} failed (marked in red).`,
    failed > 0,
  );
  downloadBtn.disabled = false;
}

function sanitizeHost(host: string): string {
  return host.replace(/[^a-zA-Z0-9.-]/g, '_') || 'images';
}

function setStatus(text: string, isError = false): void {
  statusEl.hidden = false;
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
}
