import type { Feature } from '../../shared/feature';
import { getSettings } from '../../shared/storage';
import { appendHop, clearTab, getTrace, recordFinal, resetForTab } from './chains';

export type { Hop, RedirectTrace } from './chains';

async function isEnabled(): Promise<boolean> {
  const settings = await getSettings();
  return settings.enabled['redirect-tracer'];
}

export const redirectTracerHandlers = {
  async onBeforeNavigate(details: {
    tabId: number;
    frameId: number;
    url: string;
  }): Promise<void> {
    if (!(await isEnabled())) return;
    if (details.frameId !== 0) return;
    if (details.tabId < 0) return;
    await resetForTab(details.tabId);
  },

  async onBeforeRedirect(details: chrome.webRequest.OnBeforeRedirectDetails): Promise<void> {
    if (!(await isEnabled())) return;
    if (details.type !== 'main_frame') return;
    if (details.tabId < 0) return;
    await appendHop(details.tabId, details);
  },

  async onCompleted(details: chrome.webRequest.OnCompletedDetails): Promise<void> {
    if (!(await isEnabled())) return;
    if (details.type !== 'main_frame') return;
    if (details.tabId < 0) return;
    await recordFinal(details.tabId, details);
  },

  onTabRemoved(tabId: number): void {
    void clearTab(tabId);
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
