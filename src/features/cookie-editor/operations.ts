import { cookieScopeUrl } from './url';

export interface EditableCookie {
  url: string; // reconstructed for remove/set
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: chrome.cookies.Cookie['sameSite'];
  expirationDate: number | undefined;
  storeId: string;
  hostOnly: boolean;
  session: boolean;
}

export async function listForUrl(url: string): Promise<EditableCookie[]> {
  const cookies = await chrome.cookies.getAll({ url });
  return cookies.map(toEditable);
}

export async function listAll(): Promise<EditableCookie[]> {
  const cookies = await chrome.cookies.getAll({});
  return cookies.map(toEditable);
}

export async function removeOne(cookie: EditableCookie): Promise<void> {
  await chrome.cookies.remove({
    url: cookie.url,
    name: cookie.name,
    storeId: cookie.storeId,
  });
}

export async function setOne(cookie: EditableCookie): Promise<void> {
  const details: chrome.cookies.SetDetails = {
    url: cookie.url,
    name: cookie.name,
    value: cookie.value,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite === 'unspecified' || !cookie.sameSite ? undefined : cookie.sameSite,
    storeId: cookie.storeId,
  };
  if (!cookie.hostOnly) details.domain = cookie.domain;
  if (!cookie.session && cookie.expirationDate !== undefined) {
    details.expirationDate = cookie.expirationDate;
  }
  await chrome.cookies.set(details);
}

export async function updateCookie(
  original: EditableCookie,
  next: EditableCookie,
): Promise<void> {
  // Chrome stores cookies by (domain, path, name, storeId) tuple. If any of
  // those change, remove the old entry first; otherwise `set` will create a
  // new cookie and orphan the original.
  const keyChanged =
    original.domain !== next.domain ||
    original.path !== next.path ||
    original.name !== next.name;
  if (keyChanged) await removeOne(original);
  await setOne(next);
}

export async function nukeSite(url: string): Promise<number> {
  const cookies = await listForUrl(url);
  for (const cookie of cookies) await removeOne(cookie);
  return cookies.length;
}

export async function nukeAll(): Promise<number> {
  const cookies = await listAll();
  for (const cookie of cookies) await removeOne(cookie);
  return cookies.length;
}

function toEditable(c: chrome.cookies.Cookie): EditableCookie {
  return {
    url: cookieScopeUrl({ domain: c.domain, path: c.path, secure: c.secure }),
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    secure: c.secure,
    httpOnly: c.httpOnly,
    sameSite: c.sameSite ?? 'unspecified',
    expirationDate: c.expirationDate,
    storeId: c.storeId,
    hostOnly: c.hostOnly,
    session: c.session,
  };
}
