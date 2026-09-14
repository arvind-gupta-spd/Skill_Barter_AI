
import {
  auth, db, appId,
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  doc, getDoc, setDoc, collection, onSnapshot, query, orderBy, serverTimestamp
} from './firebase.js';
import { state } from './state.js';
import { defaultAvatarFor, isValidEmail } from './utils.js';
import { renderModal, closeModal } from './modal.js';
import { attachDataListeners, detachDataListeners } from './data.js';
import { renderApp, renderNavbar } from './layout.js';

export function requireAuth() {
  if (!state.currentUser) { showAuthModal('login'); return false; }
  return true;
}

onAuthStateChanged(auth, async (user) => {
  detachDataListeners();
  state.allSkills = [];
  state.allWorkshops = [];
  state.notifications = [];

  if (user) {
    const userDocRef = doc(db, `/artifacts/${appId}/users/${user.uid}`);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      state.currentUser = { uid: user.uid, ...userDocSnap.data() };
      if (!state.currentUser.avatarUrl) state.currentUser.avatarUrl = user.photoURL || defaultAvatarFor();
    } else {
      const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'User');
      state.currentUser = {
        uid: user.uid, email: user.email, displayName,
        isAnonymous: user.isAnonymous, avatarUrl: user.photoURL || defaultAvatarFor()
      };
      try {
        await setDoc(userDocRef, {
          uid: user.uid,
          email: user.email || '',
          displayName,
          avatarUrl: state.currentUser.avatarUrl,
          createdAt: serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.warn('Could not create user doc on auth change', err);
      }
    }

    attachDataListeners();

    const notifsCollection = collection(db, `/artifacts/${appId}/users/${user.uid}/notifications`);
    state.unsubNotifications = onSnapshot(query(notifsCollection, orderBy('timestamp', 'desc')), (snap) => {
      state.notifications = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderNavbar();
    }, (err) => console.error('notifications listener error', err));
  } else {
    state.currentUser = null;
  }

  renderApp();
});

export function showAuthModal(mode = 'login') {
  renderModal(`
    <div class="p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-bold">${mode === 'signup' ? 'Create an account' : 'Welcome back'}</h2>
        <div class="text-sm text-gray-500">
          <a href="#" id="switch-auth-mode" class="text-indigo-600 underline">${mode === 'signup' ? 'Have an account? Log in' : 'No account? Sign up'}</a>
        </div>
      </div>
      <div id="auth-error" class="text-sm text-red-500 mb-3"></div>

      <form id="login-form" class="${mode === 'login' ? '' : 'hidden'} space-y-3">
        <input name="email" type="email" placeholder="Email" required class="w-full p-2 border rounded" />
        <input name="password" type="password" placeholder="Password" required class="w-full p-2 border rounded" />
        <div class="flex justify-end">
          <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded">Log in</button>
        </div>
      </form>

      <form id="signup-form" class="${mode === 'signup' ? '' : 'hidden'} space-y-3">
        <input name="displayName" type="text" placeholder="Display name (optional)" class="w-full p-2 border rounded" />
        <input name="email" type="email" placeholder="Email" required class="w-full p-2 border rounded" />
        <input name="password" type="password" placeholder="Password (min 6 chars)" required class="w-full p-2 border rounded" />
        <input name="passwordConfirm" type="password" placeholder="Confirm password" required class="w-full p-2 border rounded" />
        <div class="flex justify-end">
          <button type="submit" class="px-4 py-2 bg-green-600 text-white rounded">Sign up</button>
        </div>
      </form>
    </div>
  `);

  const switchLink = document.getElementById('switch-auth-mode');
  if (switchLink) {
    switchLink.addEventListener('click', (e) => {
      e.preventDefault();
      const loginForm = document.getElementById('login-form');
      const signupForm = document.getElementById('signup-form');
      const err = document.getElementById('auth-error');
      const showingLogin = loginForm.classList.contains('hidden');
      loginForm.classList.toggle('hidden', !showingLogin);
      signupForm.classList.toggle('hidden', showingLogin);
      if (err) err.textContent = '';
    });
  }

  const errEl = document.getElementById('auth-error');

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      errEl.textContent = '';
      if (!isValidEmail(data.email)) {
        errEl.textContent = 'Please enter a valid email address.';
        return;
      }
      try {
        await signInWithEmailAndPassword(auth, data.email.trim(), data.password);
        closeModal();
      } catch (err) {
        console.error('login error', err);
        errEl.textContent = (err && err.message) ? err.message : 'Login failed';
      }
    });
  }

  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      errEl.textContent = '';
      if (!data.email || !data.password || !data.passwordConfirm) {
        errEl.textContent = 'Please fill required fields.';
        return;
      }
      if (!isValidEmail(data.email)) {
        errEl.textContent = 'Please enter a valid email address.';
        return;
      }
      if (data.password.length < 6) {
        errEl.textContent = 'Password must be at least 6 characters.';
        return;
      }
      if (data.password !== data.passwordConfirm) {
        errEl.textContent = 'Passwords do not match.';
        return;
      }
      try {
        const cred = await createUserWithEmailAndPassword(auth, data.email.trim(), data.password);
        const user = cred.user;
        const displayName = (data.displayName && data.displayName.trim()) || (user.email ? user.email.split('@')[0] : 'User');
        await setDoc(doc(db, `/artifacts/${appId}/users/${user.uid}`), {
          uid: user.uid,
          email: user.email || '',
          displayName,
          avatarUrl: defaultAvatarFor(),
          createdAt: serverTimestamp()
        }, { merge: true });
        closeModal();
      } catch (err) {
        console.error('signup error', err);
        errEl.textContent = (err && err.message) ? err.message : 'Signup failed';
      }
    });
  }
}
