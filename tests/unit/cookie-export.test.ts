import { describe, it, expect } from 'vitest';
import { exportFilename, toJson, toNetscape } from '../../src/features/cookie-editor/export';
import type { EditableCookie } from '../../src/features/cookie-editor/operations';

function cookie(overrides: Partial<EditableCookie> = {}): EditableCookie {
  return {
    url: 'https://example.com/',
    name: 'sid',
    value: 'abc',
    domain: '.example.com',
    path: '/',
    secure: true,
    httpOnly: false,
    sameSite: 'lax',
    expirationDate: 1893456000.5,
    storeId: '0',
    hostOnly: false,
    session: false,
    ...overrides,
  };
}

function dataLines(text: string): string[] {
  return text.split('\n').filter((l) => l && (!l.startsWith('#') || l.startsWith('#HttpOnly_')));
}

describe('toNetscape', () => {
  it('starts with the header curl and yt-dlp look for', () => {
    expect(toNetscape([]).startsWith('# Netscape HTTP Cookie File\n')).toBe(true);
  });

  it('writes a domain cookie with subdomains TRUE and integer expiry', () => {
    expect(dataLines(toNetscape([cookie()]))).toEqual([
      '.example.com\tTRUE\t/\tTRUE\t1893456000\tsid\tabc',
    ]);
  });

  it('writes a host-only cookie without a leading dot and subdomains FALSE', () => {
    const line = dataLines(toNetscape([cookie({ domain: 'www.example.com', hostOnly: true })]))[0]!;
    expect(line.split('\t').slice(0, 2)).toEqual(['www.example.com', 'FALSE']);
  });

  it('writes 0 expiry for session cookies', () => {
    const line = dataLines(toNetscape([cookie({ session: true, expirationDate: undefined })]))[0]!;
    expect(line.split('\t')[4]).toBe('0');
  });

  it('prefixes HttpOnly cookies with #HttpOnly_', () => {
    const line = dataLines(toNetscape([cookie({ httpOnly: true })]))[0]!;
    expect(line.startsWith('#HttpOnly_.example.com\t')).toBe(true);
  });

  it('strips tabs and newlines from values so a row cannot split', () => {
    const line = dataLines(toNetscape([cookie({ value: 'a\tb\nc' })]))[0]!;
    expect(line.split('\t')).toHaveLength(7);
    expect(line.endsWith('\tabc')).toBe(true);
  });
});

describe('toJson', () => {
  it('round-trips fields and omits url', () => {
    const [row] = JSON.parse(toJson([cookie()]));
    expect(row).toMatchObject({ name: 'sid', value: 'abc', domain: '.example.com', expirationDate: 1893456000.5 });
    expect(row).not.toHaveProperty('url');
  });

  it('omits expirationDate for session cookies', () => {
    const [row] = JSON.parse(toJson([cookie({ session: true, expirationDate: undefined })]));
    expect(row).not.toHaveProperty('expirationDate');
  });
});

describe('exportFilename', () => {
  const now = new Date('2026-10-18T12:00:00Z');
  it('names by scope, date and format', () => {
    expect(exportFilename('www.youtube.com', 'netscape', now)).toBe(
      'browser-tools/cookies/www.youtube.com-2026-10-18.txt',
    );
    expect(exportFilename('all-sites', 'json', now)).toBe('browser-tools/cookies/all-sites-2026-10-18.json');
  });

  it('sanitises unsafe characters', () => {
    expect(exportFilename('a/b:c', 'netscape', now)).toBe('browser-tools/cookies/a_b_c-2026-10-18.txt');
  });
});
