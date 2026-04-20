import type { Feature } from '../../shared/feature';

// The News Feed Eradicator feature is implemented entirely in the content
// script at ./content.ts (declared in manifest.config.ts). The service worker
// has nothing to do at runtime — enable/disable is driven from storage and
// read by the content script on every settings change.
export const newsFeedEradicatorFeature: Feature = {
  id: 'news-feed-eradicator',
  onInstall: async () => {},
  onEnable: async () => {},
  onDisable: async () => {},
};
