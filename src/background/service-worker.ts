import { FEATURE_IDS, type Feature, type FeatureId } from '../shared/feature';
import { getSettings, onSettingsChanged } from '../shared/storage';
import {
  isDirtyInputMessage,
  tabCleanerFeature,
  tabCleanerHandlers,
} from '../features/tab-cleaner';
import { cookieEditorFeature } from '../features/cookie-editor';
import { redirectTracerFeature, redirectTracerHandlers } from '../features/redirect-tracer';
import { videoSpeedFeature } from '../features/video-speed';
import { newsFeedEradicatorFeature } from '../features/news-feed-eradicator';

const REGISTRY: Readonly<Record<FeatureId, Feature>> = {
  'tab-cleaner': tabCleanerFeature,
  'cookie-editor': cookieEditorFeature,
  'redirect-tracer': redirectTracerFeature,
  'video-speed': videoSpeedFeature,
  'news-feed-eradicator': newsFeedEradicatorFeature,
};

// --- Top-level synchronous listener registration -----------------------------
// MV3 service workers are torn down when idle. Listeners must be attached
// synchronously at top-level so that the wake-up event that revives the SW is
// actually delivered to a handler. Event handlers themselves check the
// relevant feature's enabled state before doing work.

chrome.runtime.onInstalled.addListener((details) => {
  void handleInstalled(details);
});

chrome.runtime.onStartup.addListener(() => {
  void handleStartup();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  void tabCleanerHandlers.onAlarm(alarm);
});

chrome.tabs.onCreated.addListener((tab) => {
  tabCleanerHandlers.onTabCreated(tab);
});

chrome.tabs.onActivated.addListener((info) => {
  tabCleanerHandlers.onTabActivated(info);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  tabCleanerHandlers.onTabUpdated(tabId, changeInfo);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabCleanerHandlers.onTabRemoved(tabId);
  redirectTracerHandlers.onTabRemoved(tabId);
});

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    void redirectTracerHandlers.onBeforeRequest(details);
  },
  { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] },
);

chrome.webRequest.onBeforeRedirect.addListener(
  (details) => {
    void redirectTracerHandlers.onBeforeRedirect(details);
  },
  { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] },
);

chrome.webRequest.onCompleted.addListener(
  (details) => {
    void redirectTracerHandlers.onCompleted(details);
  },
  { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] },
);

chrome.runtime.onMessage.addListener((message, sender, _sendResponse) => {
  if (isDirtyInputMessage(message)) {
    void tabCleanerHandlers.onDirtyInputMessage(message, sender);
  }
  return false;
});

onSettingsChanged((next, prev) => {
  for (const id of FEATURE_IDS) {
    if (next.enabled[id] === prev.enabled[id]) continue;
    const feature = REGISTRY[id];
    const promise = next.enabled[id] ? feature.onEnable() : feature.onDisable();
    promise.catch((err: unknown) => {
      console.error(`[browser-tools] ${id} transition failed`, err);
    });
  }
});

// --- Startup paths -----------------------------------------------------------

async function handleInstalled(details: chrome.runtime.InstalledDetails): Promise<void> {
  console.log('[browser-tools] onInstalled', details.reason);
  for (const id of FEATURE_IDS) {
    await safeCall(id, 'onInstall', () => REGISTRY[id].onInstall());
  }
  await applyEnabledState();
}

async function handleStartup(): Promise<void> {
  console.log('[browser-tools] onStartup');
  await applyEnabledState();
}

async function applyEnabledState(): Promise<void> {
  const settings = await getSettings();
  for (const id of FEATURE_IDS) {
    const feature = REGISTRY[id];
    const fn = settings.enabled[id] ? feature.onEnable : feature.onDisable;
    await safeCall(id, settings.enabled[id] ? 'onEnable' : 'onDisable', () => fn.call(feature));
  }
}

async function safeCall(id: FeatureId, stage: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[browser-tools] ${id} ${stage} failed`, err);
  }
}

// Run initial apply on every SW boot. This is safe to skip the await because
// the listeners above are already attached; applyEnabledState only needs to
// ensure alarms / activity seed / etc. are up to date.
void applyEnabledState();
