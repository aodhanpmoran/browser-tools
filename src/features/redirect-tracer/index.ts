import type { Feature } from '../../shared/feature';
import { getSettings } from '../../shared/storage';
import {
  appendRedirect,
  clearTab,
  finishChain,
  startChain,
} from './chains';

export const redirectTracerHandlers = {
  async onBeforeRequest(details: chrome.webRequest.OnBeforeRequestDetails): Promise<void> {
    if (!(await isEnabled())) return;
    if (details.type !== 'main_frame') return;
    if (details.tabId < 0) return;
    await startChain(details.tabId, details.url);
  },

  async onBeforeRedirect(details: chrome.webRequest.OnBeforeRedirectDetails): Promise<void> {
    if (!(await isEnabled())) return;
    if (details.type !== 'main_frame') return;
    if (details.tabId < 0) return;
    await appendRedirect(details.tabId, details.redirectUrl, details.statusCode);
  },

  async onCompleted(details: chrome.webRequest.OnCompletedDetails): Promise<void> {
    if (!(await isEnabled())) return;
    if (details.type !== 'main_frame') return;
    if (details.tabId < 0) return;
    await finishChain(details.tabId, details.statusCode);
  },

  onTabRemoved(tabId: number): void {
    void clearTab(tabId);
  },
};

async function isEnabled(): Promise<boolean> {
  const settings = await getSettings();
  return settings.enabled['redirect-tracer'];
}

export const redirectTracerFeature: Feature = {
  id: 'redirect-tracer',
  onInstall: async () => {},
  onEnable: async () => {},
  onDisable: async () => {},
};
