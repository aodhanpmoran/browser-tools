import { describe, it, expect } from 'vitest';
import { matchesAllowlist } from '../../src/features/tab-cleaner/exclusions';

describe('matchesAllowlist', () => {
  it('matches exact hostname', () => {
    expect(matchesAllowlist('https://mail.google.com/inbox', ['mail.google.com'])).toBe(true);
    expect(matchesAllowlist('https://calendar.google.com/', ['mail.google.com'])).toBe(false);
  });

  it('matches wildcard subdomains', () => {
    expect(matchesAllowlist('https://mail.google.com/inbox', ['*.google.com'])).toBe(true);
    expect(matchesAllowlist('https://google.com/', ['*.google.com'])).toBe(true); // bare domain allowed too
    expect(matchesAllowlist('https://googleappsuite.com/', ['*.google.com'])).toBe(false);
  });

  it('is case-insensitive on hostnames', () => {
    expect(matchesAllowlist('https://Mail.Google.Com/', ['mail.google.com'])).toBe(true);
    expect(matchesAllowlist('https://mail.google.com/', ['MAIL.GOOGLE.COM'])).toBe(true);
  });

  it('ignores empty entries', () => {
    expect(matchesAllowlist('https://example.com/', ['', '   '])).toBe(false);
  });

  it('handles malformed URLs gracefully', () => {
    expect(matchesAllowlist('not a url', ['example.com'])).toBe(false);
  });

  it('returns false for empty allowlist', () => {
    expect(matchesAllowlist('https://example.com/', [])).toBe(false);
  });
});
