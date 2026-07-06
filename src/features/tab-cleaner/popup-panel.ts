import type { PanelContext } from '../../shared/panel';
import { formatAge } from '../../shared/dom';
import { getClosed, type ClosedTab } from './recently-closed';

/**
 * Renders the "Recently closed" section on the popup's home page.
 * Clears the container (hiding the section) when tab-cleaner is off or empty.
 */
export async function renderRecentlyClosed(
  container: HTMLElement,
  ctx: PanelContext,
): Promise<void> {
  const closed = await getClosed();
  if (!ctx.settings.enabled['tab-cleaner'] || closed.length === 0) {
    container.replaceChildren();
    container.hidden = true;
    return;
  }
  container.hidden = false;

  const head = document.createElement('div');
  head.className = 'section-head';
  const title = document.createElement('h2');
  title.className = 'page-title';
  title.textContent = 'Recently closed';
  head.append(title);

  const list = document.createElement('ul');
  list.className = 'closed-list';
  list.replaceChildren(...closed.slice(0, 10).map(renderClosedRow));

  container.replaceChildren(head, list);
}

function renderClosedRow(entry: ClosedTab): HTMLLIElement {
  const li = document.createElement('li');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'closed-item';
  btn.title = entry.url;
  btn.addEventListener('click', () => void chrome.tabs.create({ url: entry.url }));

  const img = document.createElement('img');
  if (entry.favicon) img.src = entry.favicon;
  img.alt = '';
  img.width = 16;
  img.height = 16;

  const title = document.createElement('span');
  title.className = 'closed-title';
  title.textContent = entry.title || entry.url;

  const time = document.createElement('time');
  time.className = 'closed-time';
  time.textContent = formatAge(Date.now() - entry.closedAt);

  btn.append(img, title, time);
  li.append(btn);
  return li;
}
