import type { NowPlayingSettings } from '../../shared/storage';
import { identifyBlob, type AcrMatch } from './acrcloud';
import type { NowPlaying } from './detect';

export interface IdentifyProgress {
  phase: 'listening' | 'identifying';
  secondsRemaining?: number;
}

export interface IdentifyOk {
  ok: true;
  nowPlaying: NowPlaying;
}

export interface IdentifyErr {
  ok: false;
  error: string;
  needsCreds?: boolean;
}

export type IdentifyResult = IdentifyOk | IdentifyErr;

function captureTabAudio(): Promise<MediaStream> {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.capture({ audio: true, video: false }, (stream) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message ?? 'tabCapture failed'));
        return;
      }
      if (!stream) {
        reject(new Error('No audio stream'));
        return;
      }
      resolve(stream);
    });
  });
}

export async function runAcrIdentify(
  settings: NowPlayingSettings,
  onProgress: (p: IdentifyProgress) => void,
): Promise<IdentifyResult> {
  if (!settings.acrKey || !settings.acrSecret) {
    return {
      ok: false,
      error: 'ACRCloud credentials not set. Add them in Options → Now Playing.',
      needsCreds: true,
    };
  }

  const seconds = Math.max(5, Math.min(30, settings.audioCaptureSeconds || 10));

  let stream: MediaStream;
  try {
    stream = await captureTabAudio();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  if (stream.getAudioTracks().length === 0) {
    for (const t of stream.getTracks()) t.stop();
    return { ok: false, error: 'Captured stream has no audio track. Is the tab actually producing sound?' };
  }

  // Pipe audio back to the output so the user keeps hearing the tab.
  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  source.connect(audioCtx.destination);

  // Measure RMS loudness during capture so we can diagnose silent recordings.
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const rmsBuffer = new Float32Array(analyser.fftSize);
  let peakRms = 0;
  const rmsTimer = setInterval(() => {
    analyser.getFloatTimeDomainData(rmsBuffer);
    let sum = 0;
    for (const v of rmsBuffer) sum += v * v;
    const rms = Math.sqrt(sum / rmsBuffer.length);
    if (rms > peakRms) peakRms = rms;
  }, 100);

  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm';
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const blob = await new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      clearInterval(rmsTimer);
      source.disconnect();
      analyser.disconnect();
      void audioCtx.close();
      for (const t of stream.getTracks()) t.stop();
      resolve(new Blob(chunks, { type: 'audio/webm' }));
    };
    recorder.start();

    let remaining = seconds;
    onProgress({ phase: 'listening', secondsRemaining: remaining });
    const tick = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(tick);
        recorder.stop();
      } else {
        onProgress({ phase: 'listening', secondsRemaining: remaining });
      }
    }, 1000);
  });

  console.log('[now-playing] captured', blob.size, 'bytes, peak RMS', peakRms.toFixed(4));

  // Peak RMS under ~0.005 across a 10 s window is effectively silence.
  if (peakRms < 0.005) {
    return {
      ok: false,
      error:
        `Tab audio was silent (peak level ${peakRms.toFixed(3)}). Check the tab isn't muted, audio is actually playing, and you're not capturing a DRM-protected stream (Spotify web, Apple Music web).`,
    };
  }

  onProgress({ phase: 'identifying' });

  let match: AcrMatch;
  try {
    match = await identifyBlob(blob, settings.acrHost, settings.acrKey, settings.acrSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Append diagnostics so the user can distinguish "silent sample" from "genuine no-match".
    const kb = (blob.size / 1024).toFixed(0);
    return {
      ok: false,
      error: `${msg} (captured ${kb} KB, peak ${peakRms.toFixed(3)})`,
    };
  }

  const nowPlaying: NowPlaying = {
    title: match.title,
    artist: match.artists.join(', '),
    source: 'acrcloud',
    externalUrl: match.externalUrl,
  };
  if (match.album) nowPlaying.album = match.album;

  return { ok: true, nowPlaying };
}
