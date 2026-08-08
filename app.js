import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
  getStorage,
  ref as sRef,
  uploadBytesResumable,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

/*
  Full app.js updated:
  - Neutral default avatar (SVG) with no initials/text
  - Avatar upload using uploadBytesResumable with progress UI
  - Edit Profile modal to update displayName, bio, location, phone (saved to Firestore)
  - Notifications bell opens a modal listing notifications, each with avatar and 'Open Chat' button
  - Chat modal shows avatar + senderName; sending a message creates a notification for recipient
  - Fixed navigation handler duplication and "stuck in profile" behavior
  - Hide chat/email buttons when viewing your own skill
*/

let currentUser = null;
let allSkills = [];
let allWorkshops = [];
let notifications = [];
let currentView = 'home';
let isMenuOpen = false;
let unsubSkills = () => {};
let unsubWorkshops = () => {};
let unsubNotifications = () => {};
let navClickHandler = null;

const iconMap = {
  Creative: 'fa-palette',
  Tech: 'fa-code',
  Lifestyle: 'fa-utensils',
  Business: 'fa-briefcase',
  'Home & Garden': 'fa-seedling',
  Default: 'fa-star'
};

const navbar = document.getElementById('navbar');
const mainContent = document.getElementById('main-content');
const modalContainer = document.getElementById('modal-container');

const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
  apiKey: "AIzaSyAUfz96oHM7yNZxRs_wtvvkjR-M9tNEays",
  authDomain: "skill-barter-ai.firebaseapp.com",
  projectId: "skill-barter-ai",
  storageBucket: "skill-barter-ai.appspot.com",
  messagingSenderId: "1018942678677",
  appId: "1:1018942678677:web:cac90dd08aec687bf25d9c",
  measurementId: "G-C41FT4VF07"
};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Neutral profile SVG (no initials/text)
const DEFAULT_PROFILE_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.2" fill="#e6e6ea"/><path d="M4.5 20.5c.9-3.5 4.2-6 7.5-6s6.6 2.5 7.5 6" fill="#e6e6ea"/></svg>`
);

function defaultAvatarFor() {
  return `data:image/svg+xml;utf8,${DEFAULT_PROFILE_SVG}`;
}

function detachDataListeners() {
  try { unsubSkills(); } catch (e) {}
  try { unsubWorkshops(); } catch (e) {}
  try { unsubNotifications(); } catch (e) {}
}

function attachDataListeners() {
  detachDataListeners();
  const skillsCollection = collection(db, `/artifacts/${appId}/public/data/skills`);
  unsubSkills = onSnapshot(skillsCollection, (snapshot) => {
    allSkills = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderView();
  }, (err) => console.error('Error fetching skills:', err));

  const workshopsCollection = collection(db, `/artifacts/${appId}/public/data/workshops`);
  unsubWorkshops = onSnapshot(workshopsCollection, (snapshot) => {
    allWorkshops = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderView();
  }, (err) => console.error('Error fetching workshops:', err));
}

onAuthStateChanged(auth, async (user) => {
  detachDataListeners();
  allSkills = [];
  allWorkshops = [];
  notifications = [];
  if (user) {
    const userDocRef = doc(db, `/artifacts/${appId}/users/${user.uid}`);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      currentUser = { uid: user.uid, ...userDocSnap.data() };
      if (!currentUser.avatarUrl) currentUser.avatarUrl = user.photoURL || defaultAvatarFor();
    } else {
      const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'User');
      currentUser = { uid: user.uid, email: user.email, displayName, isAnonymous: user.isAnonymous, avatarUrl: user.photoURL || defaultAvatarFor() };
    }

    attachDataListeners();

    // Notifications listener for logged in user
    const notifsCollection = collection(db, `/artifacts/${appId}/users/${user.uid}/notifications`);
    unsubNotifications = onSnapshot(query(notifsCollection, orderBy('timestamp', 'desc')), (snapshot) => {
      notifications = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      // keep navbar updated
      renderNavbar();
    }, (err) => {
      console.error('Error listening to notifications:', err);
    });

  } else {
    currentUser = null;
  }
  renderApp();
});

function renderApp() {
  renderNavbar();
  attachNavbarEventListeners();
  renderView();
}

function renderNavbar() {
  const unreadCount = notifications.filter(n => !n.read).length;
  const authButtonsHTML = (isMobile = false) => {
    if (currentUser && !currentUser.isAnonymous) {
      return `
        <button data-action="profile" class="font-semibold text-gray-600 hover:text-indigo-600 ${isMobile ? 'hidden' : 'hidden md:inline'}">My Profile</button>
        <a href="#post-skill" class="block w-full text-center bg-green-500 text-white px-4 py-2 rounded-full hover:bg-green-600 transition duration-300 ${isMobile ? 'mb-2' : ''}">Post Skill</a>
        <button data-action="logout" class="block w-full text-center ${isMobile ? 'bg-red-500 text-white py-2 rounded-md' : 'text-gray-600 hover:text-indigo-600'}">Logout</button>
      `;
    }
    return `
      <button data-action="login" class="block w-full text-center ${isMobile ? 'bg-gray-200 text-gray-800 px-4 py-2 rounded-md mb-2' : 'text-gray-600 hover:text-indigo-600'}">Login</button>
      <button data-action="signup" class="block w-full text-center bg-indigo-600 text-white px-4 py-2 rounded-full hover:bg-indigo-700 transition duration-300">Sign Up</button>
    `;
  };

  const notifsButton = currentUser && !currentUser.isAnonymous ? `
    <div class="relative">
      <button data-action="open-notifs-modal" class="relative text-gray-600 hover:text-indigo-600 focus:outline-none">
        <i class="fas fa-bell text-2xl"></i>
        ${unreadCount > 0 ? `<span class="absolute -top-1 -right-2 bg-red-500 text-white text-xs rounded-full px-1">${unreadCount}</span>` : ''}
      </button>
    </div>
  ` : '';

  navbar.innerHTML = `
    <div class="container mx-auto px-6 py-4 flex justify-between items-center">
      <a href="#" data-action="home" class="text-2xl font-bold text-indigo-600"><i class="fas fa-people-arrows mr-2"></i>SkillBarter AI</a>
      <div class="hidden md:flex items-center space-x-6">
        <a href="#browse" class="text-gray-600 hover:text-indigo-600">Browse</a>
        <a href="#workshops" class="text-gray-600 hover:text-indigo-600">Workshops</a>
        <a href="#ai-matcher" class="text-gray-600 hover:text-indigo-600">AI Matcher</a>
        <div class="flex items-center space-x-4">
          ${notifsButton}
          <div class="flex items-center space-x-3">
            ${currentUser ? `<img src="${currentUser.avatarUrl || defaultAvatarFor()}" class="avatar-inline" alt="avatar">` : ''}
            ${authButtonsHTML()}
          </div>
        </div>
      </div>
      <div class="md:hidden">
        <button data-action="toggle-menu" class="text-gray-600 focus:outline-none"><i class="fas fa-bars text-2xl"></i></button>
      </div>
    </div>
    <div id="mobile-menu" class="${isMenuOpen ? '' : 'hidden'} md:hidden">
      <a href="#browse" class="block px-6 py-3 text-gray-600 hover:bg-gray-100">Browse</a>
      <a href="#workshops" class="block px-6 py-3 text-gray-600 hover:bg-gray-100">Workshops</a>
      <a href="#ai-matcher" class="block px-6 py-3 text-gray-600 hover:bg-gray-100">AI Matcher</a>
      ${currentUser && !currentUser.isAnonymous ? `<a href="#" data-action="profile" class="block px-6 py-3 text-gray-600 hover:bg-gray-100">My Profile</a>` : ''}
      <div class="px-6 py-3 space-y-2">${authButtonsHTML(true)}</div>
    </div>
  `;
}

function attachNavbarEventListeners() {
  if (navClickHandler) {
    navbar.removeEventListener('click', navClickHandler);
  }

  navClickHandler = async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action) {
      switch (action) {
        case 'home': currentView = 'home'; renderApp(); break;
        case 'profile': currentView = 'profile'; renderApp(); break;
        case 'logout': signOut(auth); break;
        case 'login': showAuthModal('login'); break;
        case 'signup': showAuthModal('signup'); break;
        case 'toggle-menu':
          isMenuOpen = !isMenuOpen;
          renderNavbar();
          attachNavbarEventListeners();
          break;
        case 'open-notifs-modal':
          openNotificationsModal();
          break;
      }
      return;
    }

    // Anchor links (#browse, #workshops, #ai-matcher) should render home and scroll
    const link = e.target.closest('a[href^="#"]');
    if (link) {
      const id = link.getAttribute('href').replace('#', '');
      currentView = 'home';
      renderApp();
      setTimeout(() => {
        const target = document.getElementById(id);
        if (target) target.scrollIntoView({ behavior: 'smooth' });
      }, 80);
      e.preventDefault();
      return;
    }
  };

  navbar.addEventListener('click', navClickHandler);
}

function renderView() {
  if (currentView === 'home') {
    mainContent.innerHTML = getHomeHTML();
    renderSkills(allSkills);
    renderWorkshops(allWorkshops);
    attachHomeEventListeners();
  } else if (currentView === 'profile' && currentUser && !currentUser.isAnonymous) {
    const mySkills = allSkills.filter(s => s.userId === currentUser.uid);
    mainContent.innerHTML = getProfileHTML(mySkills);
    attachProfileEventListeners(mySkills);
  } else {
    currentView = 'home';
    mainContent.innerHTML = getHomeHTML();
    renderSkills(allSkills);
    renderWorkshops(allWorkshops);
    attachHomeEventListeners();
  }
}

function getHomeHTML() {
  return `
    <header class="hero-bg h-screen flex items-center justify-center text-white">
      <div class="container mx-auto px-6 py-32 text-center z-10">
        <h1 class="text-4xl md:text-6xl font-bold leading-tight mb-4">Unlock Your Potential.</h1>
        <h2 class="text-xl md:text-2xl mb-8 font-light">Exchange skills and services with people in your community.</h2>
        <a href="#browse" class="bg-white text-indigo-600 font-semibold px-8 py-3 rounded-full hover:bg-gray-200 transition duration-300 text-lg btn-glow">Start Swapping</a>
      </div>
    </header>
    <section id="how-it-works" class="py-20">
      <div class="container mx-auto px-6 text-center">
        <h2 class="text-3xl font-bold mb-2">How It Works</h2>
        <div class="grid md:grid-cols-3 gap-8 mt-12">
          <div class="bg-white p-8 rounded-lg shadow-md">
            <div class="text-5xl text-indigo-600 mb-4"><i class="fas fa-search"></i></div>
            <h3 class="text-xl font-semibold mb-2">1. Find a Skill</h3>
            <p class="text-gray-600">Browse our listings to find a skill you want to learn or a service you need.</p>
          </div>
          <div class="bg-white p-8 rounded-lg shadow-md">
            <div class="text-5xl text-indigo-600 mb-4"><i class="fas fa-handshake"></i></div>
            <h3 class="text-xl font-semibold mb-2">2. Make a Swap</h3>
            <p class="text-gray-600">Connect with a user and offer a skill or service in return.</p>
          </div>
          <div class="bg-white p-8 rounded-lg shadow-md">
            <div class="text-5xl text-indigo-600 mb-4"><i class="fas fa-users"></i></div>
            <h3 class="text-xl font-semibold mb-2">3. Grow Your Community</h3>
            <p class="text-gray-600">Learn, share, and connect with local talent.</p>
          </div>
        </div>
      </div>
    </section>

    <section id="browse" class="py-20 bg-gray-100">
      <div class="container mx-auto px-6">
        <h2 class="text-3xl font-bold text-center mb-12">Browse Skills & Services</h2>
        <div class="flex justify-center mb-8">
          <div class="relative w-full max-w-lg">
            <input type="text" id="search-bar" class="w-full px-4 py-3 border rounded-full" placeholder="Search for skills...">
            <i class="fas fa-search absolute right-0 top-0 mt-4 mr-4 text-gray-500"></i>
          </div>
        </div>
        <div id="skills-grid" class="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8"></div>
      </div>
    </section>

    <section id="workshops" class="py-20">
      <div class="container mx-auto px-6">
        <h2 class="text-3xl font-bold text-center mb-12">Local Workshops & Events</h2>
        <div id="workshops-grid" class="grid md:grid-cols-2 lg:grid-cols-3 gap-8"></div>
      </div>
    </section>

    <section id="ai-matcher" class="py-20 bg-gray-100">
      <div class="container mx-auto px-6 text-center">
        <h2 class="text-3xl font-bold mb-2">AI Skill Matcher</h2>
        <p class="text-gray-600 mb-8">Let our AI suggest skills you could get in return.</p>
        <div class="max-w-xl mx-auto bg-white p-8 rounded-lg shadow-xl">
          <input type="text" id="user-skill-input" class="w-full px-4 py-3 border rounded-lg mb-6" placeholder="Enter a skill you can offer...">
          <button id="find-match-btn" class="w-full bg-indigo-600 text-white font-semibold py-3 rounded-lg btn-glow"><i class="fas fa-magic mr-2"></i>Find My Match</button>
          <div id="ai-results" class="mt-8 text-left hidden"></div>
        </div>
      </div>
    </section>

    <section id="post-skill" class="py-20">
      <div class="container mx-auto px-6 max-w-2xl">
        <div class="bg-white p-8 rounded-lg shadow-lg">
          <h2 class="text-3xl font-bold text-center mb-8">Share Your Talent</h2>
          <form id="post-skill-form"></form>
        </div>
      </div>
    </section>
  `;
}

function getProfileHTML(mySkills) {
  return `
    <div class="py-20 bg-gray-50">
      <div class="container mx-auto px-6">
        <div class="text-center mb-6">
          <div class="flex items-center justify-center space-x-6 mb-4">
            <img id="profile-avatar" src="${currentUser?.avatarUrl || defaultAvatarFor()}" class="avatar-lg" alt="avatar">
            <div>
              <h1 class="text-4xl font-bold">${currentUser.displayName || currentUser.email}</h1>
              <p class="text-gray-600 mt-1">${currentUser.email || ''}</p>
              <p class="text-sm text-gray-500 mt-2">${currentUser.bio || ''}</p>
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
              <div>
                <div class="text-xs text-gray-500">Display name</div>
                <div class="font-medium">${currentUser.displayName || ''}</div>
              </div>
              <div>
                <div class="text-xs text-gray-500">Location</div>
                <div class="font-medium">${currentUser.location || ''}</div>
              </div>
              <div>
                <div class="text-xs text-gray-500">Phone</div>
                <div class="font-medium">${currentUser.phone || ''}</div>
              </div>
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

function renderSkills(skillsToRender, containerId = 'skills-grid') {
  const grid = document.getElementById(containerId);
  if (!grid) return;
  grid.innerHTML = skillsToRender.length > 0
    ? skillsToRender.map(skill => {
      const avatar = skill.userAvatar || skill.avatarUrl || defaultAvatarFor();
      return `
        <div class="bg-white p-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer skill-card" data-id="${skill.id}">
          <div class="flex items-center mb-4">
            <div class="text-3xl text-indigo-600 mr-4"><i class="fas ${iconMap[skill.category] || iconMap.Default}"></i></div>
            <div>
              <h3 class="text-xl font-semibold">${skill.title}</h3>
              <div class="text-sm text-gray-700 mb-2 flex items-center space-x-3">
                <img src="${avatar}" class="avatar-inline" alt="avatar">
                <div>
                  <div class="font-semibold">${skill.displayName || skill.userName || "No Name"}</div>
                  <div>${skill.userEmail || ""}</div>
                </div>
              </div>
            </div>
          </div>
          <p class="text-gray-600">${skill.description ? skill.description.substring(0, 100) + '...' : ''}</p>
        </div>`;
    }).join('')
    : `<p class="col-span-full text-center">${containerId === 'skills-grid' ? 'No skills found.' : ''}</p>`;
}

function renderWorkshops(workshopsToRender) {
  const grid = document.getElementById('workshops-grid');
  if (!grid) return;
  grid.innerHTML = workshopsToRender.map(w => {
    const avatar = w.organizerAvatar || defaultAvatarFor();
    return `
      <div class="bg-white rounded-lg shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 cursor-pointer overflow-hidden workshop-card" data-id="${w.id}">
        <div class="p-6">
          <div class="flex items-center justify-between mb-4">
            <p class="text-sm font-semibold text-indigo-500">${w.date?.toDate ? new Date(w.date.toDate()).toLocaleDateString() : 'Date TBD'}</p>
            <div class="flex items-center space-x-3">
              <img src="${avatar}" class="avatar-inline" alt="avatar">
              <div class="text-sm text-gray-600">${w.organizerEmail}</div>
            </div>
          </div>
          <h3 class="text-xl font-bold">${w.title}</h3>
          <p class="text-gray-600 text-sm mb-4">${w.description}</p>
        </div>
      </div>`;
  }).join('');
}

function renderModal(content) {
  modalContainer.innerHTML = `
    <div id="modal-backdrop" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-lg relative modal-content">
        <button data-action="close-modal" class="absolute top-4 right-4 text-gray-600 text-2xl">&times;</button>
        ${content}
      </div>
    </div>
  `;
  modalContainer.querySelector('#modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });
  modalContainer.querySelector('[data-action="close-modal"]').addEventListener('click', closeModal);
}

async function openNotificationsModal() {
  if (!currentUser) {
    showAuthModal('login');
    return;
  }

  const content = `
    <div class="p-4">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-bold">Notifications</h2>
        <div>
          <button id="mark-all-read-btn" class="text-sm text-indigo-600 mr-3">Mark all read</button>
          <button data-action="close-modal" class="text-sm text-gray-600">Close</button>
        </div>
      </div>
      <div id="notifs-list" class="max-h-96 overflow-auto">
        ${notifications.length === 0 ? `<div class="p-4 text-center text-gray-500">No notifications</div>` : notifications.map(n => `
          <div class="p-3 border-b flex items-start space-x-3 ${n.read ? 'opacity-70' : ''}" data-notif-id="${n.id}">
            <img src="${n.fromUserAvatar || defaultAvatarFor()}" class="avatar-inline" alt="avatar">
            <div class="flex-1">
              <div class="flex justify-between items-start">
                <div>
                  <div class="text-sm font-semibold">${n.fromUserName || 'Someone'}</div>
                  <div class="text-xs text-gray-600">${n.type === 'message' ? 'New message' : n.type}</div>
                </div>
                <div class="text-xs text-gray-400">${n.timestamp?.toDate ? new Date(n.timestamp.toDate()).toLocaleString() : (n.timestamp ? new Date(n.timestamp).toLocaleString() : '')}</div>
              </div>
              <div class="text-sm text-gray-800 mt-2">${n.textPreview ? (n.textPreview.length > 140 ? n.textPreview.substring(0,137) + '...' : n.textPreview) : ''}</div>
              <div class="mt-3">
                <button class="open-chat-btn bg-indigo-600 text-white px-3 py-1 rounded" data-from="${n.fromUserId || ''}" data-id="${n.id}">Open Chat</button>
                <button class="mark-read-btn text-sm text-gray-600 ml-3" data-id="${n.id}">${n.read ? 'Read' : 'Mark read'}</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  renderModal(content);

  document.getElementById('mark-all-read-btn')?.addEventListener('click', async () => {
    const toMark = notifications.filter(n => !n.read);
    await Promise.all(toMark.map(n => setDoc(doc(db, `/artifacts/${appId}/users/${currentUser.uid}/notifications/${n.id}`), { read: true }, { merge: true })));
  });

  document.querySelectorAll('.open-chat-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const fromId = btn.dataset.from;
      const notifId = btn.dataset.id;
      if (!fromId) {
        alert('No chat target found for this notification.');
        return;
      }
      try {
        await setDoc(doc(db, `/artifacts/${appId}/users/${currentUser.uid}/notifications/${notifId}`), { read: true }, { merge: true });
      } catch (err) { console.warn(err); }
      closeModal();
      openChatModal(fromId);
    });
  });

  document.querySelectorAll('.mark-read-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = btn.dataset.id;
      if (!id) return;
      try {
        await setDoc(doc(db, `/artifacts/${appId}/users/${currentUser.uid}/notifications/${id}`), { read: true }, { merge: true });
      } catch (err) { console.warn(err); }
    });
  });
}

async function openChatModal(targetUserId) {
  if (!currentUser) {
    showAuthModal('login');
    return;
  }
  const chatId = [currentUser.uid, targetUserId].sort().join('_');

  let otherName = 'Chat';
  let otherAvatar = defaultAvatarFor();
  try {
    const otherDoc = await getDoc(doc(db, `/artifacts/${appId}/users/${targetUserId}`));
    if (otherDoc.exists()) {
      const d = otherDoc.data();
      otherName = d.displayName || d.email?.split('@')[0] || 'User';
      otherAvatar = d.avatarUrl || defaultAvatarFor();
    }
  } catch (err) {
    console.warn('Could not fetch other user name/avatar:', err);
  }

  renderModal(`
    <div class="p-4">
      <div class="flex items-center space-x-3 mb-4">
        <img src="${otherAvatar}" class="avatar-inline" alt="avatar">
        <h2 class="text-xl font-bold">Chat with ${otherName}</h2>
      </div>
      <div id="chat-history" class="mb-4 h-64 overflow-y-auto bg-gray-100 rounded-lg p-3"></div>
      <form id="chat-form" class="flex">
        <input id="chat-input" class="flex-1 border rounded-l px-3 py-2" placeholder="Type a message..." required>
        <button type="submit" class="bg-indigo-600 text-white px-5 py-2 rounded-r">Send</button>
      </form>
    </div>
  `);

  const chatRef = collection(db, "chats", chatId, "messages");
  const chatHistory = document.getElementById('chat-history');
  const q = query(chatRef, orderBy("timestamp"));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    chatHistory.innerHTML = snapshot.docs.map(doc => {
      const m = doc.data();
      const senderName = m.senderName || (m.senderId === currentUser.uid ? (currentUser.displayName || currentUser.email.split('@')[0]) : m.senderId);
      const senderAvatar = m.senderAvatar || (m.senderId === currentUser.uid ? currentUser.avatarUrl : defaultAvatarFor());
      const alignClass = m.senderId === currentUser.uid ? "justify-end" : "justify-start";
      return `<div class="mb-3 flex ${alignClass} items-end space-x-3 ${m.senderId === currentUser.uid ? 'flex-row-reverse' : ''}">
                <img src="${senderAvatar}" class="avatar-inline" alt="avatar">
                <div>
                  <div class="text-xs text-gray-500 mb-1">${senderName}</div>
                  <div class="bg-white px-3 py-2 rounded shadow">${m.text}</div>
                  <div class="text-xs text-gray-400 mt-1">${m.timestamp?.toDate ? new Date(m.timestamp.toDate()).toLocaleTimeString() : ''}</div>
                </div>
              </div>`;
    }).join('');
    chatHistory.scrollTop = chatHistory.scrollHeight;
  });

  document.getElementById('chat-form').onsubmit = async (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const senderNameToStore = currentUser.displayName || currentUser.email.split('@')[0] || 'User';
    const senderAvatarToStore = currentUser.avatarUrl || defaultAvatarFor();
    const textToSend = input.value;
    try {
      await addDoc(chatRef, {
        text: textToSend,
        senderId: currentUser.uid,
        senderName: senderNameToStore,
        senderAvatar: senderAvatarToStore,
        timestamp: new Date()
      });

      // create a notification for the other user
      if (targetUserId && targetUserId !== currentUser.uid) {
        try {
          await addDoc(collection(db, `/artifacts/${appId}/users/${targetUserId}/notifications`), {
            type: 'message',
            chatId,
            fromUserId: currentUser.uid,
            fromUserName: senderNameToStore,
            fromUserAvatar: senderAvatarToStore,
            textPreview: textToSend.substring(0, 200),
            timestamp: new Date(),
            read: false
          });
        } catch (notifErr) {
          console.warn('Failed to create notification:', notifErr);
        }
      }

    } catch (err) {
      console.error('Error sending message:', err);
    }
    input.value = '';
  };

  document.querySelector('[data-action="close-modal"]').onclick = () => {
    unsubscribe();
    closeModal();
  };
}

function closeModal() {
  modalContainer.innerHTML = '';
}

function attachHomeEventListeners() {
  document.getElementById('search-bar')?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allSkills.filter(s => s.title.toLowerCase().includes(term) || (s.description && s.description.toLowerCase().includes(term)));
    renderSkills(filtered);
  });

  document.getElementById('skills-grid')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('chat-btn')) {
      const uid = e.target.getAttribute('data-uid');
      openChatModal(uid);
      return;
    }
    if (e.target.classList.contains('email-btn')) {
      const email = e.target.getAttribute('data-email');
      if (email) window.location.href = `mailto:${email}`; else alert('No email found for this user!');
      return;
    }
    const card = e.target.closest('.skill-card');
    if (card) {
      const skill = allSkills.find(s => s.id === card.dataset.id);
      showSkillDetailsModal(skill);
    }
  });

  document.getElementById('workshops-grid')?.addEventListener('click', (e) => {
    const card = e.target.closest('.workshop-card');
    if (card) {
      const workshop = allWorkshops.find(w => w.id === card.dataset.id);
      showWorkshopDetailsModal(workshop);
    }
  });

  document.getElementById('find-match-btn')?.addEventListener('click', handleFindMatch);
  renderPostSkillForm();
}

function attachProfileEventListeners(mySkills) {
  document.getElementById('my-skills-grid')?.addEventListener('click', (e) => {
    const card = e.target.closest('.skill-card');
    if (card) {
      const skill = mySkills.find(s => s.id === card.dataset.id);
      showSkillDetailsModal(skill);
    }
  });

  renderSkills(mySkills, 'my-skills-grid');

  // Avatar upload & edit handlers (attached only when profile rendered)
  const chooseBtn = document.getElementById('choose-avatar-btn');
  const fileInput = document.getElementById('avatar-file-input');
  const uploadBtn = document.getElementById('upload-avatar-btn');
  const statusEl = document.getElementById('avatar-status');
  const profileAvatarImg = document.getElementById('profile-avatar');
  const progressContainer = document.getElementById('avatar-progress-container');
  const progressBar = document.getElementById('avatar-progress');
  const progressText = document.getElementById('avatar-progress-text');

  if (chooseBtn && fileInput) {
    chooseBtn.onclick = () => fileInput.click();
  }

  if (fileInput) {
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      if (profileAvatarImg) profileAvatarImg.src = url;
      if (statusEl) statusEl.textContent = 'Ready to upload';
    };
  }

  if (uploadBtn) {
    uploadBtn.onclick = async () => {
      const file = fileInput?.files?.[0];
      if (!file) {
        if (statusEl) statusEl.textContent = 'No file selected';
        return;
      }
      if (!currentUser || !currentUser.uid) {
        if (statusEl) statusEl.textContent = 'Not authenticated';
        return;
      }

      uploadBtn.disabled = true;
      chooseBtn.disabled = true;
      if (statusEl) statusEl.textContent = 'Starting upload...';
      if (progressContainer) progressContainer.classList.remove('hidden');
      if (progressBar) progressBar.style.width = '0%';
      if (progressText) progressText.textContent = '';

      try {
        const safeName = file.name.replace(/[^\w.-]/g, '_');
        const avatarPath = `artifacts/${appId}/users/${currentUser.uid}/avatar-${Date.now()}-${safeName}`;
        const avatarRef = sRef(storage, avatarPath);

        const uploadTask = uploadBytesResumable(avatarRef, file, { contentType: file.type || 'image/*' });

        uploadTask.on('state_changed',
          (snapshot) => {
            const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            if (progressBar) progressBar.style.width = percent + '%';
            if (progressText) progressText.textContent = percent + '%';
            if (statusEl) statusEl.textContent = `Uploading... ${percent}%`;
          },
          (error) => {
            console.error('Upload failed:', error);
            if (statusEl) statusEl.textContent = `Upload failed: ${error.code || error.message}`;
            uploadBtn.disabled = false;
            chooseBtn.disabled = false;
          },
          async () => {
            try {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              await setDoc(doc(db, `/artifacts/${appId}/users/${currentUser.uid}`), { avatarUrl: url }, { merge: true });
              currentUser.avatarUrl = url;
              renderApp();
              if (statusEl) statusEl.textContent = 'Avatar uploaded!';
              if (progressText) progressText.textContent = 'Completed';
            } catch (err) {
              console.error('Post-upload steps failed:', err);
              if (statusEl) statusEl.textContent = `Upload saved but post-update failed: ${err.code || err.message}`;
            } finally {
              uploadBtn.disabled = false;
              chooseBtn.disabled = false;
              setTimeout(()=> { if (statusEl) statusEl.textContent = ''; }, 2500);
            }
          }
        );
      } catch (err) {
        console.error('Unexpected upload error', err);
        if (statusEl) statusEl.textContent = 'Unexpected upload error';
        uploadBtn.disabled = false;
        chooseBtn.disabled = false;
        if (progressContainer) progressContainer.classList.add('hidden');
      }
    };
  }

  // Edit profile button
  const editBtn = document.getElementById('edit-profile-btn');
  if (editBtn) editBtn.onclick = () => showEditProfileModal();
}

function showSkillDetailsModal(skill) {
  const isOwn = currentUser && skill.userId === currentUser.uid;
  const avatar = skill.userAvatar || skill.avatarUrl || defaultAvatarFor();
  renderModal(`
    <div class="p-8">
      <div class="flex items-center space-x-4 mb-4">
        <img src="${avatar}" class="avatar-inline" alt="avatar">
        <div>
          <h2 class="text-3xl font-bold mb-1">${skill.title}</h2>
          <div class="text-sm text-gray-500">by ${skill.displayName || skill.userEmail}</div>
        </div>
      </div>
      <p class="text-gray-700 mb-4">${skill.description}</p>
      <p class="mt-4 font-semibold mb-6">Wants: ${skill.wanted || 'Open to offers'}</p>
      <div class="flex space-x-4 justify-end contact-section-modal">
        ${!isOwn ? `<button class="chat-btn bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded" data-uid="${skill.userId}">Chat</button>` : ''}
        ${!isOwn && skill.userEmail ? `<button class="email-btn bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded" data-email="${skill.userEmail}">Email</button>` : ''}
      </div>
    </div>
  `);

  const chatBtn = document.querySelector('.chat-btn');
  if (chatBtn) {
    chatBtn.addEventListener('click', () => openChatModal(skill.userId));
  }
  const emailBtn = document.querySelector('.email-btn');
  if (emailBtn) {
    emailBtn.addEventListener('click', () => {
      const email = skill.userEmail;
      if (email) window.location.href = `mailto:${email}`; else alert('No email found for this user!');
    });
  }
}

function showWorkshopDetailsModal(workshop) {
  const avatar = workshop.organizerAvatar || defaultAvatarFor();
  renderModal(`
    <div class="p-8">
      <div class="flex items-center space-x-3 mb-4">
        <img src="${avatar}" class="avatar-inline" alt="avatar">
        <h2 class="text-3xl font-bold">${workshop.title}</h2>
      </div>
      <p class="text-md text-gray-500 mb-4">by ${workshop.organizerEmail}</p>
      <p class="text-gray-700">${workshop.description}</p>
    </div>
  `);
}

function showAuthModal(type) {
  renderModal(`
    <div class="p-8">
      <h2 class="text-3xl font-bold text-center mb-6">${type === 'login' ? 'Login' : 'Sign Up'}</h2>
      <form id="auth-form">
        ${type === 'signup' ? '<input name="displayName" type="text" placeholder="Display Name" class="w-full p-2 border rounded mb-4" required>' : ''}
        <input name="email" type="email" placeholder="Email" class="w-full p-2 border rounded mb-4" required>
        <input name="password" type="password" placeholder="Password" class="w-full p-2 border rounded mb-6" required>
        <button id="auth-btn" type="submit" class="w-full bg-indigo-600 text-white py-3 rounded-lg btn-glow">${type}</button>
        <div id="auth-loading" class="hidden text-center mt-2"><i class="fas fa-spinner fa-spin"></i> Loading...</div>
        <p id="auth-error" class="text-red-500 text-center mt-4 h-4"></p>
      </form>
    </div>
  `);

  document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { email, password, displayName } = Object.fromEntries(new FormData(e.target));
    const errorEl = document.getElementById('auth-error');
    const loadingEl = document.getElementById('auth-loading');
    const btn = document.getElementById('auth-btn');
    try {
      btn.disabled = true;
      loadingEl.classList.remove('hidden');
      errorEl.textContent = '';
      if (type === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const nameToStore = displayName || email.split('@')[0];
        const avatarUrl = defaultAvatarFor();
        await setDoc(doc(db, `/artifacts/${appId}/users/${cred.user.uid}`), {
          email,
          displayName: nameToStore,
          avatarUrl,
          createdAt: new Date()
        });
      }
      closeModal();
    } catch (err) {
      errorEl.textContent = err.message.replace('Firebase: ', '');
    } finally {
      btn.disabled = false;
      loadingEl.classList.add('hidden');
    }
  });
}

function renderPostSkillForm() {
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
    <button type="submit" class="w-full bg-green-500 text-white font-semibold py-3 rounded-lg btn-glow">Post Skill</button>
    <p id="post-skill-status" class="text-center mt-4 h-5"></p>
  `;
  formContainer.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser || currentUser.isAnonymous) {
      showAuthModal('login');
      return;
    }
    const statusEl = document.getElementById('post-skill-status');
    const formData = Object.fromEntries(new FormData(e.target));
    try {
      await addDoc(collection(db, `/artifacts/${appId}/public/data/skills`), {
        ...formData,
        userId: currentUser.uid,
        userEmail: currentUser.email,
        displayName: currentUser.displayName || currentUser.email.split('@')[0],
        userAvatar: currentUser.avatarUrl || defaultAvatarFor(),
        createdAt: new Date(),
      });
      statusEl.textContent = 'Skill Posted!';
      statusEl.className = 'text-center mt-4 h-5 text-green-500';
      e.target.reset();
    } catch (err) {
      statusEl.textContent = 'Error posting skill.';
      statusEl.className = 'text-center mt-4 h-5 text-red-500';
    }
    setTimeout(() => statusEl.textContent = '', 3000);
  });
}

function handleFindMatch() {
  if (!currentUser) {
    showAuthModal('login');
    return;
  }
  const input = document.getElementById('user-skill-input');
  const resultsDiv = document.getElementById('ai-results');
  if (!input.value.trim()) {
    alert('Please enter a skill.');
    return;
  }
  resultsDiv.classList.remove('hidden');
  resultsDiv.innerHTML = `<div class="text-center p-4">Finding matches... <span class="blinking-cursor border-r-2 border-orange-500"></span></div>`;

  const userSkill = input.value.trim().toLowerCase();
  let matchingSkills = allSkills.filter(skill =>
    skill.userId !== currentUser.uid &&
    skill.wanted &&
    skill.wanted.toLowerCase().includes(userSkill)
  );

  if (matchingSkills.length === 0) {
    matchingSkills = allSkills.filter(skill => skill.userId !== currentUser.uid);
    matchingSkills = matchingSkills.sort(() => 0.5 - Math.random()).slice(0, 3);
  } else {
    matchingSkills = matchingSkills.sort(() => 0.5 - Math.random()).slice(0, 3);
  }

  if (matchingSkills.length === 0) {
    resultsDiv.innerHTML = `<p class="text-red-500">No matches found. Try again later.</p>`;
    return;
  }
  resultsDiv.innerHTML = `<h3 class="text-xl font-semibold mb-4">Suggested swaps:</h3>
    <div class="space-y-4">
    ${matchingSkills.map(skill => `
      <div class="p-4 bg-gray-100 rounded-lg">
        <span class="font-bold">${skill.title}</span><br>
        <span class="text-gray-600">${skill.description ? skill.description.substring(0, 100) : ''}...</span><br>
        <span>Wanted: ${skill.wanted || 'Anything'}</span><br>
        <div class="flex items-center space-x-3 mt-2">
          <img src="${skill.userAvatar || skill.avatarUrl || defaultAvatarFor()}" class="avatar-inline" alt="avatar">
          <span>By: ${skill.displayName || skill.userEmail}</span>
        </div>
        <button class="connect-btn text-blue-600 underline mt-2" data-email="${skill.userEmail}">Connect</button>
      </div>
    `).join('')}
    </div>`;

  resultsDiv.onclick = function (e) {
    if (e.target.classList.contains('connect-btn')) {
      const email = e.target.getAttribute('data-email');
      if (email) window.location.href = `mailto:${email}`; else alert('No email found for this user!');
    }
  };
}

// Edit profile modal + save
async function showEditProfileModal() {
  if (!currentUser) {
    showAuthModal('login');
    return;
  }

  const displayName = currentUser.displayName || '';
  const bio = currentUser.bio || '';
  const location = currentUser.location || '';
  const phone = currentUser.phone || '';
  const email = currentUser.email || '';

  renderModal(`
    <div class="p-6">
      <h2 class="text-xl font-bold mb-4">Edit Profile</h2>
      <form id="edit-profile-form" class="space-y-4">
        <div>
          <label class="text-sm text-gray-600">Display name</label>
          <input name="displayName" type="text" value="${escapeHtml(displayName)}" class="w-full mt-1 p-2 border rounded" />
        </div>
        <div>
          <label class="text-sm text-gray-600">Bio</label>
          <textarea name="bio" rows="3" class="w-full mt-1 p-2 border rounded">${escapeHtml(bio)}</textarea>
        </div>
        <div class="grid md:grid-cols-2 gap-4">
          <div>
            <label class="text-sm text-gray-600">Location</label>
            <input name="location" type="text" value="${escapeHtml(location)}" class="w-full mt-1 p-2 border rounded" />
          </div>
          <div>
            <label class="text-sm text-gray-600">Phone</label>
            <input name="phone" type="text" value="${escapeHtml(phone)}" class="w-full mt-1 p-2 border rounded" />
          </div>
        </div>
        <div>
          <label class="text-sm text-gray-600">Email (read-only)</label>
          <input name="email" type="email" value="${escapeHtml(email)}" class="w-full mt-1 p-2 border rounded bg-gray-100" readonly />
          <p class="text-xs text-gray-500 mt-1">To change your login email you must reauthenticate. We can add that flow if you want.</p>
        </div>

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
    const form = e.target;
    const formData = Object.fromEntries(new FormData(form));
    const updates = {
      displayName: (formData.displayName || '').trim(),
      bio: (formData.bio || '').trim(),
      location: (formData.location || '').trim(),
      phone: (formData.phone || '').trim()
    };

    try {
      btn.disabled = true;
      statusEl.textContent = 'Saving...';
      await setDoc(doc(db, `/artifacts/${appId}/users/${currentUser.uid}`), updates, { merge: true });
      currentUser = { ...currentUser, ...updates };
      renderApp();
      statusEl.textContent = 'Profile updated';
      setTimeout(() => closeModal(), 700);
    } catch (err) {
      console.error('Failed to update profile', err);
      statusEl.textContent = 'Failed to save. ' + (err.message || '');
    } finally {
      btn.disabled = false;
    }
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// --- INITIAL RENDER ---
renderApp();
