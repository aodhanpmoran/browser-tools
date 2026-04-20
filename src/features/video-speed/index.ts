import type { Feature } from '../../shared/feature';

// The vendored Video Speed Controller reads its own global `enabled` flag from
// chrome.storage.sync. Our Feature implementation propagates our local toggle
// to that flag — VSC's content-bridge listens for the storage change and
// handles teardown / reinit on its own. No VSC source modifications required.
const VSC_GLOBAL_KEY = 'enabled';

async function setVscEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.sync.set({ [VSC_GLOBAL_KEY]: enabled });
}

export const videoSpeedFeature: Feature = {
  id: 'video-speed',
  onInstall: async () => {
    await setVscEnabled(true);
  },
  onEnable: async () => {
    await setVscEnabled(true);
  },
  onDisable: async () => {
    await setVscEnabled(false);
  },
};
