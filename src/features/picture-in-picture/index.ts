import type { Feature } from '../../shared/feature';
import { togglePip, type PipResult } from './handler';

export { togglePip };
export type { PipResult };

export interface PipToggleMessage {
  kind: 'pip.toggle';
  tabId: number;
}

export function isPipToggleMessage(value: unknown): value is PipToggleMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'pip.toggle' &&
    typeof (value as { tabId?: unknown }).tabId === 'number'
  );
}

export const pictureInPictureFeature: Feature = {
  id: 'picture-in-picture',
  onInstall: async () => {},
  onEnable: async () => {},
  onDisable: async () => {},
};
