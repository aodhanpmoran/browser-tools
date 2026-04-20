export interface ClosedTab {
  title: string;
  url: string;
  favicon: string | undefined;
  closedAt: number;
}

const STORAGE_KEY = 'recentlyClosed';
const CAP = 200;

export async function getClosed(): Promise<ClosedTab[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stored = result[STORAGE_KEY] as ClosedTab[] | undefined;
  return stored ?? [];
}

export async function addClosed(entry: ClosedTab): Promise<void> {
  const existing = await getClosed();
  existing.unshift(entry);
  if (existing.length > CAP) existing.length = CAP;
  await chrome.storage.local.set({ [STORAGE_KEY]: existing });
}

export async function clearClosed(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}
