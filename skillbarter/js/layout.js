import { state } from './state.js';
import { auth, signOut } from './firebase.js';
import { defaultAvatarFor } from './utils.js';
import { renderSkills, renderPostSkillForm, showSkillDetailsModal } from './skills.js';
import { renderWorkshops, showWorkshopDetailsModal } from './workshops.js';
import { renderCommunity } from './community.js';
import { getProfileHTML, attachProfileEventListeners } from './profile.js';
import { openNotificationsModal } from './notifications.js';
import { showAuthModal } from './auth.js';
import { openChatModal } from './chat.js';
import { handleFindMatch } from './matcher.js';

const navbar = document.getElementById('navbar');
const mainContent = document.getElementById('main-content');

export function renderApp() {
  renderNavbar();
  attachNavbarEventListeners();
  renderView();
}

export function renderNavbar() {
  const unreadCount = state.notifications.filter(n => !n.read).length;

  const authButtonsHTML = (isMobile = false) => {
    if (state.currentUser && !state.currentUser.isAnonymous) {
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

  const notifsButton = state.currentUser && !state.currentUser.isAnonymous ? `
    <div class="relative">
      <button data-action="open-notifs-modal" class="relative text-gray-600 hover:text-indigo-600 focus:outline-none">
        <i class="fas fa-bell text-2xl"></i>
        ${unreadCount > 0 ? `<span class="absolute -top-1 -right-2 bg-red-500 text-white text-xs rounded-full px-1">${unreadCount}</span>` : ''}
      </button>
    </div>` : '';

  navbar.innerHTML = `
    <div class="container mx-auto px-6 py-4 flex justify-between items-center">
      <a href="#" data-action="home" class="text-2xl font-bold text-indigo-600"><i class="fas fa-people-arrows mr-2"></i>SkillBarter AI</a>
      <div class="hidden md:flex items-center space-x-6">
        <a href="#browse" class="text-gray-600 hover:text-indigo-600">Browse</a>
        <a href="#workshops" class="text-gray-600 hover:text-indigo-600">Workshops</a>
        <a href="#ai-matcher" class="text-gray-600 hover:text-indigo-600">AI Matcher</a>
        <a href="#community" class="text-gray-600 hover:text-indigo-600">Community</a>
        <div class="flex items-center space-x-4">
          ${notifsButton}
          <div class="flex items-center space-x-3">
            ${state.currentUser ? `<img src="${state.currentUser.avatarUrl || defaultAvatarFor()}" class="avatar-inline" alt="avatar">` : ''}
            ${authButtonsHTML()}
          </div>
        </div>
      </div>
      <div class="md:hidden">
        <button data-action="toggle-menu" class="text-gray-600 focus:outline-none"><i class="fas fa-bars text-2xl"></i></button>
      </div>
    </div>
    <div id="mobile-menu" class="${state.isMenuOpen ? '' : 'hidden'} md:hidden">
      <a href="#browse" class="block px-6 py-3 text-gray-600 hover:bg-gray-100">Browse</a>
      <a href="#workshops" class="block px-6 py-3 text-gray-600 hover:bg-gray-100">Workshops</a>
      <a href="#ai-matcher" class="block px-6 py-3 text-gray-600 hover:bg-gray-100">AI Matcher</a>
      <a href="#community" class="block px-6 py-3 text-gray-600 hover:bg-gray-100">Community</a>
      ${state.currentUser && !state.currentUser.isAnonymous ? `<a href="#" data-action="profile" class="block px-6 py-3 text-gray-600 hover:bg-gray-100">My Profile</a>` : ''}
      <div class="px-6 py-3 space-y-2">${authButtonsHTML(true)}</div>
    </div>
  `;
}

export function attachNavbarEventListeners() {
  if (state.navClickHandler) navbar.removeEventListener('click', state.navClickHandler);

  state.navClickHandler = async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action) {
      switch (action) {
        case 'home': state.currentView = 'home'; renderApp(); break;
        case 'profile': state.currentView = 'profile'; renderApp(); break;
        case 'logout': signOut(auth); break;
        case 'login': showAuthModal('login'); break;
        case 'signup': showAuthModal('signup'); break;
        case 'toggle-menu': state.isMenuOpen = !state.isMenuOpen; renderNavbar(); attachNavbarEventListeners(); break;
        case 'open-notifs-modal': openNotificationsModal(); break;
      }
      return;
    }
    const link = e.target.closest('a[href^="#"]');
    if (link) {
      const id = link.getAttribute('href').replace('#', '');
      state.currentView = 'home';
      renderApp();
      setTimeout(() => { const t = document.getElementById(id); if (t) t.scrollIntoView({ behavior: 'smooth' }); }, 80);
      e.preventDefault();
      return;
    }
  };

  navbar.addEventListener('click', state.navClickHandler);
}

export function renderView() {
  if (state.currentView === 'profile' && state.currentUser && !state.currentUser.isAnonymous) {
    const mySkills = state.allSkills.filter(s => s.userId === state.currentUser.uid);
    mainContent.innerHTML = getProfileHTML(mySkills);
    attachProfileEventListeners(mySkills);
    return;
  }

  state.currentView = 'home';
  mainContent.innerHTML = getHomeHTML();
  renderSkills(state.allSkills);
  renderWorkshops(state.allWorkshops);
  attachHomeEventListeners();
}

export function getHomeHTML() {
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
            <p class="text-gray-600">Propose a swap, accept, and both users confirm — exchange completed.</p>
          </div>
          <div class="bg-white p-8 rounded-lg shadow-md">
            <div class="text-5xl text-indigo-600 mb-4"><i class="fas fa-users"></i></div>
            <h3 class="text-xl font-semibold mb-2">3. Grow Your Community</h3>
            <p class="text-gray-600">Learn, share, and connect with local talent.</p>
          </div>
        </div>
      </div>
    </section>

    <section id="browse" class="py-12 bg-gray-100">
      <div class="container mx-auto px-6">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-3xl font-bold">Browse Skills & Services</h2>
          <div class="w-1/3">
            <input id="search-bar" type="text" class="w-full px-4 py-3 border rounded-full" placeholder="Search for skills...">
          </div>
        </div>
        <div id="skills-grid" class="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8"></div>
      </div>
    </section>

    <section id="workshops" class="py-12">
      <div class="container mx-auto px-6">
        <h2 class="text-3xl font-bold text-center mb-8">Local Workshops & Events</h2>
        <div id="workshops-grid" class="grid md:grid-cols-2 lg:grid-cols-3 gap-8"></div>
      </div>
    </section>

    <section id="ai-matcher" class="py-12 bg-gray-100">
      <div class="container mx-auto px-6 text-center">
        <h2 class="text-3xl font-bold mb-4">AI Skill Matcher</h2>
        <p class="text-gray-600 mb-6">Let our AI suggest skills you could get in return.</p>
        <div class="max-w-xl mx-auto bg-white p-6 rounded-lg shadow-xl">
          <input id="user-skill-input" type="text" class="w-full px-4 py-3 border rounded-lg mb-4" placeholder="Enter a skill you can offer...">
          <button id="find-match-btn" class="w-full bg-indigo-600 text-white font-semibold py-3 rounded-lg btn-glow"><i class="fas fa-magic mr-2"></i>Find My Match</button>
          <div id="ai-results" class="mt-6 text-left hidden"></div>
        </div>
      </div>
    </section>

    <section id="community" class="py-12">
      <div class="container mx-auto px-6">
        <h2 class="text-3xl font-bold text-center mb-6">Community Q&A</h2>
        <div id="community-container" class="max-w-4xl mx-auto"></div>
      </div>
    </section>

    <section id="post-skill" class="py-12">
      <div class="container mx-auto px-6 max-w-2xl">
        <div class="bg-white p-8 rounded-lg shadow-lg">
          <h2 class="text-3xl font-bold text-center mb-4">Share Your Talent</h2>
          <form id="post-skill-form"></form>
        </div>
      </div>
    </section>
  `;
}

function attachHomeEventListeners() {
  document.getElementById('search-bar')?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = state.allSkills.filter(s =>
      (s.title || '').toLowerCase().includes(term) || (s.description || '').toLowerCase().includes(term)
    );
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
      if (email) window.location.href = `mailto:${email}`;
      return;
    }
    const card = e.target.closest('.skill-card');
    if (card) {
      const skill = state.allSkills.find(s => s.id === card.dataset.id);
      showSkillDetailsModal(skill);
    }
  });

  document.getElementById('workshops-grid')?.addEventListener('click', (e) => {
    const card = e.target.closest('.workshop-card');
    if (card) {
      const w = state.allWorkshops.find(x => x.id === card.dataset.id);
      showWorkshopDetailsModal(w);
    }
  });

  document.getElementById('find-match-btn')?.addEventListener('click', handleFindMatch);
  renderPostSkillForm();
  renderCommunity();
}
