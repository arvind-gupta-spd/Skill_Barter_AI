import { escapeHtml, defaultAvatarFor } from './utils.js';
import { renderModal } from './modal.js';

export function renderWorkshops(ws) {
  const grid = document.getElementById('workshops-grid');
  if (!grid) return;
  grid.innerHTML = ws.map(w => {
    const avatar = w.organizerAvatar || defaultAvatarFor();
    const dateText = w.date?.toDate ? new Date(w.date.toDate()).toLocaleDateString() : 'Date TBD';
    return `
      <div class="bg-white rounded-lg shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 cursor-pointer overflow-hidden workshop-card" data-id="${w.id}">
        <div class="p-6">
          <p class="text-sm font-semibold text-indigo-500 mb-2">${dateText}</p>
          <h3 class="text-xl font-bold">${escapeHtml(w.title)}</h3>
          <p class="text-gray-600 text-sm mb-4">${escapeHtml(w.description)}</p>
          <div class="flex items-center space-x-3">
            <img src="${avatar}" class="avatar-inline" alt="avatar">
            <div class="text-sm text-gray-600">${escapeHtml(w.organizerEmail || '')}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

export function showWorkshopDetailsModal(w) {
  if (!w) return;
  const avatar = w.organizerAvatar || defaultAvatarFor();
  const dateText = w.date?.toDate ? new Date(w.date.toDate()).toLocaleString() : 'Date TBD';
  renderModal(`
    <div class="p-6">
      <p class="text-sm font-semibold text-indigo-500 mb-2">${dateText}</p>
      <h2 class="text-2xl font-bold mb-3">${escapeHtml(w.title)}</h2>
      <p class="text-gray-700 mb-4">${escapeHtml(w.description || '')}</p>
      <div class="flex items-center space-x-3">
        <img src="${avatar}" class="avatar-inline" alt="avatar">
        <div class="text-sm text-gray-600">${escapeHtml(w.organizerEmail || '')}</div>
      </div>
    </div>
  `);
}
