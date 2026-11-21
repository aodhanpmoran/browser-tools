import type { EditableCookie } from './operations';

export type ExportFormat = 'netscape' | 'json';

// Netscape cookies.txt, the format curl, yt-dlp, gallery-dl and wget read.
// Columns: domain, include-subdomains, path, secure, expiry (unix seconds,
// 0 = session), name, value. HttpOnly cookies get curl's `#HttpOnly_` domain
// prefix; tools that don't know it skip the line as a comment rather than
// sending a cookie the page can't see.
export function toNetscape(cookies: EditableCookie[]): string {
  const lines = [
    '# Netscape HTTP Cookie File',
    '# Exported by Browser Tools. Contains session credentials, keep private.',
    '',
  ];
  for (const c of cookies) {
    const domain = c.hostOnly ? c.domain.replace(/^\./, '') : withLeadingDot(c.domain);
    const expiry =
      c.session || c.expirationDate === undefined ? 0 : Math.floor(c.expirationDate);
    lines.push(
      [
        `${c.httpOnly ? '#HttpOnly_' : ''}${domain}`,
        c.hostOnly ? 'FALSE' : 'TRUE',
        c.path,
        c.secure ? 'TRUE' : 'FALSE',
        String(expiry),
        c.name,
        stripLineBreaks(c.value),
      ].join('\t'),
    );
  }
  return `${lines.join('\n')}\n`;
}

// Field names follow chrome.cookies.Cookie, which is what EditThisCookie and
// Cookie-Editor export, so the file imports into either.
export function toJson(cookies: EditableCookie[]): string {
  const rows = cookies.map((c) => ({
    domain: c.domain,
    hostOnly: c.hostOnly,
    httpOnly: c.httpOnly,
    name: c.name,
    path: c.path,
    sameSite: c.sameSite,
    secure: c.secure,
    session: c.session,
    storeId: c.storeId,
    value: c.value,
    ...(c.session || c.expirationDate === undefined
      ? {}
      : { expirationDate: c.expirationDate }),
  }));
  return `${JSON.stringify(rows, null, 2)}\n`;
}

export function exportFilename(scope: string, format: ExportFormat, now = new Date()): string {
  const safe = scope.replace(/[^a-zA-Z0-9.-]/g, '_') || 'cookies';
  const stamp = now.toISOString().slice(0, 10);
  return `browser-tools/cookies/${safe}-${stamp}.${format === 'netscape' ? 'txt' : 'json'}`;
}

function withLeadingDot(domain: string): string {
  return domain.startsWith('.') ? domain : `.${domain}`;
}

function stripLineBreaks(value: string): string {
  return value.replace(/[\r\n\t]/g, '');
}
