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

async function setTrace(tabId: number, trace: RedirectTrace): Promise<void> {
  await chrome.storage.session.set({ [key(tabId)]: trace });
}

export async function resetForTab(tabId: number): Promise<void> {
  await setTrace(tabId, empty());
}

export async function appendHop(
  tabId: number,
  details: chrome.webRequest.OnBeforeRedirectDetails,
): Promise<void> {
  const trace = await getTrace(tabId);
  trace.chain.push({
    url: details.url,
    statusCode: details.statusCode,
    statusLine: details.statusLine ?? '',
    redirectUrl: details.redirectUrl,
  });
  await setTrace(tabId, trace);
}

export async function recordFinal(
  tabId: number,
  details: chrome.webRequest.OnCompletedDetails,
): Promise<void> {
  const trace = await getTrace(tabId);
  trace.finalUrl = details.url;
  trace.finalStatus = details.statusCode;
  await setTrace(tabId, trace);
}

export async function clearTab(tabId: number): Promise<void> {
  await chrome.storage.session.remove(key(tabId));
}
