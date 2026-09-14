import { db, appId, collection, addDoc, getDocs, doc, serverTimestamp } from './firebase.js';
import { state } from './state.js';
import { renderModal, closeModal } from './modal.js';
import { requireAuth } from './auth.js';

export async function showLeaveRatingModal(targetUserId) {
  if (!requireAuth()) return;
  if (!targetUserId) return;
  renderModal(`
    <div class="p-4">
      <h3 class="text-lg font-bold mb-3">Leave a rating</h3>
      <form id="rating-form" class="space-y-3">
        <div>
          <label class="text-sm text-gray-600">Rating (1-5)</label>
          <select name="score" class="w-full p-2 border rounded">
            <option value="5">5 - Excellent</option>
            <option value="4">4 - Good</option>
            <option value="3">3 - Okay</option>
            <option value="2">2 - Poor</option>
            <option value="1">1 - Terrible</option>
          </select>
        </div>
        <div>
          <label class="text-sm text-gray-600">Comment (optional)</label>
          <textarea name="comment" rows="3" class="w-full p-2 border rounded"></textarea>
        </div>
        <div class="flex justify-end space-x-3">
          <button data-action="close-modal" type="button" class="px-3 py-2 border rounded">Cancel</button>
          <button type="submit" class="px-3 py-2 bg-indigo-600 text-white rounded">Submit</button>
        </div>
      </form>
    </div>
  `);

  document.querySelector('[data-action="close-modal"]')?.addEventListener('click', closeModal);

  document.getElementById('rating-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try {
      await addDoc(collection(db, `/artifacts/${appId}/users/${targetUserId}/ratings`), {
        fromUserId: state.currentUser.uid,
        score: Number(d.score),
        comment: d.comment || '',
        timestamp: serverTimestamp()
      });
      closeModal();
      alert('Thanks for your feedback!');
    } catch (err) {
      console.error('rating error', err);
      alert('Could not save rating.');
    }
  });
}

export async function fetchAverageRating(userId) {
  if (!userId) return null;
  const cached = state.ratingCache[userId];
  if (cached && Date.now() - cached.ts < 60 * 1000) return cached.avg;
  try {
    const snaps = await getDocs(collection(db, `/artifacts/${appId}/users/${userId}/ratings`));
    const arr = snaps.docs.map(d => d.data().score).filter(s => typeof s === 'number');
    if (arr.length === 0) {
      state.ratingCache[userId] = { avg: null, ts: Date.now() };
      return null;
    }
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    state.ratingCache[userId] = { avg, ts: Date.now() };
    return avg;
  } catch (e) {
    console.error('avg rating error', e);
    return null;
  }
}

export function getCachedAverageRating(userId) {
  const c = state.ratingCache[userId];
  return c ? c.avg : null;
}
