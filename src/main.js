import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, configured, db, googleProvider } from './firebase.js';
import './style.css';

const root = document.querySelector('#app');
let user;
let stopSync;
let saveTimer;
let dirty = false;

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

function showSetup() {
  root.innerHTML = `<main class="center"><div class="brand"><span class="mark">n</span> notepad</div><section class="card"><h1>Your notes, on every device.</h1><p>Connect a free Firebase project to enable private syncing. The quick setup guide is in the project README.</p><a class="button" href="https://github.com/amansachdev/personal-notes#setup" target="_blank" rel="noreferrer">Open setup guide</a></section></main>`;
}

function showLogin() {
  root.innerHTML = `<main class="center"><div class="brand"><span class="mark">n</span> notepad</div><section class="card"><h1>Your notes, on every device.</h1><p>Sign in with Google, then paste or type. Your note saves automatically and stays in sync.</p><button class="button" id="login">Continue with Google</button></section><footer>Private to your account</footer></main>`;
  document.querySelector('#login').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Opening Google…';
    try { await signInWithPopup(auth, googleProvider); }
    catch (error) { button.disabled = false; button.textContent = 'Continue with Google'; alert(`Sign in failed: ${error.message}`); }
  });
}

function showEditor() {
  root.innerHTML = `<main class="notepad"><header><div class="brand"><span class="mark">n</span> notepad</div><div class="right"><span class="sync"><i></i><span id="status">Loading your note…</span></span><span class="user">${user.photoURL ? `<img src="${escapeHtml(user.photoURL)}" alt="">` : ''}${escapeHtml(user.displayName || user.email || 'Signed in')}</span><button class="signout" id="signout">Sign out</button></div></header><textarea id="note" placeholder="Start typing or paste your text here…" aria-label="Your note" spellcheck="true" disabled></textarea><footer><span>Saved automatically · Synced across your devices</span><span id="count"></span></footer></main>`;
  const textarea = document.querySelector('#note');
  const status = document.querySelector('#status');
  const noteRef = doc(db, 'notes', user.uid);
  document.querySelector('#signout').addEventListener('click', () => signOut(auth));

  stopSync?.();
  stopSync = onSnapshot(noteRef, (snapshot) => {
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

if (!configured) showSetup();
else onAuthStateChanged(auth, (nextUser) => {
  user = nextUser;
  if (!user) { stopSync?.(); clearTimeout(saveTimer); showLogin(); }
  else showEditor();
});
