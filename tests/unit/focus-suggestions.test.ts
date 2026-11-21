import { describe, expect, it } from 'vitest';
import {
  MAX_SUGGESTIONS,
  clampLeverage,
  parseDirectoryListing,
  parseSuggestions,
  toFileUrl,
  visibleSuggestions,
} from '../../src/features/focus-board/suggestions';

describe('clampLeverage', () => {
  it('keeps values inside the 1-10 band', () => {
    expect(clampLeverage(1)).toBe(1);
    expect(clampLeverage(10)).toBe(10);
    expect(clampLeverage(0)).toBe(1);
    expect(clampLeverage(99)).toBe(10);
    expect(clampLeverage(-5)).toBe(1);
  });

  it('rounds fractional scores', () => {
    expect(clampLeverage(7.4)).toBe(7);
    expect(clampLeverage(7.6)).toBe(8);
  });

  it('falls back to the middle for junk', () => {
    for (const bad of [undefined, null, 'high', NaN, {}]) {
      expect(clampLeverage(bad)).toBe(5);
    }
  });
});

describe('parseSuggestions', () => {
  it('returns nothing for junk input rather than throwing', () => {
    for (const bad of [null, undefined, 42, 'nope', []]) {
      expect(parseSuggestions(bad).suggestions).toEqual([]);
    }
  });

  it('sorts highest leverage first so the key task is never below the fold', () => {
    const { suggestions } = parseSuggestions({
      suggestions: [
        { title: 'Tidy inbox', leverage: 2, source: 'gmail' },
        { title: 'Close the retainer', leverage: 9, source: 'fathom' },
        { title: 'Book a call', leverage: 5, source: 'gmail' },
      ],
    });
    expect(suggestions.map((s) => s.title)).toEqual([
      'Close the retainer',
      'Book a call',
      'Tidy inbox',
    ]);
  });

  it('breaks leverage ties on title, so ordering is stable between runs', () => {
    const run = () =>
      parseSuggestions({
        suggestions: [
          { title: 'Beta', leverage: 7, source: 'gmail' },
          { title: 'Alpha', leverage: 7, source: 'gmail' },
        ],
      }).suggestions.map((s) => s.title);
    expect(run()).toEqual(['Alpha', 'Beta']);
    expect(run()).toEqual(run());
  });

  it('drops entries with no usable title but keeps the rest', () => {
    const { suggestions } = parseSuggestions({
      suggestions: [
        { title: '   ', leverage: 9 },
        { leverage: 8 },
        'not an object',
        { title: 'Real task', leverage: 6 },
      ],
    });
    expect(suggestions.map((s) => s.title)).toEqual(['Real task']);
  });

  it('de-duplicates by id', () => {
    const { suggestions } = parseSuggestions({
      suggestions: [
        { id: 'x', title: 'First', leverage: 5 },
        { id: 'x', title: 'Duplicate', leverage: 9 },
      ],
    });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.title).toBe('First');
  });

  it('derives a stable id when the agent omits one', () => {
    const one = parseSuggestions({ suggestions: [{ title: 'Send Q3', source: 'fathom' }] });
    const two = parseSuggestions({ suggestions: [{ title: 'Send Q3', source: 'fathom' }] });
    expect(one.suggestions[0]!.id).toBe(two.suggestions[0]!.id);
    expect(one.suggestions[0]!.id).toBeTruthy();
  });

  it('gives different sources different derived ids for the same title', () => {
    const a = parseSuggestions({ suggestions: [{ title: 'Follow up', source: 'gmail' }] });
    const b = parseSuggestions({ suggestions: [{ title: 'Follow up', source: 'fathom' }] });
    expect(a.suggestions[0]!.id).not.toBe(b.suggestions[0]!.id);
  });

  it('caps the list so suggestions never become the graveyard list', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ title: `Task ${i}`, leverage: 5 }));
    expect(parseSuggestions({ suggestions: many }).suggestions).toHaveLength(MAX_SUGGESTIONS);
  });

  it('keeps subtasks as clean strings and caps them', () => {
    const { suggestions } = parseSuggestions({
      suggestions: [
        {
          title: 'Ship it',
          subtasks: ['  step one  ', '', 42, 'step two', ...Array(20).fill('filler')],
        },
      ],
    });
    expect(suggestions[0]!.subtasks.slice(0, 2)).toEqual(['step one', 'step two']);
    expect(suggestions[0]!.subtasks.length).toBeLessThanOrEqual(10);
  });

  it('accepts generatedAt as epoch ms or an ISO string', () => {
    expect(parseSuggestions({ suggestions: [], generatedAt: 1_700_000_000_000 }).generatedAt).toBe(
      1_700_000_000_000,
    );
    expect(
      parseSuggestions({ suggestions: [], generatedAt: '2026-07-30T07:00:00.000Z' }).generatedAt,
    ).toBe(Date.parse('2026-07-30T07:00:00.000Z'));
    expect(parseSuggestions({ suggestions: [], generatedAt: 'whenever' }).generatedAt).toBeUndefined();
  });

  it('carries the goal through so the UI can show what leverage was scored against', () => {
    expect(parseSuggestions({ suggestions: [], goal: '€10K/month recurring' }).goal).toBe(
      '€10K/month recurring',
    );
  });
});

describe('visibleSuggestions', () => {
  const list = parseSuggestions({
    suggestions: [
      { id: 'a', title: 'Close the retainer', leverage: 9 },
      { id: 'b', title: 'Reply to Pearce', leverage: 6 },
      { id: 'c', title: 'Tidy inbox', leverage: 2 },
    ],
  }).suggestions;

  it('hides dismissed ids', () => {
    expect(visibleSuggestions(list, ['b'], []).map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('hides anything already on the board, matched case-insensitively', () => {
    expect(visibleSuggestions(list, [], ['  close the RETAINER ']).map((s) => s.id)).toEqual([
      'b',
      'c',
    ]);
  });

  it('returns everything when nothing is dismissed or present', () => {
    expect(visibleSuggestions(list, [], [])).toHaveLength(3);
  });
});

describe('toFileUrl', () => {
  it('prefixes an absolute path', () => {
    expect(toFileUrl('/Users/a/.browser-tools/suggestions.json')).toBe(
      'file:///Users/a/.browser-tools/suggestions.json',
    );
  });

  it('passes an existing file URL straight through', () => {
    expect(toFileUrl('file:///tmp/x.json')).toBe('file:///tmp/x.json');
  });

  it('collapses accidental double slashes', () => {
    expect(toFileUrl('/Users//a//x.json')).toBe('file:///Users/a/x.json');
  });

  it('trims surrounding whitespace from a pasted path', () => {
    expect(toFileUrl('  /tmp/x.json  ')).toBe('file:///tmp/x.json');
  });
});

describe('parseDirectoryListing', () => {
  // Chrome emits listings as addRow(name, url, isdir, size, ...) script calls,
  // not <a href> markup. Sample mirrors the real shape.
  const listing = `<!DOCTYPE html><html><head><script>
addRow("..","..",1,0,"","","");
addRow("aodhanpmoran","aodhanpmoran/",1,0,"","1/1/26","");
addRow("Shared","Shared/",1,0,"","1/1/26","");
addRow(".localized",".localized/",1,0,"","1/1/26","");
addRow("readme.txt","readme.txt",0,120,"120 B","1/1/26","");
</script></head></html>`;

  it('returns only real directories', () => {
    expect(parseDirectoryListing(listing)).toEqual(['aodhanpmoran']);
  });

  it('drops files, dot entries and shared/system dirs', () => {
    const out = parseDirectoryListing(listing);
    expect(out).not.toContain('readme.txt');
    expect(out).not.toContain('..');
    expect(out).not.toContain('Shared');
    expect(out).not.toContain('.localized');
  });

  it('de-duplicates', () => {
    const dup = 'addRow("a","a/",1,0,"","","");addRow("a","a/",1,0,"","","");';
    expect(parseDirectoryListing(dup)).toEqual(['a']);
  });

  it('unescapes quoted names', () => {
    expect(parseDirectoryListing('addRow("od\\"d","x/",1,0,"","","");')).toEqual(['od"d']);
  });

  it('returns nothing for markup with no rows', () => {
    expect(parseDirectoryListing('<html>nope</html>')).toEqual([]);
  });
});
