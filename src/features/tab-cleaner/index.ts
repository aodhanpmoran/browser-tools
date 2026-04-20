import type { Feature } from '../../shared/feature';

export const tabCleanerFeature: Feature = {
  id: 'tab-cleaner',
  onInstall: async () => {},
  onEnable: async () => {
    console.log('[browser-tools] tab-cleaner: enabled (stub — M4 implements)');
  },
  onDisable: async () => {
    console.log('[browser-tools] tab-cleaner: disabled (stub)');
  },
};
