export interface AcrMatch {
  title: string;
  artists: string[];
  album?: string;
  externalUrl: string;
}

export interface AcrRawStatus {
  code?: number;
  msg?: string;
  version?: string;
}

export interface AcrRawArtist {
  name?: string;
}

export interface AcrRawAlbum {
  name?: string;
}

export interface AcrRawTrack {
  title?: string;
  artists?: AcrRawArtist[];
  album?: AcrRawAlbum;
}

export interface AcrRawResponse {
  status?: AcrRawStatus;
  metadata?: {
    music?: AcrRawTrack[];
    humming?: AcrRawTrack[];
  };
}

export async function hmacSha1Base64(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  let binary = '';
  const bytes = new Uint8Array(sig);
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function parseAcrResponse(data: AcrRawResponse): AcrMatch {
  const status = data.status;
  if (!status) throw new Error('ACRCloud returned no status');

  if (status.code === 0 && data.metadata) {
    const track = data.metadata.music?.[0] ?? data.metadata.humming?.[0];
    if (track && track.title) {
      return toMatch(track);
    }
    throw new Error('Song recognized but no match found. Try a clearer part of the track.');
  }
  if (status.code === 0) {
    throw new Error('No match found. Try during a clearer part of the song (e.g. chorus).');
  }
  if (status.code === 1001) {
    // ACRCloud code 1001 = "No result". Server processed the audio but nothing
    // in the configured project's bucket matched. NOT a silence indicator.
    throw new Error(
      'No match in ACRCloud. Either the track isn’t in their catalog, or your project’s bucket is the wrong product type — sign up at acrcloud.com and pick an "Audio & Video Recognition → Music" project (not Custom Content or Broadcast Monitoring).',
    );
  }
  if (status.code === 2004) {
    throw new Error('ACRCloud daily quota reached. Try again tomorrow or upgrade the project.');
  }
  if (status.code === 2002) {
    throw new Error('ACRCloud rejected the signature. Double-check your access key + secret.');
  }
  if (status.code === 3003 || status.code === 3000 || status.code === 3001) {
    throw new Error(`ACRCloud couldn’t decode the audio sample (${status.code}): ${status.msg ?? ''}`);
  }
  throw new Error(`ACRCloud ${status.code}: ${status.msg ?? 'Unknown error'}`);
}

function toMatch(track: AcrRawTrack): AcrMatch {
  const title = track.title ?? 'Unknown';
  const artists = (track.artists ?? [])
    .map((a) => (a.name ?? '').trim())
    .filter((s) => s.length > 0);
  const album = track.album?.name?.trim();
  const query = encodeURIComponent(`${title} ${artists.join(' ')}`.trim());
  const externalUrl = `https://www.youtube.com/results?search_query=${query}`;
  const match: AcrMatch = { title, artists, externalUrl };
  if (album) match.album = album;
  return match;
}

export async function identifyBlob(
  blob: Blob,
  host: string,
  key: string,
  secret: string,
): Promise<AcrMatch> {
  if (!key || !secret) throw new Error('ACRCloud credentials not set');
  const timestamp = Math.floor(Date.now() / 1000);
  const stringToSign = `POST\n/v1/identify\n${key}\naudio\n1\n${timestamp}`;
  const signature = await hmacSha1Base64(secret, stringToSign);

  const arrayBuf = await blob.arrayBuffer();
  const form = new FormData();
  form.append('access_key', key);
  form.append('data_type', 'audio');
  form.append('signature_version', '1');
  form.append('signature', signature);
  form.append('timestamp', timestamp.toString());
  form.append('sample_bytes', arrayBuf.byteLength.toString());
  form.append('sample', blob, 'sample.webm');

  const resp = await fetch(`https://${host}/v1/identify`, { method: 'POST', body: form });
  const data = (await resp.json()) as AcrRawResponse;
  return parseAcrResponse(data);
}
