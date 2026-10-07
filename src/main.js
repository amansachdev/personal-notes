import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { configured, db } from './firebase.js';
import './style.css';

const root = document.querySelector('#app');
let saveTimer;
let dirty = false;

function showEditor() {
  root.innerHTML = `<main class="notepad"><header><div class="brand"><span class="mark">n</span> notepad</div><div class="right"><span class="sync"><i></i><span id="status">Loading note…</span></span></div></header><textarea id="note" placeholder="Start typing or paste your text here…" aria-label="Shared note" spellcheck="true" disabled></textarea><footer><span>Anyone with this link can view and edit this note</span><span id="count"></span></footer></main>`;
  const textarea = document.querySelector('#note');
  const status = document.querySelector('#status');
  const noteRef = doc(db, 'notes', 'shared');

  onSnapshot(noteRef, (snapshot) => {
    const remoteText = snapshot.exists() ? snapshot.data().text || '' : '';
    if (!dirty || document.activeElement !== textarea) {
      textarea.value = remoteText;
      updateCount();
    }
    textarea.disabled = false;
    status.textContent = dirty ? 'Saving…' : 'All changes saved';
  }, (error) => {
    status.textContent = 'Sync unavailable';
    console.error(error);
  });

  function updateCount() {
    const length = textarea.value.length;
    document.querySelector('#count').textContent = `${length.toLocaleString()} characters`;
  }

  textarea.addEventListener('input', () => {
    dirty = true;
    status.textContent = 'Saving…';
    updateCount();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const text = textarea.value;
      try {
        await setDoc(noteRef, { text, updatedAt: serverTimestamp() }, { merge: true });
        dirty = false;
        status.textContent = 'All changes saved';
      } catch (error) {
        status.textContent = 'Could not save';
        console.error(error);
      }
    }, 500);
  });
}

if (!configured) {
  root.innerHTML = `<main class="center"><div class="brand"><span class="mark">n</span> notepad</div><section class="card"><h1>Set up your shared note.</h1><p>Add the Firebase web app configuration to the repository Actions secrets to enable syncing.</p><a class="button" href="https://github.com/amansachdev/personal-notes#setup" target="_blank" rel="noreferrer">Open setup guide</a></section></main>`;
} else {
  showEditor();
}
