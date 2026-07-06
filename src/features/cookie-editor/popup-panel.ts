import type { PanelContext, PopupPage } from '../../shared/panel';
import { emptyNote, safeHost } from '../../shared/dom';
import { listForUrl, nukeSite } from './operations';

export const cookieEditorPopupPage: PopupPage = {
  id: 'cookies',
  featureId: 'cookie-editor',
  label: 'Cookies',
  icon: '🍪',
  render: renderCookies,
};

async function renderCookies(container: HTMLElement, ctx: PanelContext): Promise<void> {
  const tab = ctx.tab;
  if (!ctx.settings.enabled['cookie-editor'] || !tab?.url || !isEditableUrl(tab.url)) {
    container.replaceChildren(emptyNote('No cookies to edit on this tab.'));
    return;
  }

  const cookies = await listForUrl(tab.url).catch(() => []);
  const host = safeHost(tab.url);

  const head = document.createElement('div');
  head.className = 'cookies-head';
  const count = document.createElement('div');
  count.className = 'cookies-count';
  count.textContent = `${cookies.length} cookie${cookies.length === 1 ? '' : 's'}`;
  const hostEl = document.createElement('div');
  hostEl.className = 'cookies-host';
  hostEl.textContent = host;
  head.append(count, hostEl);

  const actions = document.createElement('div');
  actions.className = 'cookies-actions';
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'secondary-button';
  editBtn.textContent = 'Open editor';
  editBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
  const nukeBtn = document.createElement('button');
  nukeBtn.type = 'button';
  nukeBtn.className = 'danger-button-small';
  nukeBtn.textContent = `Nuke ${cookies.length}`;
  nukeBtn.disabled = cookies.length === 0;
  nukeBtn.addEventListener('click', () => {
    if (!confirm(`Delete ${cookies.length} cookie${cookies.length === 1 ? '' : 's'} for ${host}?`))
      return;
    void nukeSite(tab.url!).then(() => ctx.refresh());
  });
  actions.append(editBtn, nukeBtn);

  container.replaceChildren(head, actions);
}

function isEditableUrl(url: string): boolean {
  return /^https?:\/\//.test(url);
}
