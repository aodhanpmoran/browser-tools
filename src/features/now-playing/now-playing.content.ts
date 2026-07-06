// Content script: runs on every page, passive listener. When the popup asks,
// snapshots the page's player state, runs detection, returns the result.

import { detectFromSnapshot, type NowPlaying, type PageSnapshot } from './detect';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isDetectRequest(message)) return false;
  const snapshot = buildSnapshot();
  const result = detectFromSnapshot(snapshot, document);
  sendResponse({ kind: 'now-playing.result', result } satisfies DetectResponse);
  return false;
});

function buildSnapshot(): PageSnapshot {
  const ms = navigator.mediaSession?.metadata ?? null;
  return {
    mediaSession: ms
      ? {
          title: ms.title,
          artist: ms.artist,
          album: ms.album,
          artwork: Array.from(ms.artwork ?? []).map((a) => ({
            src: a.src,
            sizes: a.sizes,
          })),
        }
      : null,
    documentTitle: document.title,
    url: location.href,
    ogSong:
      document.querySelector<HTMLMetaElement>('meta[property="og:music:song"]')?.content ?? null,
    ogArtist:
      document.querySelector<HTMLMetaElement>('meta[property="og:music:musician"]')?.content ?? null,
  };
}

export interface DetectRequest {
  kind: 'now-playing.detect';
}

export interface DetectResponse {
  kind: 'now-playing.result';
  result: NowPlaying | null;
}

function isDetectRequest(m: unknown): m is DetectRequest {
  return (
    typeof m === 'object' &&
    m !== null &&
    (m as { kind?: unknown }).kind === 'now-playing.detect'
  );
}
