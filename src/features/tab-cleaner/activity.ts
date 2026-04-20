export interface TabActivity {
  lastActiveAt: number;
  hasDirtyInput: boolean;
}

const SESSION_KEY = 'tabActivity';

export async function getActivity(): Promise<Record<number, TabActivity>> {
  const result = await chrome.storage.session.get(SESSION_KEY);
  return (result[SESSION_KEY] as Record<number, TabActivity> | undefined) ?? {};
}

export async function touchTab(tabId: number, patch: Partial<TabActivity> = {}): Promise<void> {
  const activity = await getActivity();
  const existing = activity[tabId];
  activity[tabId] = {
    lastActiveAt: patch.lastActiveAt ?? Date.now(),
    hasDirtyInput: patch.hasDirtyInput ?? existing?.hasDirtyInput ?? false,
  };
  await chrome.storage.session.set({ [SESSION_KEY]: activity });
}

export async function setDirtyInput(tabId: number, dirty: boolean): Promise<void> {
  const activity = await getActivity();
  const existing = activity[tabId];
  activity[tabId] = {
    lastActiveAt: existing?.lastActiveAt ?? Date.now(),
    hasDirtyInput: dirty,
  };
  await chrome.storage.session.set({ [SESSION_KEY]: activity });
}

export async function forgetTab(tabId: number): Promise<void> {
  const activity = await getActivity();
  if (tabId in activity) {
    delete activity[tabId];
    await chrome.storage.session.set({ [SESSION_KEY]: activity });
  }
}

export async function seedExistingTabs(): Promise<void> {
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
}

export async function resetAllTabTimestamps(): Promise<void> {
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
}
