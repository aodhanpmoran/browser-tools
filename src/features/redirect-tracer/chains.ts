export interface ChainEntry {
  url: string;
  statusCode: number | undefined;
  at: number;
}

export interface RedirectChain {
  tabId: number;
  startedAt: number;
  entries: ChainEntry[];
  finishedAt: number | undefined;
}

const SESSION_KEY = 'redirectChains';

export async function getAllChains(): Promise<Record<number, RedirectChain[]>> {
  const result = await chrome.storage.session.get(SESSION_KEY);
  return (result[SESSION_KEY] as Record<number, RedirectChain[]> | undefined) ?? {};
}

export async function getChainsForTab(tabId: number): Promise<RedirectChain[]> {
  const all = await getAllChains();
  return all[tabId] ?? [];
}

export async function currentChain(tabId: number): Promise<RedirectChain | undefined> {
  const chains = await getChainsForTab(tabId);
  return chains[0];
}

export async function startChain(tabId: number, url: string): Promise<void> {
  const all = await getAllChains();
  const chain: RedirectChain = {
    tabId,
    startedAt: Date.now(),
    entries: [{ url, statusCode: undefined, at: Date.now() }],
    finishedAt: undefined,
  };
  const list = all[tabId] ?? [];
  list.unshift(chain);
  all[tabId] = list;
  await capAndSave(all, tabId);
}

export async function appendRedirect(
  tabId: number,
  toUrl: string,
  statusCode: number | undefined,
): Promise<void> {
  const all = await getAllChains();
  const list = all[tabId];
  if (!list || list.length === 0) return;
  const chain = list[0]!;
  // Record status on the previous hop (the redirect came from its response).
  const last = chain.entries[chain.entries.length - 1];
  if (last && last.statusCode === undefined) last.statusCode = statusCode;
  chain.entries.push({ url: toUrl, statusCode: undefined, at: Date.now() });
  await chrome.storage.session.set({ [SESSION_KEY]: all });
}

export async function finishChain(
  tabId: number,
  statusCode: number | undefined,
): Promise<void> {
  const all = await getAllChains();
  const list = all[tabId];
  if (!list || list.length === 0) return;
  const chain = list[0]!;
  const last = chain.entries[chain.entries.length - 1];
  if (last && last.statusCode === undefined) last.statusCode = statusCode;
  chain.finishedAt = Date.now();
  await chrome.storage.session.set({ [SESSION_KEY]: all });
}

export async function clearTab(tabId: number): Promise<void> {
  const all = await getAllChains();
  if (tabId in all) {
    delete all[tabId];
    await chrome.storage.session.set({ [SESSION_KEY]: all });
  }
}

export async function clearAll(): Promise<void> {
  await chrome.storage.session.remove(SESSION_KEY);
}

async function capAndSave(
  all: Record<number, RedirectChain[]>,
  tabId: number,
): Promise<void> {
  const list = all[tabId];
  if (list) {
    const settings = await import('../../shared/storage').then((m) => m.getSettings());
    const cap = settings.redirectTracer.bufferSize;
    if (list.length > cap) list.length = cap;
  }
  await chrome.storage.session.set({ [SESSION_KEY]: all });
}
