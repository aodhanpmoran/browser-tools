import type { Feature } from '../../shared/feature';

/**
 * Image Picker has no background behaviour — the popup opens the grid page,
 * which does all scanning and downloading. This placeholder keeps the
 * service-worker registry uniform.
 */
export const imagePickerFeature: Feature = {
  id: 'image-picker',
  async onInstall() {},
  async onEnable() {},
  async onDisable() {},
};

/** URL of the grid page, optionally targeting a tab id or a pasted source URL. */
export function gridPageUrl(params: { tabId?: number; url?: string }): string {
  const base = chrome.runtime.getURL('src/features/image-picker/grid.html');
  const qs = new URLSearchParams();
  if (params.tabId !== undefined) qs.set('tab', String(params.tabId));
  if (params.url) qs.set('url', params.url);
  const query = qs.toString();
  return query ? `${base}?${query}` : base;
}
