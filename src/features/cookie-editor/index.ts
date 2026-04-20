import type { Feature } from '../../shared/feature';

export const cookieEditorFeature: Feature = {
  id: 'cookie-editor',
  onInstall: async () => {},
  onEnable: async () => {
    console.log('[browser-tools] cookie-editor: enabled (stub — M5 implements)');
  },
  onDisable: async () => {
    console.log('[browser-tools] cookie-editor: disabled (stub)');
  },
};
