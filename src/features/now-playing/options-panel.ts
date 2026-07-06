import { getSettings, patchSettings } from '../../shared/storage';
import { getSavedTracks, clearSavedTracks } from './history';

export async function renderNowPlayingOptionsPanel(featureEnabled: boolean): Promise<HTMLElement> {
  const settings = await getSettings();
  const { historyCap, acrHost, acrKey, acrSecret, audioCaptureSeconds } = settings.nowPlaying;

  const root = document.createElement('section');
  root.className = 'np-options-panel';

  // Audio identification settings
  const audioHeader = document.createElement('h3');
  audioHeader.className = 'subheader';
  audioHeader.textContent = 'Audio identification (ACRCloud)';

  const makeInput = (
    labelText: string,
    placeholder: string,
    value: string,
    onChange: (v: string) => void,
    inputType: 'text' | 'password' = 'text',
  ): HTMLLabelElement => {
    const label = document.createElement('label');
    label.className = 'np-key-label';
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = inputType;
    input.className = 'np-key-input';
    input.placeholder = placeholder;
    input.value = value;
    input.disabled = !featureEnabled;
    input.addEventListener('change', () => onChange(input.value.trim()));
    label.append(input);
    return label;
  };

  const hostLabel = makeInput(
    'Host',
    'identify-eu-west-1.acrcloud.com',
    acrHost,
    (v) => void patchSettings({ nowPlaying: { acrHost: v || 'identify-eu-west-1.acrcloud.com' } }),
  );
  const keyLabel = makeInput(
    'Access key',
    'Paste your ACRCloud access key',
    acrKey,
    (v) => void patchSettings({ nowPlaying: { acrKey: v } }),
  );
  const secretLabel = makeInput(
    'Access secret',
    'Paste your ACRCloud access secret',
    acrSecret,
    (v) => void patchSettings({ nowPlaying: { acrSecret: v } }),
    'password',
  );

  const keyHelp = document.createElement('p');
  keyHelp.className = 'muted-note';
  keyHelp.innerHTML =
    'Create an Audio Recognition project at <a href="https://www.acrcloud.com/sign-up/" target="_blank" rel="noopener">acrcloud.com/sign-up</a>. The free trial runs for 14 days and caps at 500 recognitions per day. Copy the host, access key, and access secret from the project into the fields above.';

  const secHeader = document.createElement('h4');
  secHeader.className = 'subheader';
  secHeader.textContent = 'Capture duration';
  const secRow = document.createElement('div');
  secRow.className = 'range-row';
  const secRange = document.createElement('input');
  secRange.type = 'range';
  secRange.min = '5';
  secRange.max = '20';
  secRange.step = '1';
  secRange.value = String(audioCaptureSeconds);
  secRange.disabled = !featureEnabled;
  const secReadout = document.createElement('output');
  secReadout.className = 'range-readout';
  secReadout.textContent = `${audioCaptureSeconds}s`;
  secRange.addEventListener('input', () => {
    secReadout.textContent = `${secRange.value}s`;
  });
  secRange.addEventListener('change', () => {
    void patchSettings({
      nowPlaying: { audioCaptureSeconds: Number.parseInt(secRange.value, 10) },
    });
  });
  secRow.append(secRange, secReadout);

  const secHelp = document.createElement('p');
  secHelp.className = 'muted-note';
  secHelp.textContent =
    'ACRCloud needs ~5–10 s of clean audio. Longer captures slightly improve match rate but block the popup for the duration — closing the popup aborts the identify.';

  const capHeader = document.createElement('h3');
  capHeader.className = 'subheader';
  capHeader.textContent = 'History size';
  const capRow = document.createElement('div');
  capRow.className = 'range-row';
  const range = document.createElement('input');
  range.type = 'range';
  range.min = '20';
  range.max = '1000';
  range.step = '20';
  range.value = String(historyCap);
  range.disabled = !featureEnabled;
  const readout = document.createElement('output');
  readout.className = 'range-readout';
  readout.textContent = String(historyCap);
  range.addEventListener('input', () => {
    readout.textContent = range.value;
  });
  range.addEventListener('change', () => {
    void patchSettings({ nowPlaying: { historyCap: Number.parseInt(range.value, 10) } });
  });
  capRow.append(range, readout);

  const savedHeader = document.createElement('h3');
  savedHeader.className = 'subheader';
  savedHeader.textContent = 'Saved tracks';

  const list = document.createElement('ul');
  list.className = 'np-saved-list';
  const saved = await getSavedTracks();
  if (saved.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted-note';
    empty.textContent = 'No tracks saved yet. Open the popup on a page playing music, then click Save.';
    list.append(empty);
  } else {
    for (const t of saved) {
      const li = document.createElement('li');
      li.className = 'np-saved-row';
      const titleEl = document.createElement('span');
      titleEl.className = 'np-saved-title';
      titleEl.textContent = t.title;
      const artistEl = document.createElement('span');
      artistEl.className = 'np-saved-artist';
      artistEl.textContent = t.artist ? `— ${t.artist}` : '';
      const when = document.createElement('time');
      when.className = 'np-saved-time';
      when.textContent = new Date(t.savedAt).toLocaleString();
      li.append(titleEl, artistEl, when);
      list.append(li);
    }
  }

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'danger-button';
  clearBtn.textContent = 'Clear saved tracks';
  clearBtn.disabled = saved.length === 0;
  clearBtn.addEventListener('click', async () => {
    if (!confirm(`Delete ${saved.length} saved track${saved.length === 1 ? '' : 's'}?`)) return;
    await clearSavedTracks();
  });

  const privacy = document.createElement('p');
  privacy.className = 'muted-note';
  privacy.textContent =
    'Metadata detection (MediaSession / DOM / title) runs entirely in-page with no network calls. Audio identification, when you click “Listen & identify”, captures ~10 s of tab audio and uploads the compressed audio sample to your configured ACRCloud host. No audio is stored by this extension.';

  root.append(
    audioHeader,
    hostLabel,
    keyLabel,
    secretLabel,
    keyHelp,
    secHeader,
    secRow,
    secHelp,
    capHeader,
    capRow,
    savedHeader,
    list,
    clearBtn,
    privacy,
  );
  return root;
}
