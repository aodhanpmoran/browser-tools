import type { Feature } from '../../shared/feature';

// The Cookie Editor feature has no persistent runtime state in the service
// worker. All operations are triggered by messages from the popup or options
// page, which call chrome.cookies.* APIs directly from their own pages (they
// run with the same extension privileges as the SW).
export const cookieEditorFeature: Feature = {
  id: 'cookie-editor',
  onInstall: async () => {},
  onEnable: async () => {},
  onDisable: async () => {},
};
