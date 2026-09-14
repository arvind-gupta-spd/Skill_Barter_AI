import { state } from './state.js';
import { db, appId, doc, getDoc } from './firebase.js';
import { escapeHtml, defaultAvatarFor, markNotifRead } from './utils.js';
import { renderModal, closeModal } from './modal.js';
import { requireAuth } from './auth.js';
import { acceptSwap, declineSwap } from './swaps.js';
import { showLeaveRatingModal } from './ratings.js';
import { openChatModal } from './chat.js';
import { startCallUI, joinCall } from './call.js';

function actionButtonFor(n) {
  switch (n.type) {
    case 'message':        return `<button class="open-chat-btn bg-indigo-600 text-white px-3 py-1 rounded" data-from="${n.fromUserId || ''}" data-id="${n.id}">Open Chat</button>`;
    case 'swap_request':   return `<button class="view-swap-btn bg-indigo-600 text-white px-3 py-1 rounded" data-swap="${n.swapId}" data-id="${n.id}">View Proposal</button>`;
    case 'swap_accepted':  return `<button class="start-swap-call-btn bg-green-600 text-white px-3 py-1 rounded" data-swap="${n.swapId}" data-user="${n.fromUserId || ''}" data-id="${n.id}">Start Video Call</button>`;
    case 'swap_completed': return `<button class="leave-rating-btn bg-green-600 text-white px-3 py-1 rounded" data-target="${n.fromUserId}" data-id="${n.id}">Leave Rating</button>`;
    case 'incoming_call':  return `<button class="join-call-btn bg-green-600 text-white px-3 py-1 rounded" data-call="${n.callId}" data-id="${n.id}">Join Call</button>`;
    default:               return '';
  }
}

export function openNotificationsModal() {
  if (!requireAuth()) return;

  renderModal(`
    <div class="p-4">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-bold">Notifications</h2>
        <div>
          <button id="mark-all-read-btn" class="text-sm text-indigo-600 mr-3">Mark all read</button>
          <button data-action="close-modal" class="text-sm text-gray-600">Close</button>
        </div>
      </div>
      <div id="notifs-list" class="max-h-96 overflow-auto">
        ${state.notifications.length === 0 ? '<div class="p-4 text-center text-gray-500">No notifications</div>' : ''}
        ${state.notifications.map(n => {
          const when = n.timestamp?.toDate ? new Date(n.timestamp.toDate()).toLocaleString() : '';
          return `
          <div class="p-3 border-b flex items-start space-x-3 ${n.read ? 'opacity-70' : ''}" data-id="${n.id}">
            <img src="${n.fromUserAvatar || defaultAvatarFor()}" class="avatar-inline" alt="avatar">
            <div class="flex-1">
              <div class="flex justify-between">
                <div>
                  <div class="text-sm font-semibold">${escapeHtml(n.fromUserName || 'Someone')}</div>
                  <div class="text-xs text-gray-600">${n.type}</div>
                </div>
                <div class="text-xs text-gray-400">${when}</div>
              </div>
              <div class="text-sm text-gray-800 mt-2">${escapeHtml(n.textPreview || '')}</div>
              <div class="mt-3">
                ${actionButtonFor(n)}
                <button class="mark-read-btn text-sm text-gray-600 ml-3" data-id="${n.id}">${n.read ? 'Read' : 'Mark read'}</button>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `);

  document.querySelector('[data-action="close-modal"]')?.addEventListener('click', closeModal);

  document.getElementById('mark-all-read-btn')?.addEventListener('click', async () => {
    await Promise.all(state.notifications.filter(n => !n.read).map(n => markNotifRead(n.id)));
  });

  const list = document.getElementById('notifs-list');

  list.querySelectorAll('.open-chat-btn').forEach(btn => btn.addEventListener('click', () => {
    const fromId = btn.dataset.from;
    if (!fromId) return;
    markNotifRead(btn.dataset.id);
    closeModal();
    openChatModal(fromId);
  }));

  list.querySelectorAll('.view-swap-btn').forEach(btn => btn.addEventListener('click', () => showSwapProposalModal(btn.dataset.swap, btn.dataset.id)));

  list.querySelectorAll('.start-swap-call-btn').forEach(btn => btn.addEventListener('click', () => {
    const swapId = btn.dataset.swap, otherUserId = btn.dataset.user;
    if (!swapId || !otherUserId) return;
    markNotifRead(btn.dataset.id);
    closeModal();
    startCallUI(otherUserId, swapId);
  }));

  list.querySelectorAll('.leave-rating-btn').forEach(btn => btn.addEventListener('click', () => {
    closeModal();
    showLeaveRatingModal(btn.dataset.target);
  }));

  list.querySelectorAll('.join-call-btn').forEach(btn => btn.addEventListener('click', () => {
    const callId = btn.dataset.call;
    if (!callId) return;
    markNotifRead(btn.dataset.id);
    closeModal();
    joinCall(callId);
  }));

  list.querySelectorAll('.mark-read-btn').forEach(btn => btn.addEventListener('click', () => {
    if (btn.dataset.id) markNotifRead(btn.dataset.id);
  }));
}

// Nested modal opened from a "View Proposal" notification: shows the two skills
// and lets the responder accept or decline the swap.
async function showSwapProposalModal(swapId, notifId) {
  if (!swapId) return;
  const swapSnap = await getDoc(doc(db, `/artifacts/${appId}/public/data/swaps/${swapId}`));
  if (!swapSnap.exists()) { alert('Swap not found'); return; }
  const swap = swapSnap.data();
  const [reqSkillSnap, offSkillSnap] = await Promise.all([
    getDoc(doc(db, `/artifacts/${appId}/public/data/skills/${swap.skillRequestedId}`)),
    getDoc(doc(db, `/artifacts/${appId}/public/data/skills/${swap.skillOfferedId}`))
  ]);
  const reqTitle = reqSkillSnap.exists() ? reqSkillSnap.data().title : 'N/A';
  const offTitle = offSkillSnap.exists() ? offSkillSnap.data().title : 'N/A';

  renderModal(`
    <div class="p-4">
      <h3 class="text-lg font-bold mb-2">Swap Proposal</h3>
      <p class="text-sm text-gray-600 mb-3">Offer: <strong>${escapeHtml(offTitle)}</strong></p>
      <p class="text-sm text-gray-600 mb-3">Requested: <strong>${escapeHtml(reqTitle)}</strong></p>
      <div class="flex justify-end space-x-3">
        <button id="decline-swap-btn" class="px-3 py-2 border rounded">Decline</button>
        <button id="accept-swap-btn" class="px-3 py-2 bg-indigo-600 text-white rounded">Accept Swap</button>
      </div>
    </div>
  `);

  document.getElementById('accept-swap-btn')?.addEventListener('click', async () => {
    try {
      await acceptSwap(swapId);
      await markNotifRead(notifId);
      closeModal();
      alert('Swap accepted. The proposer will be notified to start a video call to complete the swap.');
    } catch (err) { console.error(err); alert('Error accepting swap'); }
  });

  document.getElementById('decline-swap-btn')?.addEventListener('click', async () => {
    await declineSwap(swapId);
    await markNotifRead(notifId);
    closeModal();
  });
}
