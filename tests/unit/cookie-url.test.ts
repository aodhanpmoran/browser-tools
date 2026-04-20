import { describe, it, expect } from 'vitest';
import { cookieScopeUrl } from '../../src/features/cookie-editor/url';

describe('cookieScopeUrl', () => {
  it('uses https for secure cookies', () => {
    expect(cookieScopeUrl({ domain: 'example.com', path: '/', secure: true })).toBe(
      'https://example.com/',
    );
  });

  it('uses http for non-secure cookies', () => {
    expect(cookieScopeUrl({ domain: 'example.com', path: '/', secure: false })).toBe(
      'http://example.com/',
    );
  });

  it('strips leading dot from domain-scope cookies', () => {
    expect(cookieScopeUrl({ domain: '.github.com', path: '/', secure: true })).toBe(
      'https://github.com/',
    );
  });

  it('does not strip dots that are not leading', () => {
    expect(
      cookieScopeUrl({ domain: 'sub.example.com', path: '/', secure: true }),
    ).toBe('https://sub.example.com/');
  });

  it('prepends a leading slash on paths missing one', () => {
    expect(cookieScopeUrl({ domain: 'example.com', path: 'foo', secure: true })).toBe(
      'https://example.com/foo',
    );
  });

  it('preserves existing path', () => {
    expect(cookieScopeUrl({ domain: 'example.com', path: '/app', secure: true })).toBe(
      'https://example.com/app',
    );
  });
});
