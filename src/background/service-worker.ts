import { FEATURE_IDS, type Feature, type FeatureId } from '../shared/feature';
import { getSettings, onSettingsChanged } from '../shared/storage';
import { tabCleanerFeature } from '../features/tab-cleaner';
import { cookieEditorFeature } from '../features/cookie-editor';
import { redirectTracerFeature } from '../features/redirect-tracer';
import { videoSpeedFeature } from '../features/video-speed';
import { newsFeedEradicatorFeature } from '../features/news-feed-eradicator';

const REGISTRY: Readonly<Record<FeatureId, Feature>> = {
  'tab-cleaner': tabCleanerFeature,
  'cookie-editor': cookieEditorFeature,
  'redirect-tracer': redirectTracerFeature,
  'video-speed': videoSpeedFeature,
  'news-feed-eradicator': newsFeedEradicatorFeature,
};

chrome.runtime.onInstalled.addListener(async () => {
  console.log('[browser-tools] onInstalled');
  for (const id of FEATURE_IDS) {
    await REGISTRY[id].onInstall();
  }
  await applyEnabledState();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[browser-tools] onStartup');
  await applyEnabledState();
});

onSettingsChanged((next, prev) => {
  for (const id of FEATURE_IDS) {
    if (next.enabled[id] === prev.enabled[id]) continue;
    const feature = REGISTRY[id];
    const call = next.enabled[id] ? feature.onEnable() : feature.onDisable();
    call.catch((err: unknown) => {
      console.error(`[browser-tools] ${id} transition failed`, err);
    });
  }
});

applyEnabledState().catch((err: unknown) => {
  console.error('[browser-tools] initial apply failed', err);
});

async function applyEnabledState(): Promise<void> {
  const settings = await getSettings();
  for (const id of FEATURE_IDS) {
    const feature = REGISTRY[id];
    const call = settings.enabled[id] ? feature.onEnable() : feature.onDisable();
    await call.catch((err: unknown) => {
      console.error(`[browser-tools] ${id} apply failed`, err);
    });
  }
}
