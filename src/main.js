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
const dirtyTabs = new Set();
const saveTimers = new Map();

function showSetup() {
  root.innerHTML = `<main class="center"><div class="brand"><span class="mark">n</span> notepad</div><section class="card"><h1>Set up your shared notes.</h1><p>Add the Firebase web app configuration to the repository Actions secrets to enable syncing.</p><a class="button" href="https://github.com/amansachdev/personal-notes#setup" target="_blank" rel="noreferrer">Open setup guide</a></section></main>`;
}

function startApp() {
  root.innerHTML = `<main class="notepad">
    <header><div class="brand"><span class="mark">n</span> notepad</div><div class="sync" aria-live="polite"><i></i><span id="status">Loading notes…</span></div></header>
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
    <footer><span>Anyone with this link can view and edit these notes · Markdown paste &amp; shortcuts supported</span><span id="count"></span></footer>
  </main>
  <dialog id="rename-dialog" class="rename-dialog">
    <form id="rename-form">
      <label for="rename-input">Name this tab</label>
      <input id="rename-input" name="title" maxlength="80" autocomplete="off" required />
      <div class="dialog-actions"><button class="cancel-button" type="button" id="cancel-rename">Cancel</button><button class="button" type="submit">Save name</button></div>
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
        <button class="tab-action delete-tab" type="button" data-action="delete" data-id="${tab.id}" aria-label="Delete ${escapeHtml(tab.title || 'tab')}" title="Delete tab">×</button>
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
    if (snapshot.empty) {
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

    tabs = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    if (!activeTabId || !tabs.some((tab) => tab.id === activeTabId)) {
      activeTabId = tabs[0].id;
      syncEditor(true);
    } else if (!dirtyTabs.has(activeTabId)) {
      syncEditor(true);
    }
    renderTabs();
    richEditor.setDisabled(false);
    if (!dirtyTabs.has(activeTabId)) setStatus('All changes saved');
  }, (error) => {
    setStatus('Sync unavailable', 'error');
    console.error(error);
  });
}

if (!configured) showSetup();
else startApp();
