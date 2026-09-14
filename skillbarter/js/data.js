import { db, appId, collection, onSnapshot } from './firebase.js';
import { state } from './state.js';
import { renderView } from './layout.js';

export function detachDataListeners() {
  try { state.unsubSkills(); } catch (e) {}
  try { state.unsubWorkshops(); } catch (e) {}
  try { state.unsubNotifications(); } catch (e) {}
}

export function attachDataListeners() {
  detachDataListeners();

  const skillsCollection = collection(db, `/artifacts/${appId}/public/data/skills`);
  state.unsubSkills = onSnapshot(skillsCollection, (snap) => {
    state.allSkills = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderView();
  }, (err) => console.error('skills listener error', err));

  const workshopsCollection = collection(db, `/artifacts/${appId}/public/data/workshops`);
  state.unsubWorkshops = onSnapshot(workshopsCollection, (snap) => {
    state.allWorkshops = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderView();
  }, (err) => console.error('workshops listener error', err));
}
