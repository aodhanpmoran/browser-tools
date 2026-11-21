import type { PanelContext, PopupPage } from '../../shared/panel';
import { emptyNote } from '../../shared/dom';
import { gridPageUrl } from './index';

export const imagePickerPopupPage: PopupPage = {
  id: 'images',
  featureId: 'image-picker',
  label: 'Images',
  icon: '🖼',
  render: renderImagePicker,
};

function renderImagePicker(container: HTMLElement, ctx: PanelContext): void {
  if (!ctx.settings.enabled['image-picker']) {
    container.replaceChildren(emptyNote('Image Picker is disabled.'));
    return;
  }

  const tab = ctx.tab;
  const canScanTab = !!tab?.id && !!tab.url && /^https?:/.test(tab.url);

  const wrap = document.createElement('div');
  wrap.className = 'ip-panel';

  const scanBtn = document.createElement('button');
  scanBtn.type = 'button';
  scanBtn.className = 'ip-scan-btn';
  scanBtn.textContent = 'Scan this tab';
  scanBtn.disabled = !canScanTab;
  scanBtn.addEventListener('click', () => {
    if (!tab?.id) return;
    void chrome.tabs.create({ url: gridPageUrl({ tabId: tab.id }) });
    window.close();
  });

  const or = document.createElement('div');
  or.className = 'ip-or';
  or.textContent = 'or paste a link';

  const form = document.createElement('form');
  form.className = 'ip-url-form';
  const input = document.createElement('input');
  input.type = 'url';
  input.className = 'ip-url-input';
  input.placeholder = 'https://example.com/gallery';
  const go = document.createElement('button');
  go.type = 'submit';
  go.className = 'secondary-button';
  go.textContent = 'Scan';
  form.append(input, go);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = input.value.trim();
    if (!url) return;
    void chrome.tabs.create({ url: gridPageUrl({ url }) });
    window.close();
  });

  const hint = document.createElement('p');
  hint.className = 'ip-hint muted';
  hint.textContent = canScanTab
    ? 'Opens a grid of every image on the page. Tick the ones you want, then download.'
    : 'Open a normal web page to scan its images, or paste a link above.';

  wrap.append(scanBtn, or, form, hint);
  container.replaceChildren(wrap);
}
