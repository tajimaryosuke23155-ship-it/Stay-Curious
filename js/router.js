import { state } from './state.js';

let routeHandlers = {
  openDeck: null,
  openDeckByShareId: null,
  openCreatorPage: null,
  openClassPage: null,
  joinClassByCode: null,
  openFolderPage: null
};

export function registerRouteHandlers(handlers) {
  routeHandlers = { ...routeHandlers, ...handlers };
}

export function getInitialRouteFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    deckId: params.get('deck'),
    shareId: params.get('share'),
    mode: params.get('mode'),
    creatorId: params.get('creator'),
    classId: params.get('class'),
    joinCode: params.get('join'),
    folderId: params.get('folder')
  };
}

export function updateUrlParams(paramsObj, replace = false) {
  const url = new URL(window.location.href);
  url.search = '';
  Object.entries(paramsObj).forEach(([key, val]) => {
    if (val !== null && val !== undefined && val !== '') {
      url.searchParams.set(key, val);
    }
  });
  if (replace) window.history.replaceState({}, '', url);
  else window.history.pushState({}, '', url);
}

export function showView(viewName) {
  const sections = [
    'auth-section',
    'dashboard-section',
    'deck-detail-section',
    'study-section',
    'creator-section',
    'class-detail-section',
    'folder-detail-section'
  ];
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });

  const targetMap = {
    auth: 'auth-section',
    dashboard: 'dashboard-section',
    detail: 'deck-detail-section',
    study: 'study-section',
    creator: 'creator-section',
    class: 'class-detail-section',
    folder: 'folder-detail-section'
  };
  const targetEl = document.getElementById(targetMap[viewName]);
  if (targetEl) targetEl.classList.remove('hidden');
}

export function initRouterEvents() {
  window.addEventListener('popstate', async () => {
    if (!state.currentUser) return;
    const route = getInitialRouteFromUrl();
    if (route.joinCode && routeHandlers.joinClassByCode) {
      await routeHandlers.joinClassByCode(route.joinCode, true);
    } else if (route.classId && routeHandlers.openClassPage) {
      await routeHandlers.openClassPage(route.classId, true);
    } else if (route.folderId && routeHandlers.openFolderPage) {
      await routeHandlers.openFolderPage(route.folderId, true);
    } else if (route.shareId && routeHandlers.openDeckByShareId) {
      await routeHandlers.openDeckByShareId(route.shareId, route.mode);
    } else if (route.deckId && routeHandlers.openDeck) {
      await routeHandlers.openDeck(route.deckId, route.mode, true);
    } else if (route.creatorId && routeHandlers.openCreatorPage) {
      await routeHandlers.openCreatorPage(route.creatorId, true);
    } else {
      showView('dashboard');
    }
  });

  const goHome = async () => {
    if (!state.currentUser) return;
    state.currentDeck = null;
    state.currentClass = null;
    state.currentFolder = null;
    updateUrlParams({});
    showView('dashboard');
  };

  document.getElementById('home-logo').addEventListener('click', goHome);
  document.getElementById('back-to-dashboard-btn').addEventListener('click', goHome);
  document.getElementById('creator-back-btn').addEventListener('click', goHome);
  document.getElementById('class-back-btn').addEventListener('click', goHome);
  document.getElementById('folder-back-btn').addEventListener('click', goHome);
}
