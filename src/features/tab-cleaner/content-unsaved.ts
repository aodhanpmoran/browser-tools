const DIRTY_EVENT_KINDS = ['input', 'change'] as const;
let lastSent: boolean | null = null;

function shouldTrack(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLInputElement) {
    const ignored = new Set(['button', 'submit', 'reset', 'checkbox', 'radio']);
    return !ignored.has(target.type);
  }
  return target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

function report(dirty: boolean): void {
  if (lastSent === dirty) return;
  // After the extension reloads, this old copy keeps running in open tabs but
  // has lost its connection; sendMessage then throws synchronously.
  if (!chrome.runtime?.id) return;
  lastSent = dirty;
  try {
    chrome.runtime
      .sendMessage({ kind: 'tab-cleaner/dirty-input', payload: { dirty } })
      .catch(() => {});
  } catch {
    // Extension context invalidated.
  }
}

for (const kind of DIRTY_EVENT_KINDS) {
  document.addEventListener(
    kind,
    (event) => {
      if (shouldTrack(event.target)) report(true);
    },
    { capture: true, passive: true },
  );
}

document.addEventListener(
  'submit',
  () => {
    report(false);
  },
  { capture: true, passive: true },
);

document.addEventListener(
  'reset',
  () => {
    report(false);
  },
  { capture: true, passive: true },
);

// pagehide (not beforeunload) keeps the page eligible for the back/forward cache.
window.addEventListener('pagehide', () => {
  report(false);
});
