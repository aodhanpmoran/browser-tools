// Pure metadata extractors. Exported separately from the page-injected entry
// point so they can be unit-tested in isolation, and so the runtime entry can
// compose them.

export interface NowPlaying {
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  source: 'mediaSession' | 'site' | 'title' | 'meta' | 'acrcloud';
  siteId?: string;
  pageUrl?: string;
  pageTitle?: string;
  // ACRCloud-only: YouTube search URL for the recognized track.
  externalUrl?: string;
}

// Site-specific DOM rules. Each rule runs in the page context and returns a
// NowPlaying or null. Ordered most-specific first.
export interface SiteRule {
  id: string;
  match: (url: URL) => boolean;
  extract: (doc: Document) => Omit<NowPlaying, 'source' | 'siteId'> | null;
}

export const SITE_RULES: readonly SiteRule[] = [
  {
    id: 'youtube-music',
    match: (u) => u.hostname === 'music.youtube.com',
    extract: (doc) => {
      const bar = doc.querySelector<HTMLElement>('ytmusic-player-bar');
      if (!bar) return null;
      const title = bar.querySelector<HTMLElement>('.title.ytmusic-player-bar')?.textContent?.trim();
      const subtitle = bar.querySelector<HTMLElement>('.byline.ytmusic-player-bar')?.textContent?.trim();
      if (!title) return null;
      const [artist, album] = splitSubtitle(subtitle ?? '');
      return { title, artist, album };
    },
  },
  {
    id: 'youtube',
    match: (u) => u.hostname === 'www.youtube.com' && u.pathname === '/watch',
    extract: (doc) => {
      const titleEl = doc.querySelector<HTMLElement>('h1.ytd-watch-metadata yt-formatted-string, h1.title.ytd-video-primary-info-renderer');
      const channelEl = doc.querySelector<HTMLElement>('#upload-info #channel-name a, ytd-channel-name a');
      const title = titleEl?.textContent?.trim();
      const channel = channelEl?.textContent?.trim();
      if (!title) return null;
      const parsed = parseTitleForArtistSong(title);
      return parsed
        ? { title: parsed.title, artist: parsed.artist || channel || '' }
        : { title, artist: channel ?? '' };
    },
  },
  {
    id: 'spotify',
    match: (u) => u.hostname === 'open.spotify.com',
    extract: (doc) => {
      const footer = doc.querySelector<HTMLElement>('[data-testid="now-playing-widget"], footer[data-testid="now-playing-bar"]');
      if (!footer) return null;
      const title = footer.querySelector<HTMLElement>('[data-testid="context-item-info-title"] a, a[data-testid="context-link"]')?.textContent?.trim();
      const artist = footer.querySelector<HTMLElement>('[data-testid="context-item-info-subtitles"] a, [data-testid="context-item-info-artist"] a')?.textContent?.trim();
      if (!title) return null;
      return { title, artist: artist ?? '' };
    },
  },
  {
    id: 'soundcloud',
    match: (u) => u.hostname === 'soundcloud.com',
    extract: (doc) => {
      const title = doc.querySelector<HTMLElement>('.playbackSoundBadge__titleLink')?.textContent?.trim();
      const artist = doc.querySelector<HTMLElement>('.playbackSoundBadge__lightLink')?.textContent?.trim();
      if (!title) return null;
      return { title, artist: artist ?? '' };
    },
  },
  {
    id: 'bandcamp',
    match: (u) => u.hostname.endsWith('.bandcamp.com') || u.hostname === 'bandcamp.com',
    extract: (doc) => {
      const title = doc.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content;
      const artist = doc.querySelector<HTMLMetaElement>('meta[name="Artist"]')?.content;
      if (!title) return null;
      return { title, artist: artist ?? '' };
    },
  },
  {
    id: 'apple-music',
    match: (u) => u.hostname === 'music.apple.com' || u.hostname === 'beta.music.apple.com',
    extract: (doc) => {
      const title = doc.querySelector<HTMLElement>('.web-chrome-playback-lcd__song-name-scroll')?.textContent?.trim();
      const artist = doc.querySelector<HTMLElement>('.web-chrome-playback-lcd__sub-copy-scroll a')?.textContent?.trim();
      if (!title) return null;
      return { title, artist: artist ?? '' };
    },
  },
];

// Parse common "Artist - Song" / "Song - Artist" / "Artist — Song (Official Video)" patterns.
// Returns null if the title doesn't look like it contains a separator.
export function parseTitleForArtistSong(raw: string): { artist: string; title: string } | null {
  const cleaned = raw
    // Strip common YouTube-style suffixes.
    .replace(/\s*\((official|official video|official audio|lyrics|hd|hq|4k|8k|mv|music video|remix|live|audio|visualizer)[^)]*\)\s*/gi, ' ')
    .replace(/\s*\[[^\]]*\]\s*/g, ' ')
    .replace(/\s*\|.*$/, '')
    .trim();

  // Accept -, –, — as separators. Ignore cases with no separator.
  const m = cleaned.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (!m) return null;
  const left = m[1]!.trim();
  const right = m[2]!.trim();
  if (!left || !right) return null;
  // Heuristic: if either side is ALL CAPS or very short and the other isn't, prefer that as the artist.
  // Default: "Artist - Song" — most YouTube uploads follow this convention.
  return { artist: left, title: right };
}

function splitSubtitle(s: string): [string, string | undefined] {
  // "Artist • Album" or "Artist • Song" — bullet is common on YT Music.
  const parts = s.split('•').map((x) => x.trim()).filter(Boolean);
  return [parts[0] ?? '', parts[1]];
}

export interface PageSnapshot {
  mediaSession: {
    title?: string;
    artist?: string;
    album?: string;
    artwork?: Array<{ src: string; sizes?: string }>;
  } | null;
  documentTitle: string;
  url: string;
  ogSong: string | null;
  ogArtist: string | null;
}

// Composes the candidate sources into a single NowPlaying. Pure — takes a
// snapshot of page state and optionally the document for DOM rule execution.
export function detectFromSnapshot(snapshot: PageSnapshot, doc: Document | null): NowPlaying | null {
  // 1. MediaSession metadata is populated by the player API — highest fidelity.
  if (snapshot.mediaSession?.title) {
    const ms = snapshot.mediaSession;
    return {
      title: ms.title!,
      artist: ms.artist ?? '',
      album: ms.album,
      artworkUrl: pickLargestArtwork(ms.artwork ?? []),
      source: 'mediaSession',
      pageUrl: snapshot.url,
      pageTitle: snapshot.documentTitle,
    };
  }

  // 2. Site-specific DOM rules.
  if (doc) {
    let url: URL;
    try {
      url = new URL(snapshot.url);
    } catch {
      url = new URL('https://example.com/');
    }
    for (const rule of SITE_RULES) {
      if (!rule.match(url)) continue;
      const hit = rule.extract(doc);
      if (hit && hit.title) {
        return {
          ...hit,
          source: 'site',
          siteId: rule.id,
          pageUrl: snapshot.url,
          pageTitle: snapshot.documentTitle,
        };
      }
    }
  }

  // 3. OpenGraph metadata — some sites embed track info in <meta> tags.
  if (snapshot.ogSong) {
    return {
      title: snapshot.ogSong,
      artist: snapshot.ogArtist ?? '',
      source: 'meta',
      pageUrl: snapshot.url,
      pageTitle: snapshot.documentTitle,
    };
  }

  // 4. Parse the document title as a last resort.
  const parsed = parseTitleForArtistSong(snapshot.documentTitle);
  if (parsed) {
    return {
      title: parsed.title,
      artist: parsed.artist,
      source: 'title',
      pageUrl: snapshot.url,
      pageTitle: snapshot.documentTitle,
    };
  }

  return null;
}

function pickLargestArtwork(arr: Array<{ src: string; sizes?: string }>): string | undefined {
  if (arr.length === 0) return undefined;
  const scored = arr.map((a) => ({ src: a.src, size: largestEdge(a.sizes) }));
  scored.sort((a, z) => z.size - a.size);
  return scored[0]?.src;
}

function largestEdge(sizes: string | undefined): number {
  if (!sizes) return 0;
  const first = sizes.split(/\s+/)[0] ?? '';
  const m = first.match(/^(\d+)x(\d+)/);
  if (!m) return 0;
  return Math.max(Number.parseInt(m[1]!, 10), Number.parseInt(m[2]!, 10));
}
