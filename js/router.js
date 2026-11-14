import { state } from './state.js';

const viewMap = {
  auth: document.getElementById('auth-section'),
  dashboard: document.getElementById('dashboard-section'),
  detail: document.getElementById('deck-detail-section'),
  study: document.getElementById('study-section'),
  creator: document.getElementById('creator-section'),
  class: document.getElementById('class-detail-section')
};

// 循環参照を避けるための画面ハンドラ登録
const handlers = {};
export function registerRouteHandlers(newHandlers) {
  Object.assign(handlers, newHandlers);
}

export function updateUrlParams(paramsObj, replace = false) {
  const url = new URL(window.location.href);
  ['deck', 'share', 'mode', 'user', 'class', 'join_class'].forEach(k => url.searchParams.delete(k));

  Object.entries(paramsObj).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') {
      url.searchParams.set(k, v);
    }
  });

  if (replace) {
    window.history.replaceState({}, '', url);
  } else {
    window.history.pushState({}, '', url);
  }
}

export function showView(viewName) {
  Object.values(viewMap).forEach(el => el && el.classList.add('hidden'));
  if (viewMap[viewName]) {
    viewMap[viewName].classList.remove('hidden');
  }
  if (viewName === 'dashboard' && handlers.onShowDashboard) {
    handlers.onShowDashboard();
  }
}

export async function routeFromCurrentUrl() {
  const params = new URLSearchParams(window.location.search);
  const joinClassCode = params.get('join_class');
  const classId = params.get('class');
  const creatorUserId = params.get('user');
  const shareId = params.get('share');
  const deckId = params.get('deck');
  const mode = params.get('mode');

  if (joinClassCode && handlers.joinClassWithCode) {
    await handlers.joinClassWithCode(joinClassCode);
  } else if (classId && handlers.openClassPage) {
    await handlers.openClassPage(classId, true);
  } else if (creatorUserId && handlers.openCreatorPage) {
    await handlers.openCreatorPage(creatorUserId, true);
  } else if (shareId && handlers.openDeckByShareId) {
    await handlers.openDeckByShareId(shareId, mode);
  } else if (deckId && handlers.openDeck) {
    await handlers.openDeck(deckId, mode, true);
  } else {
    showView('dashboard');
  }
}

export function initRouterEvents() {
  window.addEventListener('popstate', async () => {
    if (state.currentUser) {
      await routeFromCurrentUrl();
    }
  });

  const goHome = () => {
    if (!state.currentUser) return;
    state.currentDeck = null;
    state.currentClass = null;
    updateUrlParams({});
    showView('dashboard');
  };

  document.getElementById('home-logo').addEventListener('click', goHome);
  document.getElementById('back-to-dashboard-btn').addEventListener('click', goHome);
  document.getElementById('creator-back-btn').addEventListener('click', goHome);
  document.getElementById('class-back-btn').addEventListener('click', goHome);
}
