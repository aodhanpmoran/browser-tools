import { describe, expect, it } from 'vitest';
import { detectFromSnapshot, parseTitleForArtistSong, type PageSnapshot } from '../../src/features/now-playing/detect';

describe('parseTitleForArtistSong', () => {
  it('parses "Artist - Song"', () => {
    expect(parseTitleForArtistSong('The Beatles - Hey Jude')).toEqual({
      artist: 'The Beatles',
      title: 'Hey Jude',
    });
  });

  it('parses em-dash separator', () => {
    expect(parseTitleForArtistSong('Radiohead — Paranoid Android')).toEqual({
      artist: 'Radiohead',
      title: 'Paranoid Android',
    });
  });

  it('strips (Official Video) suffix', () => {
    expect(parseTitleForArtistSong('Daft Punk - Around The World (Official Video)')).toEqual({
      artist: 'Daft Punk',
      title: 'Around The World',
    });
  });

  it('strips [Music Video] bracketed suffix', () => {
    expect(parseTitleForArtistSong('Arctic Monkeys - R U Mine? [Official Music Video]')).toEqual({
      artist: 'Arctic Monkeys',
      title: 'R U Mine?',
    });
  });

  it('strips pipe-delimited site suffix', () => {
    expect(parseTitleForArtistSong('Fleetwood Mac - Dreams | YouTube')).toEqual({
      artist: 'Fleetwood Mac',
      title: 'Dreams',
    });
  });

  it('returns null without separator', () => {
    expect(parseTitleForArtistSong('Some random video title')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseTitleForArtistSong('')).toBeNull();
  });
});

describe('detectFromSnapshot', () => {
  const baseSnapshot: PageSnapshot = {
    mediaSession: null,
    documentTitle: 'Irrelevant',
    url: 'https://example.com/',
    ogSong: null,
    ogArtist: null,
  };

  it('prefers MediaSession metadata', () => {
    const result = detectFromSnapshot(
      {
        ...baseSnapshot,
        mediaSession: { title: 'Tiny Dancer', artist: 'Elton John', album: 'Madman Across The Water', artwork: [] },
        documentTitle: 'Something Else - YouTube',
      },
      null,
    );
    expect(result?.source).toBe('mediaSession');
    expect(result?.title).toBe('Tiny Dancer');
    expect(result?.artist).toBe('Elton John');
  });

  it('falls back to OpenGraph when no MediaSession', () => {
    const result = detectFromSnapshot(
      { ...baseSnapshot, ogSong: 'Bohemian Rhapsody', ogArtist: 'Queen' },
      null,
    );
    expect(result?.source).toBe('meta');
    expect(result?.title).toBe('Bohemian Rhapsody');
    expect(result?.artist).toBe('Queen');
  });

  it('falls back to title parsing when nothing else fits', () => {
    const result = detectFromSnapshot(
      { ...baseSnapshot, documentTitle: 'Pixies - Where Is My Mind (Official)' },
      null,
    );
    expect(result?.source).toBe('title');
    expect(result?.title).toBe('Where Is My Mind');
    expect(result?.artist).toBe('Pixies');
  });

  it('returns null when no source matches', () => {
    const result = detectFromSnapshot(
      { ...baseSnapshot, documentTitle: 'Just a page' },
      null,
    );
    expect(result).toBeNull();
  });

  it('picks largest artwork by edge size', () => {
    const result = detectFromSnapshot(
      {
        ...baseSnapshot,
        mediaSession: {
          title: 'x',
          artist: 'y',
          artwork: [
            { src: 'small.jpg', sizes: '64x64' },
            { src: 'big.jpg', sizes: '512x512' },
            { src: 'mid.jpg', sizes: '256x256' },
          ],
        },
      },
      null,
    );
    expect(result?.artworkUrl).toBe('big.jpg');
  });
});
