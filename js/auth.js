import { supabaseClient } from './config.js';
import { state } from './state.js';
import { getInitialRouteFromUrl, updateUrlParams, showView } from './router.js';
import { loadDecks, loadSavedDecks, loadPublicDecks, loadLearningStats } from './dashboard.js';
import { openDeck, openDeckByShareId } from './deckDetail.js';
import { openCreatorPage } from './creator.js';
import { loadMyClasses, openClassPage, joinClassByCode } from './classes.js';
import { loadMyFolders, openFolderPage } from './folders.js';

export async function fetchDisplayNames(userIds) {
  const uniqueMissing = [...new Set(userIds.filter(id => id && !state.profileCache[id]))];
  if (uniqueMissing.length === 0) return;

  const { data } = await supabaseClient
    .from('profiles')
    .select('id, display_name')
    .in('id', uniqueMissing);

  (data || []).forEach(p => {
    state.profileCache[p.id] = p.display_name || 'ユーザー';
  });
  uniqueMissing.forEach(id => {
    if (!state.profileCache[id]) state.profileCache[id] = 'ユーザー';
  });
}

export async function loadCurrentUserProfile() {
  if (!state.currentUser) return;
  const fallbackName = state.currentUser.email ? state.currentUser.email.split('@')[0] : 'ユーザー';

  const { data } = await supabaseClient
    .from('profiles')
    .select('display_name')
    .eq('id', state.currentUser.id)
    .maybeSingle();

  if (data && data.display_name) {
    state.profileCache[state.currentUser.id] = data.display_name;
    document.getElementById('user-display-name').textContent = data.display_name;
  } else {
    await supabaseClient.from('profiles').upsert([{ id: state.currentUser.id, display_name: fallbackName }]);
    state.profileCache[state.currentUser.id] = fallbackName;
    document.getElementById('user-display-name').textContent = fallbackName;
  }
}

export async function handleInitialRouting() {
  const route = getInitialRouteFromUrl();
  if (route.joinCode) {
    await joinClassByCode(route.joinCode, true);
  } else if (route.classId) {
    await openClassPage(route.classId, true);
  } else if (route.folderId) {
    await openFolderPage(route.folderId, true);
  } else if (route.shareId) {
    await openDeckByShareId(route.shareId, route.mode);
  } else if (route.deckId) {
    await openDeck(route.deckId, route.mode, true);
  } else if (route.creatorId) {
    await openCreatorPage(route.creatorId, true);
  } else {
    showView('dashboard');
    await Promise.all([
      loadDecks(),
      loadMyFolders(),
      loadMyClasses(),
      loadSavedDecks(),
      loadPublicDecks(),
      loadLearningStats()
    ]);
  }
}

export function initAuthEvents() {
  document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    if (!email || !password) return alert('メールアドレスとパスワードを入力してください');

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) alert(`ログイン失敗: ${error.message}`);
  });

  document.getElementById('signup-btn').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    if (!email || !password) return alert('メールアドレスとパスワードを入力してください');

    const { error } = await supabaseClient.auth.signUp({ email, password });
    if (error) alert(`登録エラー: ${error.message}`);
    else alert('新規登録が完了しました！（確認メールが届いている場合は認証してください）');
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    updateUrlParams({}, true);
  });

  document.getElementById('edit-profile-btn').addEventListener('click', async () => {
    if (!state.currentUser) return;
    const currentName = document.getElementById('user-display-name').textContent;
    const newName = prompt('新しいユーザー名を入力してください（他のユーザーにも表示されます）:', currentName);
    if (newName === null) return;
    const trimmed = newName.trim();
    if (!trimmed) return alert('ユーザー名を入力してください');

    const { error } = await supabaseClient
      .from('profiles')
      .upsert([{ id: state.currentUser.id, display_name: trimmed, updated_at: new Date().toISOString() }]);

    if (error) alert(`ユーザー名の更新に失敗しました: ${error.message}`);
    else {
      state.profileCache[state.currentUser.id] = trimmed;
      document.getElementById('user-display-name').textContent = trimmed;
    }
  });
}

export function initAuthSession() {
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    state.currentUser = session ? session.user : null;
    const userStatusEl = document.getElementById('user-status');
    const shareNoticeEl = document.getElementById('share-login-notice');

    if (state.currentUser) {
      userStatusEl.classList.remove('hidden');
      await loadCurrentUserProfile();
      await handleInitialRouting();
    } else {
      userStatusEl.classList.add('hidden');
      showView('auth');
      const route = getInitialRouteFromUrl();
      if (route.shareId || route.deckId || route.creatorId || route.classId || route.joinCode || route.folderId) {
        shareNoticeEl.classList.remove('hidden');
      } else {
        shareNoticeEl.classList.add('hidden');
      }
    }
  });
}
