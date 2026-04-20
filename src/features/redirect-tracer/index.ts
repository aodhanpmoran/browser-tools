import type { Feature } from '../../shared/feature';

export const redirectTracerFeature: Feature = {
  id: 'redirect-tracer',
  onInstall: async () => {},
  onEnable: async () => {
    console.log('[browser-tools] redirect-tracer: enabled (stub — M6 implements)');
  },
  onDisable: async () => {
    console.log('[browser-tools] redirect-tracer: disabled (stub)');
  },
};
