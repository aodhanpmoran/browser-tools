import type { Feature } from '../../shared/feature';
import { forgetTab, resetAllTabTimestamps, seedExistingTabs, setDirtyInput, touchTab } from './activity';
import { runSweep } from './cleaner';
import { getSettings } from '../../shared/storage';

export const TAB_CLEANER_ALARM = 'tab-cleaner/sweep';

// The service worker registers these handlers at top-level on every SW boot.
// Each handler is expected to check the feature's enabled state itself — that
// makes the handlers safe to register even when the feature is currently off.
export const tabCleanerHandlers = {
  async onAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
    if (alarm.name !== TAB_CLEANER_ALARM) return;
    const settings = await getSettings();
    if (!settings.enabled['tab-cleaner']) return;
    await runSweep();
  },

  onTabCreated(tab: chrome.tabs.Tab): void {
    if (tab.id === undefined) return;
    void touchTab(tab.id);
  },

  onTabActivated(info: chrome.tabs.OnActivatedInfo): void {
    void touchTab(info.tabId);
  },

  onTabUpdated(tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo): void {
    if (changeInfo.url !== undefined) {
      void touchTab(tabId, { hasDirtyInput: false });
    } else if (changeInfo.status === 'complete') {
      void touchTab(tabId);
    }
  },

  onTabRemoved(tabId: number): void {
    void forgetTab(tabId);
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
    // Fresh start: when the user flips the feature on after some time with it
    // off, we don't want stale lastActiveAt timestamps to immediately close
    // tabs that were simply idle while the feature was disabled.
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
