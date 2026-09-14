import { state } from './state.js';
import { db, appId, collection, addDoc, serverTimestamp } from './firebase.js';
import { escapeHtml, defaultAvatarFor, iconMap, isValidEmail } from './utils.js';
import { renderModal, closeModal } from './modal.js';
import { showAuthModal } from './auth.js';
import { getCachedAverageRating, fetchAverageRating } from './ratings.js';
import { showProposeSwapModal } from './swaps.js';
import { openChatModal } from './chat.js';

export function renderSkills(skillsToRender, containerId = 'skills-grid') {
  const grid = document.getElementById(containerId);
  if (!grid) return;
  grid.innerHTML = skillsToRender.length > 0 ? skillsToRender.map(skill => {
    const avatar = skill.userAvatar || skill.avatarUrl || defaultAvatarFor();
    const avgRating = skill.userId ? (getCachedAverageRating(skill.userId) || '') : '';
    const ratingHTML = avgRating ? `<div class="text-sm text-yellow-500"><i class="fas fa-star"></i> ${avgRating.toFixed(1)}</div>` : '';
    const statusBadge = skill.swapStatus ? `<div class="text-xs text-gray-500">Status: ${escapeHtml(skill.swapStatus)}</div>` : '';
    return `
      <div class="bg-white p-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer skill-card" data-id="${skill.id}">
        <div class="flex items-center mb-4">
          <div class="text-3xl text-indigo-600 mr-4"><i class="fas ${iconMap[skill.category] || iconMap.Default}"></i></div>
          <div class="flex-1">
            <h3 class="text-xl font-semibold">${escapeHtml(skill.title)}</h3>
            <div class="text-sm text-gray-700 mb-2 flex items-center space-x-3">
              <img src="${avatar}" class="avatar-inline" alt="avatar">
              <div>
                <div class="font-semibold">${escapeHtml(skill.displayName || 'No Name')}</div>
                <div class="skill-email">${escapeHtml(skill.userEmail || '')}</div>
                ${statusBadge}
              </div>
            </div>
          </div>
          <div class="ml-4">${ratingHTML}</div>
        </div>
        <p class="text-gray-600">${escapeHtml(skill.description ? skill.description.substring(0, 150) + '...' : '')}</p>
      </div>
    `;
  }).join('') : `<p class="col-span-full text-center">${containerId === 'skills-grid' ? 'No skills found.' : ''}</p>`;
}

export function renderPostSkillForm() {
  const formContainer = document.getElementById('post-skill-form');
  if (!formContainer) return;
  formContainer.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
      <input name="title" placeholder="Skill Title" class="w-full px-4 py-2 border rounded-lg" required>
      <select name="category" class="w-full px-4 py-2 border rounded-lg" required>
        <option>Creative</option><option>Tech</option><option>Lifestyle</option><option>Business</option>
      </select>
    </div>
    <textarea name="description" rows="4" placeholder="Description..." class="w-full px-4 py-2 border rounded-lg mb-6" required></textarea>
    <input name="wanted" placeholder="What I'd like in return..." class="w-full px-4 py-2 border rounded-lg mb-6">
    <input name="tags" placeholder="Comma-separated tags (optional)" class="w-full px-4 py-2 border rounded-lg mb-6">
    <button type="submit" class="w-full bg-green-500 text-white font-semibold py-3 rounded-lg btn-glow">Post Skill</button>
    <p id="post-skill-status" class="text-center mt-4 h-5"></p>
  `;

  formContainer.addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('post-skill-status');
    const formData = Object.fromEntries(new FormData(e.target));
    if (!state.currentUser || state.currentUser.isAnonymous) { showAuthModal('login'); return; }

    const userEmail = state.currentUser.email || '';
    if (!isValidEmail(userEmail)) {
      statusEl.textContent = 'Your account does not have a valid email. Please update your account email.';
      statusEl.className = 'text-center mt-4 h-5 text-red-500';
      return;
    }

    try {
      await addDoc(collection(db, `/artifacts/${appId}/public/data/skills`), {
        title: formData.title,
        category: formData.category,
        description: formData.description,
        wanted: formData.wanted,
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        userId: state.currentUser.uid,
        userEmail: userEmail,
        displayName: state.currentUser.displayName || userEmail.split('@')[0],
        userAvatar: state.currentUser.avatarUrl || defaultAvatarFor(),
        createdAt: serverTimestamp()
      });
      statusEl.textContent = 'Skill Posted!';
      statusEl.className = 'text-center mt-4 h-5 text-green-500';
      e.target.reset();
    } catch (err) {
      console.error('post skill error', err);
      statusEl.textContent = 'Error posting skill.';
      statusEl.className = 'text-center mt-4 h-5 text-red-500';
    }
    setTimeout(() => statusEl.textContent = '', 3000);
  });
}

export async function showSkillDetailsModal(skill) {
  if (!skill) return;
  const isOwn = state.currentUser && skill.userId === state.currentUser.uid;
  const avatar = skill.userAvatar || skill.avatarUrl || defaultAvatarFor();
  const avgRating = await fetchAverageRating(skill.userId);

  renderModal(`
    <div class="p-6">
      <div class="flex items-center space-x-4 mb-4">
        <img src="${avatar}" class="avatar-inline" alt="avatar">
        <div class="flex-1">
          <h2 class="text-2xl font-bold">${escapeHtml(skill.title)}</h2>
          <div class="text-sm text-gray-600">by ${escapeHtml(skill.displayName || skill.userEmail)} ${avgRating ? ` • <span class="text-yellow-500"><i class="fas fa-star"></i> ${avgRating.toFixed(1)}</span>` : ''}</div>
        </div>
        <div>
          ${!isOwn ? `<button id="propose-swap-btn" class="bg-indigo-600 text-white px-3 py-2 rounded mr-2">Propose Swap</button>` : ''}
        </div>
      </div>
      <p class="text-gray-700 mb-4">${escapeHtml(skill.description)}</p>
      <p class="mt-4 font-semibold mb-6">Wants: ${escapeHtml(skill.wanted || 'Open to offers')}</p>
      <div class="flex space-x-3 justify-end">
        ${!isOwn ? `<button class="chat-btn bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded" data-uid="${skill.userId}">Chat</button>` : ''}
        ${!isOwn && skill.userEmail ? `<button class="email-btn bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded" data-email="${skill.userEmail}">Email</button>` : ''}
      </div>
    </div>
  `);

  document.querySelector('.chat-btn')?.addEventListener('click', () => openChatModal(skill.userId));
  document.querySelector('.email-btn')?.addEventListener('click', (e) => {
    const em = e.target.getAttribute('data-email');
    if (em) window.location.href = `mailto:${em}`;
  });

  document.getElementById('propose-swap-btn')?.addEventListener('click', async () => {
    closeModal();
    await showProposeSwapModal(skill);
  });
}
