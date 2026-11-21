import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectOnTab, needsDom } from '../../src/features/now-playing/inject';

afterEach(() => vi.unstubAllGlobals());

const snap = () => ({
  mediaSession: null,
  documentTitle: 'Radiohead - Creep',
  url: 'https://example.com/x',
  ogSong: null,
  ogArtist: null,
});

describe('needsDom', () => {
  it('only for sites with DOM rules', () => {
    expect(needsDom('https://open.spotify.com/track/1')).toBe(true);
    expect(needsDom('https://example.com/')).toBe(false);
    expect(needsDom('garbage')).toBe(false);
  });
});

describe('detectOnTab', () => {
  it('detects from the injected snapshot', async () => {
    const executeScript = vi.fn().mockResolvedValue([{ result: { snapshot: snap(), html: null } }]);
    vi.stubGlobal('chrome', { scripting: { executeScript } });
    const r = await detectOnTab(5, 'https://example.com/x');
    expect(r?.title).toBe('Creep');
    expect(executeScript.mock.calls[0]![0]).toMatchObject({ target: { tabId: 5 }, args: [false] });
  });

  it('returns null on restricted pages', async () => {
    const executeScript = vi.fn().mockRejectedValue(new Error('Cannot access a chrome:// URL'));
    vi.stubGlobal('chrome', { scripting: { executeScript } });
    expect(await detectOnTab(1, 'https://chromewebstore.google.com/')).toBeNull();
  });
});
