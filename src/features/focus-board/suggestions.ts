/**
 * Daily suggestions handed to the board by an outside agent.
 *
 * The extension cannot reach Fathom or Gmail itself — those live behind MCP
 * connectors on the desktop. So a scheduled Claude agent reads them each
 * morning, applies judgement, and drops a JSON file on disk. We read it and
 * offer the results as dismissible suggestions; nothing ever enters Today
 * automatically, because that would blow the three-task cap on purpose set.
 *
 * The file is written by another process, so everything here treats it as
 * untrusted input: shapes are validated, numbers clamped, lists capped.
 */

export const DEFAULT_SUGGESTIONS_PATH = '.browser-tools/suggestions.json';

/** Beyond this the "suggestions" become the very list the cap exists to prevent. */
export const MAX_SUGGESTIONS = 8;
const MAX_SUBTASKS = 10;
const MAX_TITLE = 200;

export interface Suggestion {
  id: string;
  title: string;
  /** Where it came from, e.g. 'fathom' or 'gmail'. Free-form; shown as a chip. */
  source: string;
  /** Human context for the source, e.g. "Tue call with Eddie Hobbs". */
  sourceDetail?: string;
  url?: string;
  /**
   * 1-10: if this were done, how much easier or more irrelevant does it make
   * everything else? The whole point of the scoring — a 9 is a candidate for
   * The One, a 3 is busywork that merely feels productive.
   */
  leverage: number;
  leverageWhy?: string;
  subtasks: string[];
}

export interface SuggestionsPayload {
  suggestions: Suggestion[];
  /** Epoch ms the file was written, if the agent said so. */
  generatedAt?: number;
  /** The goal the agent scored leverage against, echoed back for display. */
  goal?: string;
}

export type SuggestionsStatus = 'ok' | 'empty' | 'missing' | 'malformed';

export interface SuggestionsResult extends SuggestionsPayload {
  status: SuggestionsStatus;
  message?: string;
}

/**
 * Clamps to the 1-10 band, defaulting to the neutral middle when absent or junk.
 *
 * Deliberately strict about what counts as a number: `Number(null)` and
 * `Number('')` are both 0, which would clamp to 1 and quietly bury a task at
 * the bottom of the list. An unscored suggestion should sort neutrally, not
 * last.
 */
export function clampLeverage(value: unknown): number {
  let n: number;
  if (typeof value === 'number') {
    n = value;
  } else if (typeof value === 'string' && value.trim() !== '') {
    n = Number(value);
  } else {
    return 5;
  }
  if (!Number.isFinite(n)) return 5;
  return Math.min(10, Math.max(1, Math.round(n)));
}

function cleanString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Stable fallback id so dismissals survive a regenerated file. */
function derivedId(title: string, source: string): string {
  const basis = `${source}:${title}`.toLowerCase();
  let hash = 0;
  for (let i = 0; i < basis.length; i++) {
    hash = (hash * 31 + basis.charCodeAt(i)) | 0;
  }
  return `d${(hash >>> 0).toString(36)}`;
}

/**
 * Validates and normalises whatever was in the file. Anything unusable is
 * dropped rather than thrown on — one malformed entry must not cost you the
 * whole morning's suggestions.
 */
export function parseSuggestions(raw: unknown): SuggestionsPayload {
  if (typeof raw !== 'object' || raw === null) return { suggestions: [] };
  const doc = raw as Record<string, unknown>;
  const list = Array.isArray(doc.suggestions) ? doc.suggestions : [];

  const seen = new Set<string>();
  const suggestions: Suggestion[] = [];

  for (const entry of list) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const title = cleanString(e.title, MAX_TITLE);
    if (!title) continue;

    const source = cleanString(e.source, 40) || 'note';
    const id = cleanString(e.id, 80) || derivedId(title, source);
    if (seen.has(id)) continue;
    seen.add(id);

    const subtasks = Array.isArray(e.subtasks)
      ? e.subtasks
          .map((s) => cleanString(s, MAX_TITLE))
          .filter(Boolean)
          .slice(0, MAX_SUBTASKS)
      : [];

    suggestions.push({
      id,
      title,
      source,
      sourceDetail: cleanString(e.sourceDetail, 120) || undefined,
      url: cleanString(e.url, 500) || undefined,
      leverage: clampLeverage(e.leverage),
      leverageWhy: cleanString(e.leverageWhy, 240) || undefined,
      subtasks,
    });
  }

  // Highest leverage first — the thing that makes everything else easier
  // should never be below the fold. Ties break on title for a stable order.
  suggestions.sort((a, b) => b.leverage - a.leverage || a.title.localeCompare(b.title));

  const generatedAtRaw = doc.generatedAt;
  let generatedAt: number | undefined;
  if (typeof generatedAtRaw === 'number' && Number.isFinite(generatedAtRaw)) {
    generatedAt = generatedAtRaw;
  } else if (typeof generatedAtRaw === 'string') {
    const parsed = Date.parse(generatedAtRaw);
    if (!Number.isNaN(parsed)) generatedAt = parsed;
  }

  return {
    suggestions: suggestions.slice(0, MAX_SUGGESTIONS),
    generatedAt,
    goal: cleanString(doc.goal, 120) || undefined,
  };
}

/** Drops anything already dismissed or already sitting on the board. */
export function visibleSuggestions(
  suggestions: readonly Suggestion[],
  dismissed: readonly string[],
  existingTitles: readonly string[],
): Suggestion[] {
  const skip = new Set(dismissed);
  const titles = new Set(existingTitles.map((t) => t.trim().toLowerCase()));
  return suggestions.filter((s) => !skip.has(s.id) && !titles.has(s.title.toLowerCase()));
}

/** Turns a stored absolute path into a file:// URL. Already-URL input passes through. */
export function toFileUrl(rawPath: string): string {
  const p = rawPath.trim();
  if (p.startsWith('file://')) return p;
  return `file://${p.replace(/\/{2,}/g, '/')}`;
}

const SKIP_HOME_DIRS = new Set(['shared', 'guest', '.localized']);

/**
 * Reading a file:// path can block indefinitely — `/home` on macOS is an autofs
 * automount that never answers, and a network volume can stall just as long.
 * Every probe is therefore time-boxed rather than awaited on faith.
 */
const PROBE_TIMEOUT_MS = 1500;

async function fetchWithTimeout(url: string, ms = PROBE_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pulls directory names out of a Chrome file:// listing.
 *
 * Chrome does not render listings as `<a href>` markup — it emits a script
 * that calls `addRow(name, url, isdir, size, ...)` per entry, so that is what
 * has to be parsed. `isdir` is 1 for directories.
 */
export function parseDirectoryListing(html: string): string[] {
  const names = [...html.matchAll(/addRow\("((?:[^"\\]|\\.)*)","(?:[^"\\]|\\.)*",(\d)/g)]
    .filter((m) => m[2] === '1')
    .map((m) => m[1]!.replace(/\\(.)/g, '$1'))
    .filter((n) => n && n !== '.' && n !== '..' && !n.startsWith('.'))
    .filter((n) => !SKIP_HOME_DIRS.has(n.toLowerCase()));
  return [...new Set(names)];
}

/**
 * Finds the suggestions file by enumerating home directories, since a popup
 * has no filesystem API to expand `~` with. Returns the first home that
 * actually holds the file; failing that the most plausible path, so the field
 * is pre-filled and the agent has somewhere agreed to write to.
 */
export async function detectSuggestionsPath(
  relative = DEFAULT_SUGGESTIONS_PATH,
): Promise<string | null> {
  let firstGuess: string | null = null;

  for (const root of ['/Users/', '/home/']) {
    let html: string;
    try {
      // A file:// directory listing comes back with status 0, so `res.ok` is
      // meaningless here — read the body and let the parse decide.
      html = await (await fetchWithTimeout(`file://${root}`)).text();
    } catch {
      continue;
    }

    const candidates = parseDirectoryListing(html).map((n) => `${root}${n}/${relative}`);
    if (candidates.length > 0) firstGuess ??= candidates[0]!;

    for (const candidate of candidates) {
      try {
        const probe = await fetchWithTimeout(`file://${candidate}`);
        if (probe.ok) return candidate;
      } catch {
        // Unreadable candidate; keep looking.
      }
    }
  }
  return firstGuess;
}

/**
 * Reads and parses the suggestions file. Never throws — a missing file is the
 * normal state before the first agent run, not an error worth shouting about.
 */
export async function loadSuggestions(fileUrl: string): Promise<SuggestionsResult> {
  let text: string;
  try {
    const response = await fetchWithTimeout(fileUrl);
    if (!response.ok) {
      return { status: 'missing', suggestions: [], message: `No file at ${fileUrl}` };
    }
    text = await response.text();
  } catch {
    // Almost always the "Allow access to file URLs" toggle being off.
    return {
      status: 'missing',
      suggestions: [],
      message: 'Could not read the file. Is "Allow access to file URLs" enabled for this extension?',
    };
  }

  try {
    const payload = parseSuggestions(JSON.parse(text));
    return {
      ...payload,
      status: payload.suggestions.length > 0 ? 'ok' : 'empty',
    };
  } catch {
    return { status: 'malformed', suggestions: [], message: 'File is not valid JSON.' };
  }
}
