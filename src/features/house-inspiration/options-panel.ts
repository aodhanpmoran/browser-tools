export function renderHouseInspirationOptionsPanel(): HTMLElement {
  const root = document.createElement('section');
  const note = document.createElement('p');
  note.className = 'muted-note';
  note.textContent =
    'Right-click an image, link, selected text or page and choose "Add to House Inspiration". A Claude chat starts in Orca and adds it to the house inspiration page. Needs the Mac helper in ~/.agents/tools/house-inspo-chrome.';
  root.append(note);
  return root;
}
