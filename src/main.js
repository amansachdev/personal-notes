import { marked } from 'marked';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query,
  serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { auth, configured, db, googleProvider } from './firebase.js';
import './style.css';

const app = document.querySelector('#app');
let user = null;
let notes = [];
let selectedId = null;
let stopNotes = null;
let saveTimer;
let saving = false;
let searchText = '';

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

function shell(content) {
  app.innerHTML = content;
}

function showSetup() {
  shell(`<main class="setup"><div class="brand"><span class="brand-mark">n</span> notes</div><div class="setup-card"><span class="eyebrow">A quiet place to think</span><h1>Your notes, wherever you are.</h1><p>Connect a free Firebase project to turn on private, cross-device sync. Your notes are stored under your Google account and are never part of this public code repository.</p><a class="button primary" href="https://github.com/amansachdev/personal-notes#setup" target="_blank" rel="noreferrer">See the quick setup <span>↗</span></a></div><footer>Private by default · Syncs securely with Firebase</footer></main>`);
}

function showLogin() {
  shell(`<main class="setup"><div class="brand"><span class="brand-mark">n</span> notes</div><div class="setup-card"><span class="eyebrow">A quiet place to think</span><h1>Your notes, wherever you are.</h1><p>Sign in with Google to open your private notebook. Your notes sync automatically between devices.</p><button class="button primary" id="login">Continue with Google <span>→</span></button></div><footer>Private by default · Synced across your devices</footer></main>`);
  document.querySelector('#login').addEventListener('click', async () => {
    const button = document.querySelector('#login');
    button.disabled = true;
    button.innerHTML = 'Opening Google…';
    try { await signInWithPopup(auth, googleProvider); }
    catch (error) { button.disabled = false; button.innerHTML = 'Continue with Google <span>→</span>'; alert(`Sign in failed: ${error.message}`); }
  });
}

function currentNote() { return notes.find((note) => note.id === selectedId) || null; }

function visibleNotes() {
  const needle = searchText.trim().toLowerCase();
  return notes.filter((note) => !needle || `${note.title}\n${note.body}`.toLowerCase().includes(needle));
}

function dateLabel(note) {
  const value = note.updatedAt?.toDate?.() || (note.updatedAt ? new Date(note.updatedAt) : null);
  if (!value) return 'Just now';
  const today = new Date();
  if (value.toDateString() === today.toDateString()) return value.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return value.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function wordCount(text = '') { return text.trim() ? `${text.trim().split(/\s+/).length} words` : '0 words'; }

function render() {
  const active = currentNote();
  const items = visibleNotes();
  shell(`<div class="workspace">
    <aside class="sidebar">
      <div class="side-top"><div class="brand"><span class="brand-mark">n</span> notes</div><button class="new-button" id="new-note">＋ New</button></div>
      <label class="search"><span>⌕</span><input id="search" placeholder="Search notes" value="${escapeHtml(searchText)}" aria-label="Search notes"><kbd>⌘ K</kbd></label>
      <div class="list-label">YOUR NOTES <span>${notes.length}</span></div>
      <div class="note-list">${items.length ? items.map((note) => `<button class="note-item ${note.id === selectedId ? 'active' : ''}" data-id="${escapeHtml(note.id)}"><span class="note-item-title">${escapeHtml(note.title || 'Untitled')}</span><span class="note-item-date">${dateLabel(note)}</span><span class="note-item-preview">${escapeHtml((note.body || 'No additional text').replace(/\s+/g, ' ').slice(0, 66))}</span></button>`).join('') : `<div class="empty-list">${searchText ? 'No notes match your search.' : 'Your notebook is empty. Start with a new note.'}</div>`}</div>
      <div class="account"><div class="avatar">${user.photoURL ? `<img src="${escapeHtml(user.photoURL)}" alt="">` : escapeHtml((user.displayName || user.email || 'A')[0].toUpperCase())}</div><div class="account-details"><strong>${escapeHtml(user.displayName || 'Your account')}</strong><span>${escapeHtml(user.email || '')}</span></div><button id="logout" class="icon-button logout" title="Sign out" aria-label="Sign out">↗</button></div>
    </aside>
    <main class="editor-area"><header class="editor-top"><div class="crumb">My notebook <span>/</span> ${active ? escapeHtml(active.title || 'Untitled') : 'Welcome'}</div><div class="sync-state"><i class="sync-dot"></i><span id="save-state">${saving ? 'Saving…' : 'All changes saved'}</span><button id="delete-note" class="icon-button delete ${active ? '' : 'hidden'}" title="Delete note" aria-label="Delete note">⌫</button></div></header>
      ${active ? `<article class="editor"><input id="title" class="title-input" maxlength="160" placeholder="Untitled" value="${escapeHtml(active.title)}" aria-label="Note title"><textarea id="body" class="body-input" placeholder="Start typing…" aria-label="Note body">${escapeHtml(active.body)}</textarea><div id="preview" class="preview markdown-body"></div><footer class="editor-footer"><span id="word-count">${wordCount(active.body)}</span><button id="toggle-preview" class="preview-toggle">Preview <span>↗</span></button></footer></article>` : `<section class="welcome"><div class="welcome-symbol">✳</div><span class="eyebrow">YOUR PERSONAL NOTEBOOK</span><h1>A little space<br>for your thoughts.</h1><p>Everything you write is yours. It stays in your account and follows you from device to device.</p><button class="button primary" id="welcome-new">Write a note <span>→</span></button><div class="welcome-hint"><span>✦</span> Your notes sync automatically as you write</div></section>`}
    </main>
  </div>`);

  document.querySelector('#new-note').addEventListener('click', createNote);
  document.querySelector('#welcome-new')?.addEventListener('click', createNote);
  document.querySelector('#logout').addEventListener('click', () => signOut(auth));
  document.querySelector('#search').addEventListener('input', (event) => { searchText = event.target.value; const position = event.target.selectionStart; render(); const input = document.querySelector('#search'); input.focus(); input.setSelectionRange(position, position); });
  document.querySelectorAll('.note-item').forEach((button) => button.addEventListener('click', () => { selectedId = button.dataset.id; render(); }));
  document.querySelector('#delete-note')?.addEventListener('click', deleteCurrent);
  document.querySelector('#title')?.addEventListener('input', saveCurrent);
  document.querySelector('#body')?.addEventListener('input', saveCurrent);
  document.querySelector('#toggle-preview')?.addEventListener('click', togglePreview);
  document.querySelector('#body')?.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') togglePreview();
  });
  if (active) document.querySelector('#body').focus({ preventScroll: true });
}

function listenToNotes() {
  stopNotes?.();
  const notesQuery = query(collection(db, 'users', user.uid, 'notes'), orderBy('updatedAt', 'desc'));
  stopNotes = onSnapshot(notesQuery, (snapshot) => {
    notes = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    if (!notes.length) { createNote(); return; }
    if (selectedId && !notes.some((note) => note.id === selectedId)) selectedId = null;
    if (!selectedId && notes.length) selectedId = notes[0].id;
    render();
  }, (error) => {
    shell(`<main class="setup"><div class="brand"><span class="brand-mark">n</span> notes</div><div class="setup-card"><span class="eyebrow">One small setup step</span><h1>Couldn’t open your notebook.</h1><p>${escapeHtml(error.message)} Check that Firestore is created and the rules from the setup guide are published.</p><button class="button primary" onclick="location.reload()">Try again</button></div></main>`);
  });
}

async function createNote() {
  const button = document.querySelector('#new-note');
  button.disabled = true;
  try {
    const result = await addDoc(collection(db, 'users', user.uid, 'notes'), { title: '', body: '', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    selectedId = result.id;
  } catch (error) { alert(`Could not create note: ${error.message}`); }
  finally { button.disabled = false; }
}

function saveCurrent() {
  const note = currentNote();
  if (!note) return;
  note.title = document.querySelector('#title').value;
  note.body = document.querySelector('#body').value;
  const count = document.querySelector('#word-count');
  if (count) count.textContent = wordCount(note.body);
  saving = true;
  const state = document.querySelector('#save-state');
  if (state) state.textContent = 'Saving…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await updateDoc(doc(db, 'users', user.uid, 'notes', note.id), { title: note.title, body: note.body, updatedAt: serverTimestamp() });
      saving = false;
      const saveState = document.querySelector('#save-state');
      if (saveState) saveState.textContent = 'All changes saved';
    } catch (error) {
      saving = false;
      const saveState = document.querySelector('#save-state');
      if (saveState) saveState.textContent = 'Couldn’t save';
      console.error(error);
    }
  }, 650);
}

async function deleteCurrent() {
  const note = currentNote();
  if (!note || !confirm(`Delete “${note.title || 'Untitled'}”? This can’t be undone.`)) return;
  clearTimeout(saveTimer);
  try { await deleteDoc(doc(db, 'users', user.uid, 'notes', note.id)); selectedId = null; }
  catch (error) { alert(`Could not delete note: ${error.message}`); }
}

function togglePreview() {
  const editor = document.querySelector('.editor');
  const body = document.querySelector('#body');
  const preview = document.querySelector('#preview');
  if (!editor || !body || !preview) return;
  const active = editor.classList.toggle('show-preview');
  preview.innerHTML = marked.parse(body.value || '*Nothing to preview yet.*', { breaks: true });
  document.querySelector('#toggle-preview').innerHTML = active ? 'Edit note <span>↗</span>' : 'Preview <span>↗</span>';
  document.querySelector('#toggle-preview').classList.toggle('selected', active);
}

document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    document.querySelector('#search')?.focus();
  }
  if ((event.metaKey || event.ctrlKey) && event.key === 'n') {
    event.preventDefault();
    if (user) createNote();
  }
});

if (!configured) showSetup();
else onAuthStateChanged(auth, (nextUser) => {
  user = nextUser;
  if (!user) { stopNotes?.(); notes = []; selectedId = null; showLogin(); }
  else listenToNotes();
});
