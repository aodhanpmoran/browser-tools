import { describe, expect, it } from 'vitest';
import { filenameForUrl, parseSrcset, pickLargestSrcsetUrl } from '../../src/features/image-picker/scan';

describe('parseSrcset', () => {
  it('splits ordinary candidates', () => {
    const c = parseSrcset('a.jpg 300w, b.jpg 600w');
    expect(c.map((x) => x.url)).toEqual(['a.jpg', 'b.jpg']);
    expect(c[1]!.width).toBe(600);
  });

  it('keeps commas inside CDN URLs', () => {
    const c = parseSrcset('https://cdn.x/w_300,h_200/x.jpg 300w, https://cdn.x/w_600,h_400/x.jpg 600w');
    expect(c.map((x) => x.url)).toEqual([
      'https://cdn.x/w_300,h_200/x.jpg',
      'https://cdn.x/w_600,h_400/x.jpg',
    ]);
  });

  it('handles a comma without space after a descriptor', () => {
    expect(parseSrcset('a.jpg 1x,b.jpg 2x').map((x) => x.url)).toEqual(['a.jpg', 'b.jpg']);
  });

  it('picks the largest url', () => {
    expect(pickLargestSrcsetUrl('https://c/w_1,h_1/a.jpg 100w, https://c/w_9,h_9/a.jpg 900w')).toBe(
      'https://c/w_9,h_9/a.jpg',
    );
  });
});

describe('filenameForUrl', () => {
  it('keeps hyphens', () => {
    expect(filenameForUrl('https://x.com/my-photo-1.png', 0)).toBe('my-photo-1.png');
  });
  it('replaces illegal characters', () => {
    expect(filenameForUrl('https://x.com/a%3Ab.png', 0)).toBe('a_b.png');
  });
  it('falls back to indexed name', () => {
    expect(filenameForUrl('https://x.com/', 2)).toBe('image-003.jpg');
  });
});
