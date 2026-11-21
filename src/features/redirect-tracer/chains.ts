export interface Hop {
  url: string;
  statusCode: number;
  statusLine: string;
  redirectUrl: string;
}

export interface RedirectTrace {
  chain: Hop[];
  finalUrl: string | null;
  finalStatus: number | null;
}

const SESSION_PREFIX = 'redirectTrace:';

const key = (tabId: number): string => `${SESSION_PREFIX}${tabId}`;

const empty = (): RedirectTrace => ({ chain: [], finalUrl: null, finalStatus: null });

export async function getTrace(tabId: number): Promise<RedirectTrace> {
  const result = await chrome.storage.session.get(key(tabId));
  return (result[key(tabId)] as RedirectTrace | undefined) ?? empty();
}

// Per-tab promise chain so concurrent hop/final/reset writes for one tab cannot
// overwrite each other.
const tabQueues = new Map<number, Promise<void>>();

function enqueue(tabId: number, fn: () => Promise<void>): Promise<void> {
  const run = (tabQueues.get(tabId) ?? Promise.resolve()).then(fn);
  const tail = run.catch(() => undefined);
  tabQueues.set(tabId, tail);
  void tail.then(() => {
    if (tabQueues.get(tabId) === tail) tabQueues.delete(tabId);
  });
  return run;
}

async function setTrace(tabId: number, trace: RedirectTrace): Promise<void> {
  await chrome.storage.session.set({ [key(tabId)]: trace });
}

export function resetForTab(tabId: number): Promise<void> {
  return enqueue(tabId, () => setTrace(tabId, empty()));
}

export function appendHop(
  tabId: number,
  details: chrome.webRequest.OnBeforeRedirectDetails,
): Promise<void> {
  return enqueue(tabId, async () => {
    const trace = await getTrace(tabId);
    trace.chain.push({
      url: details.url,
      statusCode: details.statusCode,
      statusLine: details.statusLine ?? '',
      redirectUrl: details.redirectUrl,
    });
    await setTrace(tabId, trace);
  });
}

export function recordFinal(
  tabId: number,
  details: chrome.webRequest.OnCompletedDetails,
): Promise<void> {
  return enqueue(tabId, async () => {
    const trace = await getTrace(tabId);
    trace.finalUrl = details.url;
    trace.finalStatus = details.statusCode;
    await setTrace(tabId, trace);
  });
}

export function clearTab(tabId: number): Promise<void> {
  return enqueue(tabId, () => chrome.storage.session.remove(key(tabId)));
}
