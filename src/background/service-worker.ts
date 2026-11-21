import { FEATURE_IDS, type Feature, type FeatureId } from '../shared/feature';
import { getSettings, onSettingsChanged } from '../shared/storage';
import {
  isDirtyInputMessage,
  tabCleanerFeature,
  tabCleanerHandlers,
} from '../features/tab-cleaner';
import { cookieEditorFeature } from '../features/cookie-editor';
import {
  isRedirectGetMessage,
  redirectTracerFeature,
  redirectTracerHandlers,
} from '../features/redirect-tracer';
import { videoSpeedFeature } from '../features/video-speed';
import { newsFeedEradicatorFeature } from '../features/news-feed-eradicator';
import { googleUnhobbleFeature } from '../features/google-unhobble';
import { nowPlayingFeature } from '../features/now-playing';
import {
  isPipToggleMessage,
  pictureInPictureFeature,
  togglePip,
} from '../features/picture-in-picture';
import { imagePickerFeature } from '../features/image-picker';
import { focusBoardFeature, focusBoardHandlers } from '../features/focus-board';
import {
  houseInspirationFeature,
  onMenuClicked as onHouseInspoMenuClicked,
} from '../features/house-inspiration';

const REGISTRY: Readonly<Record<FeatureId, Feature>> = {
  'tab-cleaner': tabCleanerFeature,
  'cookie-editor': cookieEditorFeature,
  'redirect-tracer': redirectTracerFeature,
  'video-speed': videoSpeedFeature,
  'news-feed-eradicator': newsFeedEradicatorFeature,
  'google-unhobble': googleUnhobbleFeature,
  'now-playing': nowPlayingFeature,
  'picture-in-picture': pictureInPictureFeature,
  'image-picker': imagePickerFeature,
  'focus-board': focusBoardFeature,
  'house-inspiration': houseInspirationFeature,
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

chrome.contextMenus.onClicked.addListener((info, tab) => {
  onHouseInspoMenuClicked(info, tab);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  tabCleanerHandlers.onAlarm(alarm).catch(console.error);
  focusBoardHandlers.onAlarm(alarm).catch(console.error);
});

// The badge has to track timer start/stop immediately, not on the next minute tick.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.focusBoard) return;
  // Only the timer drives the badge; task edits must not wake the handler.
  const timerOf = (v: unknown): string =>
    JSON.stringify((v as { timer?: unknown } | undefined)?.timer);
  const oldTimer = timerOf(changes.focusBoard.oldValue);
  const newTimer = timerOf(changes.focusBoard.newValue);
  if (oldTimer !== newTimer) focusBoardHandlers.onBoardChanged().catch(console.error);
});

chrome.tabs.onCreated.addListener((tab) => {
  tabCleanerHandlers.onTabCreated(tab);
  if (tab.id !== undefined) focusBoardHandlers.onTabNavigated(tab.id, tab.url).catch(console.error);
});

chrome.tabs.onActivated.addListener((info) => {
  tabCleanerHandlers.onTabActivated(info);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  tabCleanerHandlers.onTabUpdated(tabId, changeInfo);
  focusBoardHandlers.onTabNavigated(tabId, changeInfo.url ?? tab.url).catch(console.error);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabCleanerHandlers.onTabRemoved(tabId);
  redirectTracerHandlers.onTabRemoved(tabId);
});

// Unfiltered on purpose: a navigation to file:// or chrome:// must still reset
// the previous site's chain. The handler does its cheap frame checks first.
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  redirectTracerHandlers.onBeforeNavigate(details).catch(console.error);
});

chrome.webRequest.onBeforeRedirect.addListener(
  (details) => {
    redirectTracerHandlers.onBeforeRedirect(details).catch(console.error);
  },
  { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] },
);

chrome.webRequest.onCompleted.addListener(
  (details) => {
    redirectTracerHandlers.onCompleted(details).catch(console.error);
  },
  { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] },
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (isDirtyInputMessage(message)) {
    tabCleanerHandlers.onDirtyInputMessage(message, sender).catch(console.error);
    return false;
  }
  if (isPipToggleMessage(message)) {
    togglePip(message.tabId).then(sendResponse, (e) => sendResponse({ error: String(e) }));
    return true;
  }
  if (isRedirectGetMessage(message)) {
    redirectTracerHandlers
      .getTrace(message.tabId)
      .then(sendResponse, (e) => sendResponse({ error: String(e) }));
    return true;
  }
  return false;
});

onSettingsChanged((next, prev) => {
  for (const id of FEATURE_IDS) {
    if (next.enabled[id] === prev.enabled[id]) continue;
    const feature = REGISTRY[id];
    const promise = next.enabled[id]
      ? feature.onEnable().then(() => feature.onFreshEnable?.())
      : feature.onDisable();
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

/**
 * Apply feature state once per browser session. chrome.storage.session is wiped
 * on browser restart, extension reload and disable/enable — the cases that need
 * a re-apply — but survives the service worker's idle restarts, so this does not
 * bring back the old reset-every-minute behaviour.
 */
async function applyOncePerSession(): Promise<void> {
  const { booted } = await chrome.storage.session.get('booted');
  if (booted) return;
  await chrome.storage.session.set({ booted: true });
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

void applyOncePerSession().catch(console.error);
