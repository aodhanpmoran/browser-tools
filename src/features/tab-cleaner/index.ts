import type { Feature } from '../../shared/feature';
import { forgetTab, resetAllTabTimestamps, seedExistingTabs, setDirtyInput, touchTab } from './activity';
import { runSweep } from './cleaner';
import { getSettingsCached } from '../../shared/storage';

export const TAB_CLEANER_ALARM = 'tab-cleaner/sweep';

// The service worker registers these handlers at top-level on every SW boot.
// Each handler is expected to check the feature's enabled state itself — that
// makes the handlers safe to register even when the feature is currently off.
export const tabCleanerHandlers = {
  async onAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
    if (alarm.name !== TAB_CLEANER_ALARM) return;
    const settings = await getSettingsCached();
    if (!settings.enabled['tab-cleaner']) return;
    await runSweep();
  },

  onTabCreated(tab: chrome.tabs.Tab): void {
    if (tab.id === undefined) return;
    touchTab(tab.id).catch(console.error);
  },

  onTabActivated(info: chrome.tabs.OnActivatedInfo): void {
    touchTab(info.tabId).catch(console.error);
  },

  onTabUpdated(tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo): void {
    if (changeInfo.url !== undefined) {
      touchTab(tabId, { hasDirtyInput: false }).catch(console.error);
    } else if (changeInfo.status === 'complete') {
      touchTab(tabId).catch(console.error);
    }
  },

  onTabRemoved(tabId: number): void {
    forgetTab(tabId).catch(console.error);
  },

  async onDirtyInputMessage(
    message: { kind: 'tab-cleaner/dirty-input'; payload: { dirty: boolean } },
    sender: chrome.runtime.MessageSender,
  ): Promise<void> {
    if (sender.tab?.id === undefined) return;
    await setDirtyInput(sender.tab.id, message.payload.dirty);
  },
};

export const tabCleanerFeature: Feature = {
  id: 'tab-cleaner',
  onInstall: async () => {
    await seedExistingTabs();
    await chrome.alarms.create(TAB_CLEANER_ALARM, { periodInMinutes: 1 });
  },
  onEnable: async () => {
    // Alarm is persistent across SW restarts; recreate only if missing.
    const existing = await chrome.alarms.get(TAB_CLEANER_ALARM);
    if (!existing) {
      await chrome.alarms.create(TAB_CLEANER_ALARM, { periodInMinutes: 1 });
    }
    // Only add records for tabs that have none (e.g. after a browser restart
    // cleared session storage). Existing timestamps must survive: onEnable runs
    // on every startup, and resetting here would stop idle tabs ever expiring.
    await seedExistingTabs();
  },
  // Real off->on transition: stale timestamps from while the feature was off
  // must not close tabs that were simply idle in the meantime.
  onFreshEnable: async () => {
    await resetAllTabTimestamps();
  },
  onDisable: async () => {
    await chrome.alarms.clear(TAB_CLEANER_ALARM);
  },
};

export function isDirtyInputMessage(
  value: unknown,
): value is { kind: 'tab-cleaner/dirty-input'; payload: { dirty: boolean } } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'tab-cleaner/dirty-input' &&
    typeof (value as { payload?: { dirty?: unknown } }).payload?.dirty === 'boolean'
  );
}
