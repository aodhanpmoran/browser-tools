import type { PanelContext, PopupPage } from '../../shared/panel';
import { emptyNote } from '../../shared/dom';
import type { RedirectTrace } from './index';

export const redirectTracerPopupPage: PopupPage = {
  id: 'redirects',
  featureId: 'redirect-tracer',
  label: 'Hops',
  icon: '🔀',
  render: renderRedirects,
};

async function renderRedirects(container: HTMLElement, ctx: PanelContext): Promise<void> {
  if (!ctx.settings.enabled['redirect-tracer'] || ctx.tab?.id === undefined) {
    container.replaceChildren(emptyNote('No active tab.', 'redirect-empty'));
    return;
  }
  const trace = (await chrome.runtime.sendMessage({
    kind: 'redirect.get',
    tabId: ctx.tab.id,
  })) as RedirectTrace | undefined;

  if (!trace || (trace.chain.length === 0 && !trace.finalUrl)) {
    container.replaceChildren(
      emptyNote('No redirects captured for this tab yet.', 'redirect-empty'),
    );
    return;
  }

  container.replaceChildren(renderTrace(trace));
}

function renderTrace(trace: RedirectTrace): HTMLElement {
  const wrap = document.createElement('div');

  const list = document.createElement('ol');
  list.className = 'redirect-list';

  const steps: Array<{ url: string; status: number | null; label: string; isFinal: boolean }> = [];
  for (const hop of trace.chain) {
    steps.push({
      url: hop.url,
      status: hop.statusCode,
      label: redirectLabel(hop.statusCode),
      isFinal: false,
    });
  }
  if (trace.finalUrl) {
    steps.push({
      url: trace.finalUrl,
      status: trace.finalStatus,
      label: 'Final destination',
      isFinal: true,
    });
  }
  if (steps.length === 1 && steps[0]) {
    steps[0].isFinal = true;
    steps[0].label = 'Final destination';
  }

  for (const step of steps) {
    const li = document.createElement('li');
    li.className = 'redirect-step';
    if (step.isFinal) li.classList.add('final');

    const url = document.createElement('div');
    url.className = 'redirect-url';
    url.textContent = step.url;
    url.title = step.url;

    const meta = document.createElement('div');
    meta.className = 'redirect-meta';
    if (step.status) {
      const badge = document.createElement('span');
      badge.className = `redirect-status-badge ${classifyStatus(step.status)}`;
      badge.textContent = String(step.status);
      meta.append(badge);
    }
    const label = document.createElement('span');
    label.className = 'redirect-status-label';
    label.textContent = step.label;
    meta.append(label);

    li.append(url, meta);
    list.append(li);
  }

  wrap.append(list);

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'secondary-button';
  copyBtn.textContent = 'Copy chain';
  copyBtn.addEventListener('click', () => {
    const text = traceToText(trace);
    void navigator.clipboard.writeText(text).then(() => {
      copyBtn.textContent = 'Copied';
      setTimeout(() => (copyBtn.textContent = 'Copy chain'), 1200);
    });
  });
  wrap.append(copyBtn);

  return wrap;
}

function traceToText(trace: RedirectTrace): string {
  const lines: string[] = [];
  for (const hop of trace.chain) {
    lines.push(hop.url);
    lines.push(`${hop.statusCode}: ${redirectLabel(hop.statusCode)} → ${hop.redirectUrl}`);
    lines.push('');
  }
  if (trace.finalUrl) {
    lines.push(trace.finalUrl);
    lines.push(`${trace.finalStatus ?? '—'}: Final destination`);
  }
  return lines.join('\n');
}

function classifyStatus(code: number): string {
  if (code >= 200 && code < 300) return 'ok';
  if (code >= 300 && code < 400) return 'redirect';
  if (code >= 400) return 'error';
  return 'unknown';
}

function redirectLabel(code: number): string {
  const labels: Record<number, string> = {
    301: 'Permanent redirect',
    302: 'Temporary redirect (Found)',
    303: 'See Other',
    307: 'Temporary redirect',
    308: 'Permanent redirect',
  };
  return labels[code] ?? `Redirect (${code})`;
}
