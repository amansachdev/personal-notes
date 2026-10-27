import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  CLIPBOARD_DOC_ID,
  createDataClipboard,
  parseClipboardItems,
  serializeClipboardItems,
} from './clipboard.js';
import { createRichEditor } from './editor.js';
import { configured, db } from './firebase.js';
import { escapeHtml } from './markdown.js';
import './style.css';

const root = document.querySelector('#app');
const tabsCollection = () => collection(db, 'notepadTabs');
const tabRef = (id) => doc(db, 'notepadTabs', id);

let tabs = [];
let activeTabId = null;
let seedInProgress = false;
let clipboardDocExists = false;
let clipboardDirty = false;
const dirtyTabs = new Set();
const saveTimers = new Map();

function showSetup() {
  root.innerHTML = `<main class="center"><div class="brand"><span class="mark">n</span> notepad</div><section class="card"><h1>Set up your shared notes.</h1><p>Add the Firebase web app configuration to the repository Actions secrets to enable syncing.</p><a class="button" href="https://github.com/amansachdev/personal-notes#setup" target="_blank" rel="noreferrer">Open setup guide</a></section></main>`;
}

function startApp() {
  root.innerHTML = `<main class="notepad">
    <header>
      <div class="brand"><span class="mark">n</span> notepad</div>
      <div class="header-right">
        <div class="sync" aria-live="polite"><i></i><span id="status">Loading notes…</span></div>
        <button id="toggle-data-panel" class="data-toggle-btn" type="button" title="Toggle persistent Data Clipboard" aria-expanded="true">
          <span class="data-toggle-icon">📋</span>
          <span>Data</span>
          <b id="data-count-badge" class="data-badge">0</b>
        </button>
      </div>
    </header>
    <div class="workspace">
      <section class="notes-pane">
        <div class="tab-row"><nav class="tab-list" id="tab-list" role="tablist" aria-label="Notes"></nav><button id="add-tab" class="add-tab" type="button" title="Create a new tab">＋ <span>New tab</span></button></div>
        <div class="format-toolbar" id="format-toolbar" role="toolbar" aria-label="Text formatting">
          <div class="toolbar-group">
            <button type="button" class="tool-btn" data-cmd="h1" title="Heading 1 (# + space)">H1</button>
            <button type="button" class="tool-btn" data-cmd="h2" title="Heading 2 (## + space)">H2</button>
            <button type="button" class="tool-btn" data-cmd="h3" title="Heading 3 (### + space)">H3</button>
          </div>
          <span class="toolbar-divider" aria-hidden="true"></span>
          <div class="toolbar-group">
            <button type="button" class="tool-btn tool-bold" data-cmd="bold" title="Bold (⌘/Ctrl+B or **text**)">B</button>
            <button type="button" class="tool-btn tool-italic" data-cmd="italic" title="Italic (⌘/Ctrl+I or *text*)">I</button>
            <button type="button" class="tool-btn tool-strike" data-cmd="strikeThrough" title="Strikethrough (⌘/Ctrl+Shift+X or ~~text~~)">S</button>
            <button type="button" class="tool-btn tool-mono" data-cmd="inlineCode" title="Inline code (⌘/Ctrl+E or \`code\`)">&lt;/&gt;</button>
          </div>
          <span class="toolbar-divider" aria-hidden="true"></span>
          <div class="toolbar-group">
            <button type="button" class="tool-btn" data-cmd="taskList" title="Checklist (- [ ] + space)">☑ <span>Task</span></button>
            <button type="button" class="tool-btn" data-cmd="ul" title="Bullet list (- + space)">• <span>List</span></button>
            <button type="button" class="tool-btn" data-cmd="ol" title="Numbered list (1. + space)">1. <span>List</span></button>
          </div>
          <span class="toolbar-divider" aria-hidden="true"></span>
          <div class="toolbar-group">
            <button type="button" class="tool-btn" data-cmd="blockquote" title="Quote (> + space)">❝ <span>Quote</span></button>
            <button type="button" class="tool-btn tool-mono" data-cmd="codeBlock" title="Code block (\`\`\` + space)">{ } <span>Code</span></button>
          </div>
        </div>
        <div id="note" class="note-editor" contenteditable="false" role="textbox" aria-multiline="true" aria-label="Note text" data-placeholder="Start typing or paste Markdown here… (try # Heading, - [ ] Task, **bold**)" spellcheck="true" data-empty="true" data-disabled="true"></div>
      </section>
      <aside id="data-panel" class="data-panel open" aria-label="Persistent Data Clipboard">
        <div class="data-panel-header">
          <div>
            <h2 class="data-panel-title">Data Clipboard</h2>
            <p class="data-panel-subtitle">Click any block to copy instantly</p>
          </div>
          <div class="data-panel-header-actions">
            <button id="add-data-btn" class="add-data-btn" type="button" title="Add new clipboard item">＋ Add item</button>
            <button id="close-data-panel" class="close-data-btn" type="button" title="Hide Data panel" aria-label="Hide Data panel">×</button>
          </div>
        </div>
        <div class="data-controls">
          <input id="data-search" class="data-search" type="search" placeholder="Filter links, addresses, text…" autocomplete="off" />
          <div id="data-filters" class="data-filters"></div>
        </div>
        <div id="data-list" class="data-list"></div>
      </aside>
    </div>
    <footer><span>Anyone with this link can view and edit these notes · Markdown &amp; Data Clipboard synced</span><span id="count"></span></footer>
  </main>
  <dialog id="rename-dialog" class="rename-dialog">
    <form id="rename-form">
      <label for="rename-input">Name this tab</label>
      <input id="rename-input" name="title" maxlength="80" autocomplete="off" required />
      <div class="dialog-actions"><button class="cancel-button" type="button" id="cancel-rename">Cancel</button><button class="button" type="submit">Save name</button></div>
    </form>
  </dialog>
  <dialog id="data-dialog" class="rename-dialog data-dialog">
    <form id="data-form">
      <label id="data-dialog-title">Add to Data Clipboard</label>
      <div class="field-group">
        <span class="field-label">Category</span>
        <div id="data-category-chips" class="category-chips"></div>
      </div>
      <div class="field-group">
        <label class="field-label" for="data-label-input">Label</label>
        <input id="data-label-input" name="label" maxlength="60" autocomplete="off" placeholder="e.g. LinkedIn Profile, Home Address" required />
      </div>
      <div class="field-group">
        <label class="field-label" for="data-value-input">Content to copy</label>
        <textarea id="data-value-input" name="value" rows="3" placeholder="Paste URL, address, or text…" required></textarea>
      </div>
      <div class="dialog-actions">
        <button class="cancel-button" type="button" id="cancel-data-dialog">Cancel</button>
        <button class="button" type="submit">Save item</button>
      </div>
    </form>
  </dialog>`;

  const editorEl = document.querySelector('#note');
  const toolbarEl = document.querySelector('#format-toolbar');
  const tabList = document.querySelector('#tab-list');
  const status = document.querySelector('#status');
  const count = document.querySelector('#count');
  const renameDialog = document.querySelector('#rename-dialog');
  const renameInput = document.querySelector('#rename-input');
  let renamingTabId = null;

  function setStatus(message, state = '') {
    status.textContent = message;
    status.dataset.state = state;
  }

  function activeTab() {
    return tabs.find((tab) => tab.id === activeTabId) || null;
  }

  async function persistClipboardToFirestore(items) {
    const serialized = serializeClipboardItems(items);
    localStorage.setItem('notepad_clipboard_backup', serialized);
    clipboardDirty = true;
    setStatus('Saving clipboard…');
    try {
      if (clipboardDocExists) {
        await updateDoc(tabRef(CLIPBOARD_DOC_ID), {
          text: serialized,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(tabRef(CLIPBOARD_DOC_ID), {
          title: CLIPBOARD_DOC_ID,
          text: serialized,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        clipboardDocExists = true;
      }
      clipboardDirty = false;
      setStatus('All changes saved');
    } catch (error) {
      clipboardDirty = false;
      setStatus('Could not sync clipboard', 'error');
      console.error(error);
    }
  }

  const dataClipboard = createDataClipboard({
    panel: document.querySelector('#data-panel'),
    toggleBtn: document.querySelector('#toggle-data-panel'),
    countBadge: document.querySelector('#data-count-badge'),
    dialog: document.querySelector('#data-dialog'),
    onStatusChange(message, state = '') {
      setStatus(message, state);
    },
    async onSaveItems(nextItems) {
      await persistClipboardToFirestore(nextItems);
    },
  });

  // Load cached clipboard items immediately while Firestore connects
  const cachedClipboard = localStorage.getItem('notepad_clipboard_backup');
  if (cachedClipboard) {
    dataClipboard.setItems(parseClipboardItems(cachedClipboard));
  }

  const richEditor = createRichEditor({
    editor: editorEl,
    toolbar: toolbarEl,
    onChange(serializedHtml) {
      const tab = activeTab();
      if (!tab) return;
      tab.text = serializedHtml;
      dirtyTabs.add(tab.id);
      setStatus('Saving…');
      updateCount();
      clearTimeout(saveTimers.get(tab.id));
      saveTimers.set(tab.id, setTimeout(() => saveTab(tab.id), 500));
    },
  });

  function updateCount() {
    count.textContent = `${richEditor.getCharacterCount().toLocaleString()} characters`;
  }

  function syncEditor(force = false) {
    const tab = activeTab();
    richEditor.setDisabled(!tab);
    if (!tab) {
      richEditor.setValue('');
      count.textContent = '';
      return;
    }
    const incomingText = tab.text || '';
    if (force) {
      if (richEditor.isFocused() && richEditor.getValue() === incomingText) {
        updateCount();
        return;
      }
      richEditor.setValue(incomingText);
      updateCount();
    } else if (!dirtyTabs.has(tab.id) && !richEditor.isFocused()) {
      richEditor.setValue(incomingText);
      updateCount();
    }
  }

  function renderTabs() {
    tabList.innerHTML = tabs.map((tab) => {
      const selected = tab.id === activeTabId;
      return `<div class="tab ${selected ? 'active' : ''}" role="presentation">
        <button class="tab-select" type="button" role="tab" aria-selected="${selected}" aria-controls="note" data-action="select" data-id="${tab.id}" title="${escapeHtml(tab.title)}">${escapeHtml(tab.title || 'Untitled')}</button>
        <button class="tab-action rename-tab" type="button" data-action="rename" data-id="${tab.id}" aria-label="Rename ${escapeHtml(tab.title || 'tab')}" title="Rename tab">✎</button>
        <button class="tab-action delete-tab" type="button" data-id="${tab.id}" data-action="delete" aria-label="Delete ${escapeHtml(tab.title || 'tab')}" title="Delete tab">×</button>
      </div>`;
    }).join('');
    tabList.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  async function createTab(title = `Note ${tabs.length + 1}`, text = '') {
    const newTab = {
      title,
      text,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const result = await addDoc(tabsCollection(), newTab);
    activeTabId = result.id;
    setStatus('New tab created');
    return result.id;
  }

  async function saveTab(id) {
    const tab = tabs.find((item) => item.id === id);
    if (!tab) return;
    try {
      await updateDoc(tabRef(id), { text: tab.text, updatedAt: serverTimestamp() });
      dirtyTabs.delete(id);
      if (activeTabId === id) setStatus('All changes saved');
    } catch (error) {
      if (activeTabId === id) setStatus('Could not save', 'error');
      console.error(error);
    }
  }

  async function renameTab(id) {
    const tab = tabs.find((item) => item.id === id);
    if (!tab) return;
    renamingTabId = id;
    renameInput.value = tab.title || '';
    renameDialog.showModal();
    renameInput.focus();
    renameInput.select();
  }

  async function deleteTab(id) {
    const tab = tabs.find((item) => item.id === id);
    if (!tab || !window.confirm(`Delete “${tab.title || 'Untitled'}”? This cannot be undone.`)) return;
    clearTimeout(saveTimers.get(id));
    dirtyTabs.delete(id);

    try {
      if (tabs.length === 1) {
        await createTab('Note 1');
        renderTabs();
        syncEditor(true);
      } else if (activeTabId === id) {
        activeTabId = tabs.find((item) => item.id !== id)?.id || null;
        renderTabs();
        syncEditor(true);
      }
      await deleteDoc(tabRef(id));
      setStatus('Tab deleted');
    } catch (error) {
      setStatus('Could not delete tab', 'error');
      console.error(error);
    }
  }

  tabList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action, id } = button.dataset;
    if (action === 'select') {
      activeTabId = id;
      renderTabs();
      syncEditor(true);
      setStatus(dirtyTabs.has(id) ? 'Saving…' : 'All changes saved');
    } else if (action === 'rename') {
      renameTab(id);
    } else if (action === 'delete') {
      deleteTab(id);
    }
  });

  document.querySelector('#add-tab').addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    try {
      await createTab();
      renderTabs();
      syncEditor(true);
      richEditor.focus();
    } catch (error) {
      setStatus('Could not create tab', 'error');
      console.error(error);
    } finally {
      event.currentTarget.disabled = false;
    }
  });

  document.querySelector('#rename-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = renamingTabId;
    const title = renameInput.value.trim();
    if (!id || !title) return;
    try {
      await updateDoc(tabRef(id), { title, updatedAt: serverTimestamp() });
      renameDialog.close();
      setStatus('Tab renamed');
    } catch (error) {
      setStatus('Could not rename tab', 'error');
      console.error(error);
    }
  });
  document.querySelector('#cancel-rename').addEventListener('click', () => renameDialog.close());

  const tabsQuery = query(tabsCollection(), orderBy('createdAt', 'asc'));
  onSnapshot(tabsQuery, async (snapshot) => {
    const allDocs = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    const clipboardDoc = allDocs.find(
      (item) => item.id === CLIPBOARD_DOC_ID || item.title === CLIPBOARD_DOC_ID,
    );
    const noteDocs = allDocs.filter(
      (item) => item.id !== CLIPBOARD_DOC_ID && item.title !== CLIPBOARD_DOC_ID,
    );

    clipboardDocExists = Boolean(clipboardDoc);

    if (!clipboardDirty) {
      const remoteItems = clipboardDoc ? parseClipboardItems(clipboardDoc.text) : [];
      const localItems = parseClipboardItems(localStorage.getItem('notepad_clipboard_backup') || '');
      const migrated = localStorage.getItem('notepad_clipboard_migrated_v2') === 'true';

      // One-time merge of any previously unsynced local items into Firestore
      if (!migrated && localItems.length > 0) {
        localStorage.setItem('notepad_clipboard_migrated_v2', 'true');
        const remoteIds = new Set(remoteItems.map((item) => item.id));
        const unsyncedLocal = localItems.filter((item) => !remoteIds.has(item.id));
        if (unsyncedLocal.length > 0) {
          const merged = [...unsyncedLocal, ...remoteItems];
          dataClipboard.setItems(merged);
          persistClipboardToFirestore(merged);
        } else {
          dataClipboard.setItems(remoteItems);
          localStorage.setItem('notepad_clipboard_backup', serializeClipboardItems(remoteItems));
        }
      } else {
        localStorage.setItem('notepad_clipboard_migrated_v2', 'true');
        dataClipboard.setItems(remoteItems);
        localStorage.setItem('notepad_clipboard_backup', serializeClipboardItems(remoteItems));
      }
    }

    if (noteDocs.length === 0) {
      if (!seedInProgress) {
        seedInProgress = true;
        try {
          await setDoc(tabRef('first'), {
            title: 'Note 1', text: '', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          });
        } catch (error) {
          setStatus('Could not create your first tab', 'error');
          console.error(error);
        } finally {
          seedInProgress = false;
        }
      }
      return;
    }

    tabs = noteDocs;
    if (!activeTabId || !tabs.some((tab) => tab.id === activeTabId)) {
      activeTabId = tabs[0].id;
      syncEditor(true);
    } else if (!dirtyTabs.has(activeTabId)) {
      syncEditor(true);
    }
    renderTabs();
    richEditor.setDisabled(false);
    if (!dirtyTabs.has(activeTabId) && !clipboardDirty) setStatus('All changes saved');
  }, (error) => {
    setStatus('Sync unavailable', 'error');
    console.error(error);
  });
}

if (!configured) showSetup();
else startApp();
