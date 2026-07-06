import type { Feature } from '../../shared/feature';

// All behaviour lives in the content script. The feature object is a no-op
// placeholder so the service-worker registry can treat it uniformly.
export const googleUnhobbleFeature: Feature = {
  id: 'google-unhobble',
  async onInstall() {},
  async onEnable() {},
  async onDisable() {},
};
