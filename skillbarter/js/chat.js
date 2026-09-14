import { state } from './state.js';
import { db, appId, collection, doc, getDoc, addDoc, onSnapshot, query, orderBy, serverTimestamp } from './firebase.js';
import { escapeHtml, defaultAvatarFor, pushNotification } from './utils.js';
import { renderModal, closeModal } from './modal.js';
import { requireAuth } from './auth.js';
import { startCallUI } from './call.js';

export async function openChatModal(targetUserId) {
  if (!requireAuth()) return;
  const chatId = [state.currentUser.uid, targetUserId].sort().join('_');

  let otherName = 'Chat', otherAvatar = defaultAvatarFor();
  try {
    const otherDoc = await getDoc(doc(db, `/artifacts/${appId}/users/${targetUserId}`));
    if (otherDoc.exists()) {
      const d = otherDoc.data();
      otherName = d.displayName || d.email?.split('@')[0] || 'User';
      otherAvatar = d.avatarUrl || defaultAvatarFor();
    }
  } catch (err) {
    console.warn('other user fetch err', err);
  }

  renderModal(`
    <div class="p-4">
      <div class="flex items-center space-x-3 mb-4">
        <img src="${otherAvatar}" class="avatar-inline" alt="avatar">
        <h2 class="text-xl font-bold">Chat with ${escapeHtml(otherName)}</h2>
        <div class="ml-auto">
          <button id="start-video-btn" class="bg-green-600 text-white px-3 py-1 rounded">Video Call</button>
        </div>
      </div>
      <div id="chat-history" class="mb-4 h-64 overflow-y-auto bg-gray-100 rounded-lg p-3"></div>
      <form id="chat-form" class="flex">
        <input id="chat-input" class="flex-1 border rounded-l px-3 py-2" placeholder="Type a message..." required>
        <button type="submit" class="bg-indigo-600 text-white px-5 py-2 rounded-r">Send</button>
      </form>
    </div>
  `);

  document.getElementById('start-video-btn')?.addEventListener('click', () => startCallUI(targetUserId, null));

  const chatRef = collection(db, "chats", chatId, "messages");
  const chatHistory = document.getElementById('chat-history');
  const q = query(chatRef, orderBy('timestamp'));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    chatHistory.innerHTML = snapshot.docs.map(docSnap => {
      const m = docSnap.data();
      const isMine = m.senderId === state.currentUser.uid;
      const senderName = m.senderName || (isMine ? (state.currentUser.displayName || state.currentUser.email.split('@')[0]) : m.senderId);
      const senderAvatar = m.senderAvatar || (isMine ? state.currentUser.avatarUrl || defaultAvatarFor() : defaultAvatarFor());
      const timeText = m.timestamp?.toDate ? new Date(m.timestamp.toDate()).toLocaleTimeString() : '';
      if (isMine) {
        return `<div class="mb-3 flex justify-end items-end"><div class="max-w-[70%] text-right"><div class="text-xs text-gray-500 mb-1">${escapeHtml(senderName)}</div><div class="inline-block bg-indigo-600 text-white px-3 py-2 rounded-md">${escapeHtml(m.text)}</div><div class="text-xs text-gray-400 mt-1">${timeText}</div></div><img src="${senderAvatar}" class="avatar-inline ml-3" alt="avatar"></div>`;
      }
      return `<div class="mb-3 flex justify-start items-end"><img src="${senderAvatar}" class="avatar-inline mr-3" alt="avatar"><div class="max-w-[70%]"><div class="text-xs text-gray-500 mb-1">${escapeHtml(senderName)}</div><div class="inline-block bg-white px-3 py-2 rounded-md shadow">${escapeHtml(m.text)}</div><div class="text-xs text-gray-400 mt-1">${timeText}</div></div></div>`;
    }).join('');
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }, (err) => console.error('chat snap err', err));

  document.getElementById('chat-form').onsubmit = async (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const t = input.value.trim();
    if (!t) return;
    const senderNameToStore = state.currentUser.displayName || state.currentUser.email.split('@')[0] || 'User';
    const senderAvatarToStore = state.currentUser.avatarUrl || defaultAvatarFor();
    try {
      await addDoc(chatRef, { text: t, senderId: state.currentUser.uid, senderName: senderNameToStore, senderAvatar: senderAvatarToStore, timestamp: serverTimestamp() });
      if (targetUserId && targetUserId !== state.currentUser.uid) {
        await pushNotification(targetUserId, {
          type: 'message',
          chatId,
          fromUserId: state.currentUser.uid,
          fromUserName: senderNameToStore,
          fromUserAvatar: senderAvatarToStore,
          textPreview: t.substring(0, 200)
        });
      }
    } catch (err) {
      console.error('send msg err', err);
    }
    input.value = '';
  };

  // Unsubscribe from the chat listener when the modal closes.
  const closeBtn = document.querySelector('[data-action="close-modal"]');
  if (closeBtn) closeBtn.onclick = () => { unsubscribe(); closeModal(); };
}
