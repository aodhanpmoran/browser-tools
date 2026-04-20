import type { Feature } from '../../shared/feature';

export const videoSpeedFeature: Feature = {
  id: 'video-speed',
  onInstall: async () => {},
  onEnable: async () => {
    console.log('[browser-tools] video-speed: enabled (stub — M3 vendors fork)');
  },
  onDisable: async () => {
    console.log('[browser-tools] video-speed: disabled (stub)');
  },
};
