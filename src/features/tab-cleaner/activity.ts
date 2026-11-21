import { getSettingsCached } from '../../shared/storage';

export interface TabActivity {
  lastActiveAt: number;
  hasDirtyInput: boolean;
}

const SESSION_KEY = 'tabActivity';

// Every read-modify-write of the blob goes through this queue so concurrent
// callers cannot overwrite each other (same pattern as focus-board/store.ts).
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn);
  writeQueue = run.catch(() => undefined);
  return run;
}

export async function getActivity(): Promise<Record<number, TabActivity>> {
  const result = await chrome.storage.session.get(SESSION_KEY);
  return (result[SESSION_KEY] as Record<number, TabActivity> | undefined) ?? {};
}

export async function touchTab(tabId: number, patch: Partial<TabActivity> = {}): Promise<void> {
  if (!(await getSettingsCached()).enabled['tab-cleaner']) return;
  return enqueue(async () => {
    const activity = await getActivity();
    const existing = activity[tabId];
    activity[tabId] = {
      lastActiveAt: patch.lastActiveAt ?? Date.now(),
      hasDirtyInput: patch.hasDirtyInput ?? existing?.hasDirtyInput ?? false,
    };
    await chrome.storage.session.set({ [SESSION_KEY]: activity });
  });
}

export function setDirtyInput(tabId: number, dirty: boolean): Promise<void> {
  return enqueue(async () => {
    const activity = await getActivity();
    const existing = activity[tabId];
    activity[tabId] = {
      lastActiveAt: existing?.lastActiveAt ?? Date.now(),
      hasDirtyInput: dirty,
    };
    await chrome.storage.session.set({ [SESSION_KEY]: activity });
  });
}

export function forgetTab(tabId: number): Promise<void> {
  return enqueue(async () => {
    const activity = await getActivity();
    if (tabId in activity) {
      delete activity[tabId];
      await chrome.storage.session.set({ [SESSION_KEY]: activity });
    }
  });
}

/** Adds a record for every open tab that has none. Existing records are untouched. */
export function seedExistingTabs(): Promise<void> {
  return enqueue(async () => {
    const tabs = await chrome.tabs.query({});
    const activity = await getActivity();
    const now = Date.now();
    let changed = false;
    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      if (!(tab.id in activity)) {
        activity[tab.id] = { lastActiveAt: now, hasDirtyInput: false };
        changed = true;
      }
    }
    if (changed) await chrome.storage.session.set({ [SESSION_KEY]: activity });
  });
}

export function resetAllTabTimestamps(): Promise<void> {
  return enqueue(async () => {
    const tabs = await chrome.tabs.query({});
    const activity = await getActivity();
    const now = Date.now();
    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      const existing = activity[tab.id];
      activity[tab.id] = {
        lastActiveAt: now,
        hasDirtyInput: existing?.hasDirtyInput ?? false,
      };
    }
    await chrome.storage.session.set({ [SESSION_KEY]: activity });
  });
}
