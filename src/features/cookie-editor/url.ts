export interface CookieScope {
  domain: string;
  path: string;
  secure: boolean;
}

// chrome.cookies.remove / set want a URL whose protocol + host + path is
// compatible with the cookie's scope. Domain-scope cookies store their domain
// with a leading '.' (e.g. '.github.com'); we must strip that to make a valid
// URL. Secure cookies must use https.
export function cookieScopeUrl(scope: CookieScope): string {
  const scheme = scope.secure ? 'https' : 'http';
  const host = scope.domain.startsWith('.') ? scope.domain.slice(1) : scope.domain;
  const path = scope.path.startsWith('/') ? scope.path : `/${scope.path}`;
  return `${scheme}://${host}${path}`;
}
