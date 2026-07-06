export function renderVideoSpeedOptionsPanel(): HTMLElement {
  const root = document.createElement('section');
  root.className = 'vsc-panel';

  const subhead = document.createElement('h3');
  subhead.className = 'subheader';
  subhead.textContent = 'Keyboard shortcuts';

  const dl = document.createElement('dl');
  dl.className = 'shortcut-list';
  const shortcuts: Array<[string, string]> = [
    ['S', 'decrease playback speed by 0.1'],
    ['D', 'increase playback speed by 0.1'],
    ['Z', 'rewind 10 seconds'],
    ['X', 'advance 10 seconds'],
    ['R', 'reset speed to 1.0'],
    ['G', 'toggle preferred speed (default 1.8)'],
    ['V', 'show / hide the speed controller overlay'],
  ];
  for (const [key, label] of shortcuts) {
    const dt = document.createElement('dt');
    dt.textContent = key;
    const dd = document.createElement('dd');
    dd.textContent = label;
    dl.append(dt, dd);
  }

  const attribution = document.createElement('p');
  attribution.className = 'muted-note';
  attribution.innerHTML =
    'Vendored from <a href="https://github.com/igrigorik/videospeed" target="_blank" rel="noopener">igrigorik/videospeed</a> (MIT). Advanced configuration is not currently exposed through this UI — see the upstream README if you need to tweak key bindings.';

  root.append(subhead, dl, attribution);
  return root;
}
