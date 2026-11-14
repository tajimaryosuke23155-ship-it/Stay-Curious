import { supabaseClient } from './config.js';
import { state } from './state.js';
import { showView, routeFromCurrentUrl, updateUrlParams } from './router.js';

const userStatus = document.getElementById('user-status');
const editProfileBtn = document.getElementById('edit-profile-btn');
const userDisplayNameEl = document.getElementById('user-display-name');
const shareLoginNotice = document.getElementById('share-login-notice');

export async function fetchDisplayNames(userIds) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const missingIds = uniqueIds.filter(id => !state.profileCache[id]);

  if (missingIds.length > 0) {
    const { data } = await supabaseClient
      .from('profiles')
      .select('id, display_name')
      .in('id', missingIds);

    (data || []).forEach(p => {
      state.profileCache[p.id] = p.display_name;
    });
  }

  uniqueIds.forEach(id => {
    if (!state.profileCache[id]) {
      state.profileCache[id] = `ユーザー (${id.slice(0, 6)})`;
    }
  });
}

async function initUserProfile(user) {
  const defaultName = user.email ? user.email.split('@')[0] : 'ユーザー';
  const { data } = await supabaseClient
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();

  if (data && data.display_name) {
    state.currentDisplayName = data.display_name;
  } else {
    state.currentDisplayName = defaultName;
    await supabaseClient.from('profiles').upsert({
      id: user.id,
      display_name: defaultName
    });
  }
  state.profileCache[user.id] = state.currentDisplayName;
  userDisplayNameEl.textContent = state.currentDisplayName;
}

export function initAuthEvents() {
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (session) {
      state.currentUser = session.user;
      userStatus.classList.remove('hidden');
      await initUserProfile(session.user);
      await routeFromCurrentUrl();
    } else {
      state.currentUser = null;
      userStatus.classList.add('hidden');
      const params = new URLSearchParams(window.location.search);
      const hasInvite = params.get('share') || params.get('user') || params.get('join_class') || params.get('class');
      shareLoginNotice.classList.toggle('hidden', !hasInvite);
      showView('auth');
    }
  });

  document.getElementById('signup-btn').addEventListener('click', async () => {
    const { error } = await supabaseClient.auth.signUp({
      email: document.getElementById('auth-email').value,
      password: document.getElementById('auth-password').value,
    });
    if (error) alert(`登録失敗: ${error.message}`);
    else alert('登録完了！そのままログインするか確認メールを処理してください。');
  });

  document.getElementById('login-btn').addEventListener('click', async () => {
    const { error } = await supabaseClient.auth.signInWithPassword({
      email: document.getElementById('auth-email').value,
      password: document.getElementById('auth-password').value,
    });
    if (error) alert(`ログイン失敗: ${error.message}`);
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    updateUrlParams({}, true);
    await supabaseClient.auth.signOut();
  });

  editProfileBtn.addEventListener('click', async () => {
    if (!state.currentUser) return;
    const newName = prompt('新しいユーザー名（表示名）を入力してください:', state.currentDisplayName);
    if (newName === null) return;
    const trimmed = newName.trim();
    if (!trimmed) return alert('ユーザー名を入力してください');

    const { error } = await supabaseClient
      .from('profiles')
      .upsert({ id: state.currentUser.id, display_name: trimmed, updated_at: new Date().toISOString() });

    if (error) {
      alert(`ユーザー名の更新に失敗しました: ${error.message}`);
    } else {
      state.currentDisplayName = trimmed;
      state.profileCache[state.currentUser.id] = trimmed;
      userDisplayNameEl.textContent = trimmed;
      if (state.isDeckOwner && state.currentDeck) {
        document.getElementById('detail-creator-name').textContent = trimmed;
      }
    }
  });
}
