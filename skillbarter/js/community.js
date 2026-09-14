import { state } from './state.js';
import { db, appId, collection, addDoc, getDoc, getDocs, doc, query, orderBy, serverTimestamp } from './firebase.js';
import { escapeHtml, defaultAvatarFor } from './utils.js';
import { renderModal, closeModal } from './modal.js';
import { requireAuth } from './auth.js';

export async function renderCommunity() {
  const container = document.getElementById('community-container');
  if (!container) return;
  container.innerHTML = `
    <div class="bg-white p-6 rounded-lg shadow mb-6">
      <h3 class="text-lg font-semibold mb-3">Ask the Community</h3>
      <form id="ask-form" class="space-y-3">
        <input name="title" placeholder="Short title" class="w-full p-2 border rounded" required>
        <textarea name="details" placeholder="Describe your question..." rows="4" class="w-full p-2 border rounded" required></textarea>
        <div class="flex justify-end">
          <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded">Post Question</button>
        </div>
      </form>
    </div>
    <div id="questions-list" class="space-y-4"></div>
  `;

  document.getElementById('ask-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!requireAuth()) return;
    const fd = Object.fromEntries(new FormData(e.target));
    try {
      await addDoc(collection(db, `/artifacts/${appId}/public/community/questions`), {
        title: fd.title,
        details: fd.details,
        userId: state.currentUser.uid,
        userName: state.currentUser.displayName || state.currentUser.email.split('@')[0],
        userAvatar: state.currentUser.avatarUrl || defaultAvatarFor(),
        createdAt: serverTimestamp()
      });
      e.target.reset();
      loadCommunityQuestions();
    } catch (err) { console.error('post question err', err); alert('Failed to post question'); }
  });

  loadCommunityQuestions();
}

export async function loadCommunityQuestions() {
  const qSnap = await getDocs(query(collection(db, `/artifacts/${appId}/public/community/questions`), orderBy('createdAt', 'desc')));
  const list = document.getElementById('questions-list');
  if (!list) return;
  list.innerHTML = qSnap.docs.map(docSnap => {
    const d = docSnap.data();
    const when = d.createdAt?.toDate ? new Date(d.createdAt.toDate()).toLocaleString() : '';
    return `
      <div class="bg-white p-4 rounded shadow" data-qid="${docSnap.id}">
        <div class="flex justify-between items-start">
          <div>
            <div class="font-semibold">${escapeHtml(d.title)}</div>
            <div class="text-xs text-gray-500">by ${escapeHtml(d.userName || 'Anonymous')} • ${when}</div>
          </div>
          <div>
            <button class="view-answers-btn text-sm text-indigo-600" data-qid="${docSnap.id}">View / Answer</button>
          </div>
        </div>
        <p class="mt-3 text-gray-700">${escapeHtml(d.details)}</p>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.view-answers-btn').forEach(btn =>
    btn.addEventListener('click', () => showQuestionModal(btn.dataset.qid))
  );
}

export async function showQuestionModal(questionId) {
  const qSnap = await getDoc(doc(db, `/artifacts/${appId}/public/community/questions/${questionId}`));
  if (!qSnap.exists()) { alert('Question not found'); return; }
  const data = qSnap.data();
  const answersSnap = await getDocs(collection(db, `/artifacts/${appId}/public/community/questions/${questionId}/answers`));
  const when = data.createdAt?.toDate ? new Date(data.createdAt.toDate()).toLocaleString() : '';

  renderModal(`
    <div class="p-4">
      <div class="flex items-center space-x-3 mb-3">
        <img src="${data.userAvatar || defaultAvatarFor()}" class="avatar-inline" alt="avatar">
        <div>
          <div class="font-semibold">${escapeHtml(data.userName || 'Anonymous')}</div>
          <div class="text-xs text-gray-500">${when}</div>
        </div>
      </div>
      <h3 class="text-lg font-bold mb-2">${escapeHtml(data.title)}</h3>
      <p class="text-gray-700 mb-4">${escapeHtml(data.details)}</p>

      <div id="answers-list" class="space-y-3 mb-4">
        ${answersSnap.docs.length === 0 ? '<div class="text-sm text-gray-500">No answers yet.</div>' : ''}
        ${answersSnap.docs.map(a => `<div class="p-3 bg-gray-50 rounded"><div class="text-sm font-semibold">${escapeHtml(a.data().userName || 'Anonymous')}</div><div class="text-sm text-gray-700 mt-1">${escapeHtml(a.data().text)}</div></div>`).join('')}
      </div>

      <form id="answer-form" class="space-y-3">
        <textarea name="answer" rows="3" class="w-full p-2 border rounded" placeholder="Write your answer..." required></textarea>
        <div class="flex justify-end">
          <button type="submit" class="px-3 py-2 bg-indigo-600 text-white rounded">Post Answer</button>
        </div>
      </form>
    </div>
  `);

  document.getElementById('answer-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!requireAuth()) return;
    const d = Object.fromEntries(new FormData(e.target));
    try {
      await addDoc(collection(db, `/artifacts/${appId}/public/community/questions/${questionId}/answers`), {
        text: d.answer,
        userId: state.currentUser.uid,
        userName: state.currentUser.displayName || state.currentUser.email.split('@')[0],
        userAvatar: state.currentUser.avatarUrl || defaultAvatarFor(),
        timestamp: serverTimestamp()
      });
      closeModal();
      showQuestionModal(questionId);
    } catch (err) { console.error('answer error', err); alert('Failed to post answer'); }
  });
}
