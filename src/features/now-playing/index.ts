import type { Feature } from '../../shared/feature';

// All runtime lives in the content script and popup. The feature entry is a
// no-op placeholder so the service-worker registry treats it uniformly.
export const nowPlayingFeature: Feature = {
  id: 'now-playing',
  async onInstall() {},
  async onEnable() {},
  async onDisable() {},
};

export type { NowPlaying } from './detect';
export type { DetectResponse } from './now-playing.content';
