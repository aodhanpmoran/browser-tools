import {
  type EditableCookie,
  listAll,
  listForUrl,
  nukeAll,
  nukeSite,
  removeOne,
  updateCookie,
} from './operations';

interface PanelState {
  url: string;
  cookies: EditableCookie[];
  editing: EditableCookie | null;
  draft: EditableCookie | null;
}

export async function renderCookieEditorPanel(
  featureEnabled: boolean,
): Promise<HTMLElement> {
  const root = document.createElement('section');
  root.className = 'cookie-panel';

  if (!featureEnabled) {
    const note = document.createElement('p');
    note.className = 'placeholder';
    note.textContent = 'Enable Cookie Editor above to manage cookies.';
    root.append(note);
    return root;
  }

  const state: PanelState = {
    url: await detectCurrentTabUrl(),
    cookies: [],
    editing: null,
    draft: null,
  };

  const urlRow = document.createElement('div');
  urlRow.className = 'cookie-url-row';
  const label = document.createElement('label');
  label.textContent = 'Site URL';
  label.htmlFor = 'cookie-url-input';
  const input = document.createElement('input');
  input.id = 'cookie-url-input';
  input.type = 'text';
  input.value = state.url;
  input.className = 'cookie-url-input';
  const loadBtn = document.createElement('button');
  loadBtn.type = 'button';
  loadBtn.textContent = 'Load';
  loadBtn.className = 'primary-button';
  urlRow.append(label, input, loadBtn);

  const tableContainer = document.createElement('div');
  tableContainer.className = 'cookie-table-container';

  const siteActions = document.createElement('div');
  siteActions.className = 'cookie-site-actions';
  const nukeSiteBtn = document.createElement('button');
  nukeSiteBtn.type = 'button';
  nukeSiteBtn.className = 'danger-button';
  nukeSiteBtn.textContent = 'Nuke cookies for this site';
  siteActions.append(nukeSiteBtn);

  const danger = document.createElement('details');
  danger.className = 'danger-zone';
  const summary = document.createElement('summary');
  summary.textContent = 'Danger zone';
  const dangerBody = document.createElement('div');
  dangerBody.className = 'danger-body';
  const dangerHeader = document.createElement('h4');
  dangerHeader.textContent = 'Nuke ALL cookies (every site)';
  const dangerHelp = document.createElement('p');
  dangerHelp.className = 'muted-note';
  dangerHelp.textContent =
    "This signs you out of everything and clears session state everywhere. Type 'delete all' to confirm.";
  const confirmInput = document.createElement('input');
  confirmInput.type = 'text';
  confirmInput.placeholder = "type 'delete all'";
  confirmInput.className = 'confirm-input';
  const nukeAllBtn = document.createElement('button');
  nukeAllBtn.type = 'button';
  nukeAllBtn.className = 'danger-button';
  nukeAllBtn.textContent = 'Delete every cookie';
  nukeAllBtn.disabled = true;
  confirmInput.addEventListener('input', () => {
    nukeAllBtn.disabled = confirmInput.value.trim().toLowerCase() !== 'delete all';
  });
  dangerBody.append(dangerHeader, dangerHelp, confirmInput, nukeAllBtn);
  danger.append(summary, dangerBody);

  root.append(urlRow, tableContainer, siteActions, danger);

  loadBtn.addEventListener('click', () => {
    state.url = input.value.trim();
    void reload();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadBtn.click();
  });

  nukeSiteBtn.addEventListener('click', () => {
    const count = state.cookies.length;
    if (count === 0) return;
    if (!confirm(`Delete ${count} cookie${count === 1 ? '' : 's'} for this site?`)) return;
    void nukeSite(state.url).then(reload);
  });

  nukeAllBtn.addEventListener('click', () => {
    if (confirmInput.value.trim().toLowerCase() !== 'delete all') return;
    void nukeAll().then((n) => {
      confirmInput.value = '';
      nukeAllBtn.disabled = true;
      alert(`Deleted ${n} cookies.`);
      return reload();
    });
  });

  async function reload(): Promise<void> {
    nukeSiteBtn.disabled = true;
    state.cookies = state.url ? await listForUrl(state.url) : await listAll();
    nukeSiteBtn.textContent = `Nuke ${state.cookies.length} cookie${state.cookies.length === 1 ? '' : 's'} for this site`;
    nukeSiteBtn.disabled = state.cookies.length === 0;
    state.editing = null;
    state.draft = null;
    renderTable();
  }

  function renderTable(): void {
    tableContainer.replaceChildren();
    if (state.cookies.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted-note';
      empty.textContent = 'No cookies for this URL.';
      tableContainer.append(empty);
      return;
    }

    const table = document.createElement('table');
    table.className = 'cookie-table';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const h of ['Name', 'Value', 'Domain', 'Path', 'Expires', '']) {
      const th = document.createElement('th');
      th.textContent = h;
      headRow.append(th);
    }
    thead.append(headRow);
    table.append(thead);

    const tbody = document.createElement('tbody');
    for (const cookie of state.cookies) {
      const row = document.createElement('tr');
      if (state.editing && cookieKey(state.editing) === cookieKey(cookie)) {
        row.append(...renderEditRow(cookie));
      } else {
        row.append(...renderReadRow(cookie));
      }
      tbody.append(row);
    }
    table.append(tbody);
    tableContainer.append(table);
  }

  function renderReadRow(cookie: EditableCookie): HTMLTableCellElement[] {
    const cells: HTMLTableCellElement[] = [];
    cells.push(tdText(cookie.name));
    cells.push(tdText(truncate(cookie.value, 48), { title: cookie.value }));
    cells.push(tdText(cookie.domain));
    cells.push(tdText(cookie.path));
    cells.push(tdText(formatExpires(cookie)));

    const actions = document.createElement('td');
    actions.className = 'cookie-actions';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'icon-button';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => {
      state.editing = cookie;
      state.draft = { ...cookie };
      renderTable();
    });
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'icon-button danger';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => {
      void removeOne(cookie).then(reload);
    });
    actions.append(editBtn, delBtn);
    cells.push(actions);
    return cells;
  }

  function renderEditRow(cookie: EditableCookie): HTMLTableCellElement[] {
    const draft = state.draft!;
    const cells: HTMLTableCellElement[] = [];

    cells.push(inputCell('name', draft, (v) => (draft.name = v)));
    cells.push(inputCell('value', draft, (v) => (draft.value = v)));
    cells.push(inputCell('domain', draft, (v) => (draft.domain = v)));
    cells.push(inputCell('path', draft, (v) => (draft.path = v)));
    cells.push(
      inputCell('expirationDate' as never, draft, (v) => {
        draft.expirationDate = v ? Number.parseFloat(v) : undefined;
      }, formatExpires(draft)),
    );

    const actions = document.createElement('td');
    actions.className = 'cookie-actions';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'icon-button primary';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => {
      void updateCookie(cookie, { ...draft, url: cookie.url }).then(reload);
    });
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'icon-button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      state.editing = null;
      state.draft = null;
      renderTable();
    });
    actions.append(saveBtn, cancelBtn);
    cells.push(actions);
    return cells;
  }

  await reload();
  return root;
}

function tdText(text: string, attrs: Partial<HTMLTableCellElement> = {}): HTMLTableCellElement {
  const td = document.createElement('td');
  td.textContent = text;
  Object.assign(td, attrs);
  return td;
}

function inputCell<K extends keyof EditableCookie>(
  _key: K,
  draft: EditableCookie,
  onChange: (value: string) => void,
  initialValue?: string,
): HTMLTableCellElement {
  const td = document.createElement('td');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'cookie-edit-input';
  input.value = initialValue ?? String(draft[_key] ?? '');
  input.addEventListener('input', () => onChange(input.value));
  td.append(input);
  return td;
}

function truncate(text: string, n: number): string {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}

function formatExpires(cookie: EditableCookie): string {
  if (cookie.session || cookie.expirationDate === undefined) return 'session';
  const date = new Date(cookie.expirationDate * 1000);
  return date.toISOString().replace('T', ' ').slice(0, 16);
}

function cookieKey(c: EditableCookie): string {
  return `${c.storeId}|${c.domain}|${c.path}|${c.name}`;
}

async function detectCurrentTabUrl(): Promise<string> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.url ?? 'https://example.com/';
}
