export type PipResult = { action: 'entered' | 'exited' } | { error: string };

function pipInPage(): PipResult | Promise<PipResult> {
  if (document.pictureInPictureElement) {
    return document
      .exitPictureInPicture()
      .then(() => ({ action: 'exited' as const }))
      .catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }));
  }
  const videos = Array.from(document.querySelectorAll('video'));
  if (!videos.length) return { error: 'No video found on this page' };
  const playing = videos.filter((v) => !v.paused && !v.ended);
  const pool = playing.length ? playing : videos;
  const video = pool.reduce((a, b) =>
    b.videoWidth * b.videoHeight > a.videoWidth * a.videoHeight ? b : a,
  );
  return video
    .requestPictureInPicture()
    .then(() => ({ action: 'entered' as const }))
    .catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }));
}

export async function togglePip(tabId: number): Promise<PipResult> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: pipInPage,
      world: 'MAIN',
    });
    const result = results[0]?.result;
    if (!result) return { error: 'No result' };
    return result as PipResult;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
