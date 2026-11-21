// On-demand detection. The popup injects a self-contained snapshot function into
// the active tab (instead of a content script registered on every page).

import { detectFromSnapshot, SITE_RULES, type NowPlaying, type PageSnapshot } from './detect';

interface InjectedResult {
  snapshot: PageSnapshot;
  html: string | null;
}

// Runs in the page: must not reference anything outside its own body.
function collectInPage(wantHtml: boolean): InjectedResult {
  const ms = navigator.mediaSession?.metadata ?? null;
  return {
    snapshot: {
      mediaSession: ms
        ? {
            title: ms.title,
            artist: ms.artist,
            album: ms.album,
            artwork: Array.from(ms.artwork ?? []).map((a) => ({ src: a.src, sizes: a.sizes })),
          }
        : null,
      documentTitle: document.title,
      url: location.href,
      ogSong:
        document.querySelector<HTMLMetaElement>('meta[property="og:music:song"]')?.content ?? null,
      ogArtist:
        document.querySelector<HTMLMetaElement>('meta[property="og:music:musician"]')?.content ??
        null,
    },
    html: wantHtml ? document.documentElement.outerHTML : null,
  };
}

// Site DOM rules need a Document; ship the page HTML only when a rule applies.
export function needsDom(url: string): boolean {
  try {
    const u = new URL(url);
    return SITE_RULES.some((r) => r.match(u));
  } catch {
    return false;
  }
}

// Returns null when the page cannot be scripted (chrome://, web store, etc.).
export async function detectOnTab(tabId: number, tabUrl: string): Promise<NowPlaying | null> {
  const wantHtml = needsDom(tabUrl);
  let injected: InjectedResult | undefined;
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: collectInPage,
      args: [wantHtml],
    });
    injected = res?.result as InjectedResult | undefined;
  } catch {
    return null;
  }
  if (!injected) return null;
  const doc = injected.html
    ? new DOMParser().parseFromString(injected.html, 'text/html')
    : null;
  return detectFromSnapshot(injected.snapshot, doc);
}
