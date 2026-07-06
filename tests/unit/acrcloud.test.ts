import { describe, expect, it } from 'vitest';
import {
  hmacSha1Base64,
  parseAcrResponse,
  type AcrRawResponse,
} from '../../src/features/now-playing/acrcloud';

describe('hmacSha1Base64', () => {
  it('matches a known RFC 2202 test vector (key/data = all 0x0b / "Hi There")', async () => {
    // RFC 2202 test case 1 for HMAC-SHA-1.
    const key = '\x0b'.repeat(20);
    const sig = await hmacSha1Base64(key, 'Hi There');
    // b617318655057264e28bc0b6fb378c8ef146be00 -> base64
    expect(sig).toBe('thcxhlUFcmTii8C2+zeMjvFGvgA=');
  });

  it('is deterministic for equal inputs', async () => {
    const a = await hmacSha1Base64('secret', 'message');
    const b = await hmacSha1Base64('secret', 'message');
    expect(a).toBe(b);
  });
});

describe('parseAcrResponse', () => {
  it('extracts the first music match', () => {
    const data: AcrRawResponse = {
      status: { code: 0 },
      metadata: {
        music: [
          { title: 'Song A', artists: [{ name: 'Artist A' }], album: { name: 'Album A' } },
        ],
      },
    };
    const match = parseAcrResponse(data);
    expect(match.title).toBe('Song A');
    expect(match.artists).toEqual(['Artist A']);
    expect(match.album).toBe('Album A');
    expect(match.externalUrl).toContain('youtube.com/results');
  });

  it('falls back to humming match when music is empty', () => {
    const data: AcrRawResponse = {
      status: { code: 0 },
      metadata: {
        music: [],
        humming: [{ title: 'Hummed', artists: [{ name: 'Someone' }] }],
      },
    };
    const match = parseAcrResponse(data);
    expect(match.title).toBe('Hummed');
  });

  it('throws for status 1001 with catalog-mismatch hint', () => {
    expect(() => parseAcrResponse({ status: { code: 1001 } })).toThrow(/No match in ACRCloud/);
  });

  it('throws with server msg for unknown error status', () => {
    expect(() => parseAcrResponse({ status: { code: 2000, msg: 'Invalid key' } })).toThrow(
      /Invalid key/,
    );
  });

  it('joins multiple artists with commas in the YouTube query', () => {
    const data: AcrRawResponse = {
      status: { code: 0 },
      metadata: {
        music: [
          {
            title: 'Duet',
            artists: [{ name: 'Alice' }, { name: 'Bob' }],
          },
        ],
      },
    };
    const match = parseAcrResponse(data);
    expect(match.artists).toEqual(['Alice', 'Bob']);
    expect(decodeURIComponent(match.externalUrl)).toContain('Duet Alice Bob');
  });
});
