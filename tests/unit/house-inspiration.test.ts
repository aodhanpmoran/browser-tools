import { describe, expect, it } from 'vitest';
import { buildPayload, cleanText, cleanUrl } from '../../src/features/house-inspiration';

describe('house-inspiration payload', () => {
  it('keeps only http(s) URLs', () => {
    expect(cleanUrl('https://x.com/a')).toBe('https://x.com/a');
    expect(cleanUrl('javascript:alert(1)')).toBe('');
    expect(cleanUrl('data:image/png;base64,AAA')).toBe('');
    expect(cleanUrl(undefined)).toBe('');
  });
  it('drops control characters and caps length', () => {
    expect(cleanText('a\u0000b\u001bc\nd', 100)).toBe('abc\nd');
    expect(cleanText('x'.repeat(5000), 2000)).toHaveLength(2000);
  });
  it('builds a clean payload', () => {
    const p = buildPayload(
      { menuItemId: 'm', editable: false, pageUrl: 'https://p.com', srcUrl: 'blob:abc', selectionText: 'hi', mediaType: 'image' } as chrome.contextMenus.OnClickData,
      { title: 'T' } as chrome.tabs.Tab,
    );
    expect(p).toEqual({ mediaType: 'image', srcUrl: '', linkUrl: '', selectionText: 'hi', pageUrl: 'https://p.com', pageTitle: 'T' });
  });
});
