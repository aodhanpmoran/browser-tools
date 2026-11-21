import type { Feature } from '../../shared/feature';

/**
 * House Inspiration: a right-click menu item on images, links, selected text and
 * pages. It hands the item to a native messaging host on the Mac
 * (~/.agents/tools/house-inspo-chrome/host.py), which saves it and starts a Claude
 * chat in Orca that adds it to the private house inspiration page.
 */

export const HOUSE_INSPO_MENU_ID = 'house-inspiration.add';
export const HOUSE_INSPO_HOST = 'com.castcraft.house_inspo';

export interface HouseInspoPayload {
  mediaType: string;
  srcUrl: string;
  linkUrl: string;
  selectionText: string;
  pageUrl: string;
  pageTitle: string;
}

// Everything here comes from the web page, so it is untrusted: cap lengths, keep
// only http(s) URLs and drop control characters before it leaves the browser.
const MAX_URL = 2048;
const MAX_TEXT = 2000;

export function cleanText(value: string | undefined, max: number): string {
  // eslint-disable-next-line no-control-regex
  return (value ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, max);
}

export function cleanUrl(value: string | undefined): string {
  const v = cleanText(value, MAX_URL).trim();
  return /^https?:\/\//i.test(v) ? v : '';
}

export function buildPayload(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab,
): HouseInspoPayload {
  return {
    mediaType: cleanText(info.mediaType, 20),
    srcUrl: cleanUrl(info.srcUrl),
    linkUrl: cleanUrl(info.linkUrl),
    selectionText: cleanText(info.selectionText, MAX_TEXT),
    pageUrl: cleanUrl(info.pageUrl ?? tab?.url),
    pageTitle: cleanText(tab?.title, 300),
  };
}

async function createMenu(): Promise<void> {
  await removeMenu();
  chrome.contextMenus.create({
    id: HOUSE_INSPO_MENU_ID,
    title: 'Add to House Inspiration',
    contexts: ['image', 'link', 'selection', 'page', 'video'],
  }, () => void chrome.runtime.lastError);
}

async function removeMenu(): Promise<void> {
  try {
    await chrome.contextMenus.remove(HOUSE_INSPO_MENU_ID);
  } catch {
    // Not created yet.
  }
}

function notify(message: string): void {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/house-inspiration.png'),
    title: 'House inspiration',
    message,
  });
}

export function onMenuClicked(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): void {
  if (info.menuItemId !== HOUSE_INSPO_MENU_ID) return;
  chrome.runtime.sendNativeMessage(
    HOUSE_INSPO_HOST,
    buildPayload(info, tab),
    (resp?: { ok?: boolean; error?: string }) => {
      if (chrome.runtime.lastError) {
        notify('Could not reach the Mac helper: ' + chrome.runtime.lastError.message);
        return;
      }
      notify(resp?.ok ? 'Started a Claude chat in Orca to add it.' : 'Failed: ' + (resp?.error ?? 'unknown'));
    },
  );
}

export const houseInspirationFeature: Feature = {
  id: 'house-inspiration',
  onInstall: async () => {},
  onEnable: createMenu,
  onDisable: removeMenu,
};
