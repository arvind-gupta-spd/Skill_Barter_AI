import { db, appId, collection, addDoc, doc, setDoc, serverTimestamp } from './firebase.js';
import { state } from './state.js';

const DEFAULT_PROFILE_SVG = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.2" fill="#e6e6ea"/><path d="M4.5 20.5c.9-3.5 4.2-6 7.5-6s6.6 2.5 7.5 6" fill="#e6e6ea"/></svg>`);

export function defaultAvatarFor() {
  return `data:image/svg+xml;utf8,${DEFAULT_PROFILE_SVG}`;
}

export const iconMap = {
  Creative: 'fa-palette',
  Tech: 'fa-code',
  Lifestyle: 'fa-utensils',
  Business: 'fa-briefcase',
  'Home & Garden': 'fa-seedling',
  Default: 'fa-star'
};

export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function markNotifRead(id) {
  if (!id || !state.currentUser) return Promise.resolve();
  return setDoc(
    doc(db, `/artifacts/${appId}/users/${state.currentUser.uid}/notifications/${id}`),
    { read: true },
    { merge: true }
  );
}

export function pushNotification(userId, payload) {
  if (!userId) return Promise.resolve();
  return addDoc(collection(db, `/artifacts/${appId}/users/${userId}/notifications`), {
    ...payload,
    timestamp: serverTimestamp(),
    read: false
  });
}
