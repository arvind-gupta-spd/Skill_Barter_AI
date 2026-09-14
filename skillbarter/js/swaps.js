import { state } from './state.js';
import { db, appId, doc, getDoc, setDoc, addDoc, deleteDoc, collection, serverTimestamp } from './firebase.js';
import { escapeHtml, defaultAvatarFor, pushNotification } from './utils.js';
import { renderModal, closeModal } from './modal.js';
import { requireAuth } from './auth.js';

export async function showProposeSwapModal(targetSkill) {
  if (!requireAuth()) return;
  const mySkills = state.allSkills.filter(s => s.userId === state.currentUser.uid);
  if (mySkills.length === 0) {
    alert('You need to post a skill to offer for a swap.');
    return;
  }

  renderModal(`
    <div class="p-6">
      <h2 class="text-xl font-bold mb-4">Propose Swap</h2>
      <p class="text-sm text-gray-600 mb-4">Offer one of your skills in exchange for "<strong>${escapeHtml(targetSkill.title)}</strong>"</p>
      <form id="propose-swap-form" class="space-y-4">
        <div>
          <label class="text-sm text-gray-600">Select your skill to offer</label>
          <select name="offeredSkill" class="w-full p-2 border rounded">
            ${mySkills.map(s => `<option value="${s.id}">${escapeHtml(s.title)}</option>`).join('')}
          </select>
        </div>
        <div class="flex justify-end space-x-3">
          <button type="button" data-action="close-modal" class="px-3 py-2 border rounded">Cancel</button>
          <button type="submit" class="px-3 py-2 bg-indigo-600 text-white rounded">Send Proposal</button>
        </div>
        <p id="propose-status" class="text-sm text-gray-600 mt-2"></p>
      </form>
    </div>
  `);

  document.querySelector('[data-action="close-modal"]')?.addEventListener('click', closeModal);

  document.getElementById('propose-swap-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const offeredId = new FormData(e.target).get('offeredSkill');
    const statusEl = document.getElementById('propose-status');
    try {
      statusEl.textContent = 'Sending proposal...';
      const swapDoc = await addDoc(collection(db, `/artifacts/${appId}/public/data/swaps`), {
        proposerId: state.currentUser.uid,
        responderId: targetSkill.userId,
        skillOfferedId: offeredId,
        skillRequestedId: targetSkill.id,
        status: 'pending',
        createdAt: serverTimestamp()
      });

      await pushNotification(targetSkill.userId, {
        type: 'swap_request',
        fromUserId: state.currentUser.uid,
        fromUserName: state.currentUser.displayName || state.currentUser.email.split('@')[0],
        fromUserAvatar: state.currentUser.avatarUrl || defaultAvatarFor(),
        swapId: swapDoc.id,
        textPreview: `${state.currentUser.displayName || state.currentUser.email} proposed a swap for "${targetSkill.title}"`
      });

      statusEl.textContent = 'Proposal sent!';
      setTimeout(() => closeModal(), 800);
    } catch (err) {
      console.error('propose swap error', err);
      statusEl.textContent = 'Failed to send proposal.';
    }
  });
}

export async function acceptSwap(swapId) {
  try {
    const swapRef = doc(db, `/artifacts/${appId}/public/data/swaps/${swapId}`);
    const swapSnap = await getDoc(swapRef);
    if (!swapSnap.exists()) throw new Error('Swap not found');
    const swap = swapSnap.data();
    if (swap.status !== 'pending') return;

    await setDoc(swapRef, { status: 'accepted', acceptedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });

    await pushNotification(swap.proposerId, {
      type: 'swap_accepted',
      fromUserId: swap.responderId,
      swapId,
      textPreview: 'Your swap proposal was accepted. Start a video call to complete the swap.'
    });

    await pushNotification(swap.responderId, {
      type: 'swap_confirmed',
      fromUserId: swap.proposerId,
      swapId,
      textPreview: 'You accepted the swap. Wait for the proposer to start a video call.'
    });
  } catch (err) {
    console.error('acceptSwap error', err);
  }
}

export async function declineSwap(swapId) {
  try {
    const swapRef = doc(db, `/artifacts/${appId}/public/data/swaps/${swapId}`);
    await setDoc(swapRef, { status: 'declined', updatedAt: serverTimestamp() }, { merge: true });
    const swapSnap = await getDoc(swapRef);
    if (swapSnap.exists()) {
      const swap = swapSnap.data();
      await pushNotification(swap.proposerId, {
        type: 'swap_declined',
        fromUserId: swap.responderId,
        textPreview: 'Your swap proposal was declined.'
      });
    }
  } catch (err) {
    console.error('declineSwap error', err);
  }
}

export async function finalizeSwap(swapId) {
  try {
    const swapRef = doc(db, `/artifacts/${appId}/public/data/swaps/${swapId}`);
    const swapSnap = await getDoc(swapRef);
    if (!swapSnap.exists()) { console.warn('finalizeSwap: swap not found', swapId); return; }
    const swap = swapSnap.data();
    if (swap.status === 'completed') return;

    await setDoc(swapRef, { status: 'completed', completedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });

    try { if (swap.skillOfferedId) await deleteDoc(doc(db, `/artifacts/${appId}/public/data/skills/${swap.skillOfferedId}`)); } catch (e) { console.warn('delete offered error', e); }
    try { if (swap.skillRequestedId) await deleteDoc(doc(db, `/artifacts/${appId}/public/data/skills/${swap.skillRequestedId}`)); } catch (e) { console.warn('delete requested error', e); }

    const completedPreview = 'Swap completed. Please rate your swap partner.';
    if (swap.proposerId) await pushNotification(swap.proposerId, { type: 'swap_completed', fromUserId: swap.responderId, swapId, textPreview: completedPreview });
    if (swap.responderId) await pushNotification(swap.responderId, { type: 'swap_completed', fromUserId: swap.proposerId, swapId, textPreview: completedPreview });
  } catch (err) {
    console.error('finalizeSwap error', err);
  }
}
