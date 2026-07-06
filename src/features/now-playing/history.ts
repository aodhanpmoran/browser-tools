import type { NowPlaying } from './detect';

export interface SavedTrack extends NowPlaying {
  savedAt: number;
}

const KEY = 'nowPlayingHistory';

export async function getSavedTracks(): Promise<SavedTrack[]> {
  const result = await chrome.storage.local.get(KEY);
  return Array.isArray(result[KEY]) ? (result[KEY] as SavedTrack[]) : [];
}

export async function saveTrack(track: NowPlaying, cap: number): Promise<void> {
  const current = await getSavedTracks();
  // De-dupe: skip if same title+artist is already at the top.
  const top = current[0];
  if (top && top.title === track.title && top.artist === track.artist) return;
  const saved: SavedTrack = { ...track, savedAt: Date.now() };
  await chrome.storage.local.set({ [KEY]: [saved, ...current].slice(0, cap) });
}

export async function clearSavedTracks(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}
