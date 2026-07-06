import { getSettings, patchSettings } from '../../shared/storage';

export async function renderTabCleanerOptionsPanel(featureEnabled: boolean): Promise<HTMLElement> {
  const settings = await getSettings();
  const tc = settings.tabCleaner;

  const root = document.createElement('section');
  root.className = 'tc-panel';

  const thresholdHeader = document.createElement('h3');
  thresholdHeader.className = 'subheader';
  thresholdHeader.textContent = 'Inactivity threshold';
  const thresholdRow = document.createElement('div');
  thresholdRow.className = 'range-row';
  const range = document.createElement('input');
  range.type = 'range';
  range.min = '5';
  range.max = '240';
  range.step = '5';
  range.value = String(tc.thresholdMinutes);
  range.disabled = !featureEnabled;
  const readout = document.createElement('output');
  readout.className = 'range-readout';
  readout.textContent = `${tc.thresholdMinutes} min`;
  range.addEventListener('input', () => {
    readout.textContent = `${range.value} min`;
  });
  range.addEventListener('change', () => {
    void patchSettings({
      tabCleaner: { thresholdMinutes: Number.parseInt(range.value, 10) },
    });
  });
  thresholdRow.append(range, readout);

  const exclusionsHeader = document.createElement('h3');
  exclusionsHeader.className = 'subheader';
  exclusionsHeader.textContent = 'Auto-exclude';
  const exclusionList = document.createElement('div');
  exclusionList.className = 'exclusion-list';
  const exclusions: Array<{ key: keyof typeof tc; label: string }> = [
    { key: 'excludePinned', label: 'Pinned tabs' },
    { key: 'excludeAudible', label: 'Tabs playing audio' },
    { key: 'excludeDirtyInput', label: 'Tabs with unsaved form input' },
  ];
  for (const { key, label } of exclusions) {
    const row = document.createElement('label');
    row.className = 'site-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = tc[key] as boolean;
    cb.disabled = !featureEnabled;
    cb.addEventListener('change', () => {
      void patchSettings({ tabCleaner: { [key]: cb.checked } });
    });
    const text = document.createElement('span');
    text.textContent = label;
    row.append(cb, text);
    exclusionList.append(row);
  }

  const allowlistHeader = document.createElement('h3');
  allowlistHeader.className = 'subheader';
  allowlistHeader.textContent = 'Host allowlist';
  const allowlistHelp = document.createElement('p');
  allowlistHelp.className = 'muted-note';
  allowlistHelp.textContent =
    'One hostname per line. Use *.example.com to match all subdomains. Matches are never auto-closed.';
  const allowlistArea = document.createElement('textarea');
  allowlistArea.className = 'allowlist-textarea';
  allowlistArea.rows = 6;
  allowlistArea.value = tc.allowlist.join('\n');
  allowlistArea.disabled = !featureEnabled;
  allowlistArea.placeholder = 'mail.google.com\n*.figma.com';
  allowlistArea.addEventListener('blur', () => {
    const next = allowlistArea.value
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    void patchSettings({ tabCleaner: { allowlist: next } });
  });

  const activeNote = document.createElement('p');
  activeNote.className = 'muted-note';
  activeNote.textContent =
    'The currently focused tab in each window is always preserved, regardless of exclusions.';

  root.append(
    thresholdHeader,
    thresholdRow,
    exclusionsHeader,
    exclusionList,
    allowlistHeader,
    allowlistHelp,
    allowlistArea,
    activeNote,
  );
  return root;
}
