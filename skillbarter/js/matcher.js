import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { requireAuth } from './auth.js';

const UNICODE_PUNCT = new RegExp(
  '[' +
  String.fromCharCode(0x2000) + '-' + String.fromCharCode(0x206F) +
  String.fromCharCode(0x2E00) + '-' + String.fromCharCode(0x2E7F) +
  ']',
  'g'
);
const ASCII_PUNCT = /[\\'!"#$%&()*+,\-.\/:;<=>?@[\]^_`{|}~]/g;

function normalize(text) {
  return (text || '')
    .toLowerCase()
    .replace(UNICODE_PUNCT, ' ')
    .replace(ASCII_PUNCT, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  if (!a || !b) return Math.max(a?.length || 0, b?.length || 0);
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

const SYNONYMS = {
  gaming: ['gaming', 'game', 'games', 'gameplay', 'unity', 'unreal', 'game dev', 'game-dev'],
  design: ['design', 'ux', 'ui', 'graphic', 'graphics', 'photoshop'],
  coding: ['code', 'coding', 'programming', 'developer', 'development', 'dev', 'javascript', 'python', 'java'],
  web: ['web', 'website', 'react', 'vue', 'angular', 'frontend', 'backend', 'fullstack', 'wordpress'],
  ai: ['ai', 'machine learning', 'ml', 'artificial intelligence', 'tensorflow'],
  music: ['music', 'audio', 'mixing', 'production', 'beat'],
  language: ['language', 'english', 'spanish', 'french']
};

function expandSynonyms(input) {
  const words = normalize(input).split(' ').filter(Boolean);
  const expanded = new Set(words);
  for (const w of words) if (SYNONYMS[w]) SYNONYMS[w].forEach(s => expanded.add(s));
  return Array.from(expanded);
}

function computeMatchScore(skill, userTerms) {
  const weights = { wanted: 4, title: 3, description: 2, category: 2, tags: 3 };
  let score = 0;
  const title = normalize(skill.title || '');
  const description = normalize(skill.description || '');
  const wanted = normalize(skill.wanted || '');
  const category = normalize(skill.category || '');
  const tags = (skill.tags || []).map(t => normalize(t));
  for (const term of userTerms) {
    if (wanted.includes(term)) score += weights.wanted;
    if (title.includes(term)) score += weights.title;
    if (description.includes(term)) score += weights.description;
    if (category.includes(term)) score += weights.category;
    if (tags.some(t => t.includes(term))) score += weights.tags;
    const fuzzyThreshold = 2;
    const skillTextTokens = (title + ' ' + description + ' ' + wanted + ' ' + category).split(' ').filter(Boolean);
    for (const token of skillTextTokens) {
      const dist = levenshtein(term, token);
      if (dist <= fuzzyThreshold && Math.abs(token.length - term.length) <= 4) { score += 1; break; }
    }
  }
  if (userTerms.includes('gaming') || userTerms.includes('game')) {
    if (wanted.includes('game') || title.includes('game') || description.includes('game') || category.includes('game')) score += 2;
  }
  return score;
}

export function handleFindMatch() {
  if (!requireAuth()) return;
  const input = document.getElementById('user-skill-input');
  const resultsDiv = document.getElementById('ai-results');
  if (!input.value.trim()) { alert('Please enter a skill.'); return; }
  resultsDiv.classList.remove('hidden');
  resultsDiv.innerHTML = `<div class="text-center p-4">Finding matches... <span class="blinking-cursor border-r-2 border-orange-500"></span></div>`;

  const userTerms = expandSynonyms(input.value.trim().toLowerCase());
  const scored = state.allSkills
    .filter(s => s.userId !== state.currentUser.uid)
    .map(skill => ({ skill, score: computeMatchScore(skill, userTerms) }));
  let matching = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score);

  if (matching.length === 0) {
    const term = normalize(input.value.trim());
    matching = state.allSkills
      .filter(s => s.userId !== state.currentUser.uid)
      .map(skill => {
        const combined = normalize((skill.title || '') + ' ' + (skill.description || '') + ' ' + (skill.wanted || '') + ' ' + (skill.category || ''));
        return { skill, score: combined.includes(term) ? 1 : 0 };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  if (matching.length === 0) {
    matching = state.allSkills
      .filter(s => s.userId !== state.currentUser.uid)
      .sort(() => 0.5 - Math.random())
      .slice(0, 3)
      .map(s => ({ skill: s, score: 0 }));
  }

  const top = matching.slice(0, 3).map(m => m.skill);
  if (top.length === 0) { resultsDiv.innerHTML = `<p class="text-red-500">No matches found.</p>`; return; }

  resultsDiv.innerHTML = `<h3 class="text-xl font-semibold mb-4">Suggested swaps:</h3><div class="space-y-4">${top.map(skill => `<div class="p-4 bg-gray-100 rounded-lg"><span class="font-bold">${escapeHtml(skill.title)}</span><br><span class="text-gray-600">${escapeHtml(skill.description ? skill.description.substring(0, 100) : '')}...</span><br><span>Wanted: ${escapeHtml(skill.wanted || 'Anything')}</span><br><span>By: ${escapeHtml(skill.displayName || skill.userEmail)}</span><br><button class="connect-btn text-blue-600 underline mt-2" data-email="${escapeHtml(skill.userEmail)}">Connect</button></div>`).join('')}</div>`;
  resultsDiv.onclick = (e) => {
    if (e.target.classList.contains('connect-btn')) {
      const email = e.target.getAttribute('data-email');
      if (email) window.location.href = `mailto:${email}`;
      else alert('No email found');
    }
  };
}
