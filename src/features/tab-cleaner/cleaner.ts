import { forgetTab, getActivity } from './activity';
import { isExcluded } from './exclusions';
import { addClosed } from './recently-closed';
import { getSettings } from '../../shared/storage';

export async function runSweep(): Promise<void> {
  const settings = await getSettings();
  if (!settings.enabled['tab-cleaner']) return;

  const { tabCleaner } = settings;
  const thresholdMs = tabCleaner.thresholdMinutes * 60_000;
  const now = Date.now();

  const activity = await getActivity();
  const tabs = await chrome.tabs.query({});
  const activeByWindow = new Map<number, number>();
  for (const t of tabs) {
    if (t.active && t.id !== undefined && t.windowId !== undefined) {
      activeByWindow.set(t.windowId, t.id);
    }
  }

  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    const record = activity[tab.id];
    if (!record) continue; // unseeded tabs are spared on this sweep

    const age = now - record.lastActiveAt;
    if (age < thresholdMs) continue;

    const excluded = isExcluded({
      tab,
      activity: record,
      settings: tabCleaner,
      activeTabIdInWindow: tab.windowId !== undefined ? activeByWindow.get(tab.windowId) : undefined,
    });
    if (excluded) continue;

    await closeTab(tab);
  }
}

async function closeTab(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined) return;
  try {
    await addClosed({
      title: tab.title ?? '',
      url: tab.url ?? '',
      favicon: tab.favIconUrl,
      closedAt: Date.now(),
    });
    await chrome.tabs.remove(tab.id);
    await forgetTab(tab.id);
  } catch (err) {
    console.warn('[browser-tools] tab-cleaner: close failed', tab.id, err);
  }
}
