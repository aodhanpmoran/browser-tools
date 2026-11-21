import type { Feature } from '../../shared/feature';
import { getSettingsCached } from '../../shared/storage';
import { appendHop, clearTab, getTrace, recordFinal, resetForTab } from './chains';

export type { Hop, RedirectTrace } from './chains';

async function isEnabled(): Promise<boolean> {
  const settings = await getSettingsCached();
  return settings.enabled['redirect-tracer'];
}

export const redirectTracerHandlers = {
  async onBeforeNavigate(details: {
    tabId: number;
    frameId: number;
    url: string;
  }): Promise<void> {
    if (details.frameId !== 0) return;
    if (details.tabId < 0) return;
    if (!(await isEnabled())) return;
    await resetForTab(details.tabId);
  },

  async onBeforeRedirect(details: chrome.webRequest.OnBeforeRedirectDetails): Promise<void> {
    if (details.type !== 'main_frame') return;
    if (details.tabId < 0) return;
    if (!(await isEnabled())) return;
    await appendHop(details.tabId, details);
  },

  async onCompleted(details: chrome.webRequest.OnCompletedDetails): Promise<void> {
    if (details.type !== 'main_frame') return;
    if (details.tabId < 0) return;
    if (!(await isEnabled())) return;
    await recordFinal(details.tabId, details);
  },

  onTabRemoved(tabId: number): void {
    clearTab(tabId).catch(console.error);
  },

  getTrace,
};

export interface RedirectGetMessage {
  kind: 'redirect.get';
  tabId: number;
}

export function isRedirectGetMessage(value: unknown): value is RedirectGetMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'redirect.get' &&
    typeof (value as { tabId?: unknown }).tabId === 'number'
  );
}

export const redirectTracerFeature: Feature = {
  id: 'redirect-tracer',
  onInstall: async () => {},
  onEnable: async () => {},
  onDisable: async () => {},
};
