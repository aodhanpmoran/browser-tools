import type { FeatureId } from './feature';
import type { Settings } from './storage';

export interface PanelContext {
  readonly tab: chrome.tabs.Tab | undefined;
  readonly settings: Settings;
  /** Re-run the popup's full render pass (e.g. after mutating data outside chrome.storage). */
  refresh(): void;
}

/** A feature-owned page in the popup: one nav button, one page container. */
export interface PopupPage {
  readonly id: string;
  readonly featureId: FeatureId;
  readonly label: string;
  readonly icon: string;
  render(container: HTMLElement, ctx: PanelContext): Promise<void> | void;
}

/** A feature-owned details panel on the options page, rendered below the enable toggle. */
export interface OptionsPanel {
  readonly featureId: FeatureId;
  render(enabled: boolean): Promise<HTMLElement> | HTMLElement;
}
