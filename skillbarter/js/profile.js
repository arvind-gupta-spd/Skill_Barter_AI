import { state } from './state.js';
import { db, storage, appId, doc, setDoc, sRef, uploadBytesResumable, getDownloadURL } from './firebase.js';
import { escapeHtml, defaultAvatarFor } from './utils.js';
import { renderModal, closeModal } from './modal.js';
import { renderSkills, showSkillDetailsModal } from './skills.js';
import { requireAuth } from './auth.js';
import { renderApp } from './layout.js';

export function getProfileHTML(mySkills) {
  const u = state.currentUser;
  return `
    <div class="py-20 bg-gray-50">
      <div class="container mx-auto px-6">
        <div class="text-center mb-6">
          <div class="flex items-center justify-center space-x-6 mb-4">
            <img id="profile-avatar" src="${u?.avatarUrl || defaultAvatarFor()}" class="avatar-lg" alt="avatar">
            <div>
              <h1 class="text-4xl font-bold">${escapeHtml(u.displayName || u.email)}</h1>
              <p class="text-gray-600 mt-1">${escapeHtml(u.email || '')}</p>
              <p class="text-sm text-gray-500 mt-2">${escapeHtml(u.bio || '')}</p>
              <div class="mt-4">
                <button id="edit-profile-btn" class="bg-indigo-600 text-white px-4 py-2 rounded mr-2">Edit Profile</button>
                <input id="avatar-file-input" type="file" accept="image/*" class="hidden">
                <button id="choose-avatar-btn" class="bg-gray-200 text-gray-800 px-3 py-2 rounded mr-2">Choose Avatar</button>
                <button id="upload-avatar-btn" class="bg-green-500 text-white px-3 py-2 rounded">Upload</button>
                <span id="avatar-status" class="text-sm ml-3"></span>
                <div id="avatar-progress-container" class="w-full max-w-md mt-3 hidden">
                  <div class="w-full bg-gray-200 rounded h-3 overflow-hidden">
                    <div id="avatar-progress" class="bg-indigo-600 h-3 w-0"></div>
                  </div>
                  <div id="avatar-progress-text" class="text-xs text-gray-600 mt-1"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="mb-8">
          <h2 class="text-2xl font-bold mb-4">Public Info</h2>
          <div class="bg-white p-6 rounded-lg shadow">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><div class="text-xs text-gray-500">Display name</div><div class="font-medium">${escapeHtml(u.displayName || '')}</div></div>
              <div><div class="text-xs text-gray-500">Location</div><div class="font-medium">${escapeHtml(u.location || '')}</div></div>
              <div><div class="text-xs text-gray-500">Phone</div><div class="font-medium">${escapeHtml(u.phone || '')}</div></div>
            </div>
          </div>
        </div>

        <div>
          <h2 class="text-2xl font-bold mb-4">My Posted Skills</h2>
          <div id="my-skills-grid" class="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            ${mySkills.length === 0 ? '<p class="col-span-full text-center">You have not posted any skills.</p>' : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

export function attachProfileEventListeners(mySkills) {
  renderSkills(mySkills, 'my-skills-grid');
  document.getElementById('my-skills-grid')?.addEventListener('click', (e) => {
    const card = e.target.closest('.skill-card');
    if (card) showSkillDetailsModal(mySkills.find(s => s.id === card.dataset.id));
  });

  const chooseBtn = document.getElementById('choose-avatar-btn');
  const fileInput = document.getElementById('avatar-file-input');
  const uploadBtn = document.getElementById('upload-avatar-btn');
  const statusEl = document.getElementById('avatar-status');
  const profileAvatarImg = document.getElementById('profile-avatar');
  const progressContainer = document.getElementById('avatar-progress-container');
  const progressBar = document.getElementById('avatar-progress');
  const progressText = document.getElementById('avatar-progress-text');

  if (chooseBtn && fileInput) chooseBtn.onclick = () => fileInput.click();
  if (fileInput) fileInput.onchange = (e) => {
    const f = e.target.files[0];
    if (f && profileAvatarImg) profileAvatarImg.src = URL.createObjectURL(f);
    if (statusEl) statusEl.textContent = 'Ready to upload';
  };

  if (uploadBtn) uploadBtn.onclick = async () => {
    const file = fileInput?.files?.[0];
    if (!file) { if (statusEl) statusEl.textContent = 'No file selected'; return; }
    if (!state.currentUser?.uid) { if (statusEl) statusEl.textContent = 'Not authenticated'; return; }

    uploadBtn.disabled = true; chooseBtn.disabled = true;
    if (statusEl) statusEl.textContent = 'Starting upload...';
    if (progressContainer) progressContainer.classList.remove('hidden');
    if (progressBar) progressBar.style.width = '0%';
    if (progressText) progressText.textContent = '';

    try {
      const safeName = file.name.replace(/[^\w.-]/g, '_');
      const avatarPath = `artifacts/${appId}/users/${state.currentUser.uid}/avatar-${Date.now()}-${safeName}`;
      const uploadTask = uploadBytesResumable(sRef(storage, avatarPath), file, { contentType: file.type || 'image/*' });
      uploadTask.on('state_changed',
        (snapshot) => {
          const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          if (progressBar) progressBar.style.width = percent + '%';
          if (progressText) progressText.textContent = percent + '%';
          if (statusEl) statusEl.textContent = `Uploading... ${percent}%`;
        },
        (err) => {
          console.error('upload error', err);
          if (statusEl) statusEl.textContent = `Upload failed: ${err.message || err.code}`;
          uploadBtn.disabled = false; chooseBtn.disabled = false;
        },
        async () => {
          try {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            await setDoc(doc(db, `/artifacts/${appId}/users/${state.currentUser.uid}`), { avatarUrl: url }, { merge: true });
            state.currentUser.avatarUrl = url;
            renderApp();
            if (statusEl) statusEl.textContent = 'Avatar uploaded!';
          } catch (err) {
            console.error('post upload error', err);
            if (statusEl) statusEl.textContent = 'Upload succeeded but update failed';
          } finally {
            uploadBtn.disabled = false; chooseBtn.disabled = false;
            setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2500);
          }
        }
      );
    } catch (err) {
      console.error('unexpected upload error', err);
      if (statusEl) statusEl.textContent = 'Unexpected upload error';
      uploadBtn.disabled = false; chooseBtn.disabled = false;
      if (progressContainer) progressContainer.classList.add('hidden');
    }
  };

  const editBtn = document.getElementById('edit-profile-btn');
  if (editBtn) editBtn.onclick = () => showEditProfileModal();
}

export function showEditProfileModal() {
  if (!requireAuth()) return;
  const u = state.currentUser;

  renderModal(`
    <div class="p-6">
      <h2 class="text-xl font-bold mb-4">Edit Profile</h2>
      <form id="edit-profile-form" class="space-y-4">
        <div><label class="text-sm text-gray-600">Display name</label><input name="displayName" type="text" value="${escapeHtml(u.displayName || '')}" class="w-full mt-1 p-2 border rounded" /></div>
        <div><label class="text-sm text-gray-600">Bio</label><textarea name="bio" rows="3" class="w-full mt-1 p-2 border rounded">${escapeHtml(u.bio || '')}</textarea></div>
        <div class="grid md:grid-cols-2 gap-4">
          <div><label class="text-sm text-gray-600">Location</label><input name="location" value="${escapeHtml(u.location || '')}" class="w-full mt-1 p-2 border rounded"/></div>
          <div><label class="text-sm text-gray-600">Phone</label><input name="phone" value="${escapeHtml(u.phone || '')}" class="w-full mt-1 p-2 border rounded"/></div>
        </div>
        <div><label class="text-sm text-gray-600">Email (read-only)</label><input name="email" type="email" value="${escapeHtml(u.email || '')}" class="w-full mt-1 p-2 border rounded bg-gray-100" readonly/></div>
        <div class="flex justify-end space-x-3">
          <button type="button" data-action="close-modal" class="px-4 py-2 border rounded">Cancel</button>
          <button id="save-profile-btn" type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded">Save</button>
        </div>
        <p id="edit-profile-status" class="text-sm text-gray-600 mt-2"></p>
      </form>
    </div>
  `);

  document.querySelector('[data-action="close-modal"]')?.addEventListener('click', closeModal);

  document.getElementById('edit-profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('edit-profile-status');
    const btn = document.getElementById('save-profile-btn');
    const fd = Object.fromEntries(new FormData(e.target));
    const updates = {
      displayName: (fd.displayName || '').trim(),
      bio: (fd.bio || '').trim(),
      location: (fd.location || '').trim(),
      phone: (fd.phone || '').trim()
    };
    try {
      btn.disabled = true; statusEl.textContent = 'Saving...';
      await setDoc(doc(db, `/artifacts/${appId}/users/${state.currentUser.uid}`), updates, { merge: true });
      state.currentUser = { ...state.currentUser, ...updates };
      renderApp();
      statusEl.textContent = 'Profile updated';
      setTimeout(() => closeModal(), 700);
    } catch (err) {
      console.error('edit profile err', err);
      statusEl.textContent = 'Failed to save.';
    } finally {
      btn.disabled = false;
    }
  });
}
