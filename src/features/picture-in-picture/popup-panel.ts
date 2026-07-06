import type { PanelContext, PopupPage } from '../../shared/panel';
import { emptyNote } from '../../shared/dom';
import type { PipResult } from './index';

export const pictureInPicturePopupPage: PopupPage = {
  id: 'pip',
  featureId: 'picture-in-picture',
  label: 'PiP',
  icon: '🖼',
  render: renderPip,
};

function renderPip(container: HTMLElement, ctx: PanelContext): void {
  const tab = ctx.tab;
  if (!ctx.settings.enabled['picture-in-picture']) {
    container.replaceChildren(emptyNote('Picture-in-Picture is disabled.'));
    return;
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pip-btn';
  btn.disabled = !tab?.id;
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><rect x="12" y="9" width="8" height="6" rx="1" ry="1" fill="currentColor" opacity="0.3"/><polyline points="8 21 12 17 16 21"/></svg>';

  const label = document.createElement('div');
  label.className = 'pip-label';
  label.textContent = 'Toggle Picture-in-Picture';

  const status = document.createElement('div');
  status.className = 'pip-status';

  const hint = document.createElement('p');
  hint.className = 'pip-hint';
  hint.textContent =
    'Pops the largest video on the current tab into a floating window. Click again to exit.';

  btn.addEventListener('click', () => {
    if (!tab?.id) return;
    btn.disabled = true;
    status.className = 'pip-status';
    status.textContent = 'Working…';
    void chrome.runtime
      .sendMessage({ kind: 'pip.toggle', tabId: tab.id })
      .then((result: PipResult | undefined) => {
        if (!result) {
          status.className = 'pip-status err';
          status.textContent = 'No response from service worker.';
        } else if ('error' in result) {
          status.className = 'pip-status err';
          status.textContent = result.error;
          btn.classList.remove('active');
        } else {
          status.className = 'pip-status ok';
          status.textContent = result.action === 'entered' ? 'Popped out.' : 'Returned.';
          btn.classList.toggle('active', result.action === 'entered');
        }
      })
      .catch((err: unknown) => {
        status.className = 'pip-status err';
        status.textContent = err instanceof Error ? err.message : String(err);
      })
      .finally(() => {
        btn.disabled = !tab?.id;
      });
  });

  container.replaceChildren(btn, label, status, hint);
}
