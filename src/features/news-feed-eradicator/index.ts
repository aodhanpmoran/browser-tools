import type { Feature } from '../../shared/feature';

export const newsFeedEradicatorFeature: Feature = {
  id: 'news-feed-eradicator',
  onInstall: async () => {},
  onEnable: async () => {
    console.log('[browser-tools] news-feed-eradicator: enabled (stub — M2 vendors fork)');
  },
  onDisable: async () => {
    console.log('[browser-tools] news-feed-eradicator: disabled (stub)');
  },
};
