// =============================================================
// 1. Supabase 初期化
// =============================================================
const SUPABASE_URL = 'https://wiglfddygldrnebqfhpn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_cGuWmJFqG7OlKC7ZG5hz0w_wuYot0tY';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =============================================================
// 2. アプリケーション状態（State）
// =============================================================
let currentUser = null;
let currentDisplayName = '';
let currentDeck = null;
let isDeckOwner = false;
let isCurrentDeckSaved = false;
let currentCards = [];
let weakCards = [];
let selectedCardType = 'basic';

// プロフィール名キャッシュ（user_id -> display_name）
const profileCache = {};

// 学習モード用状態
let studyQueue = [];
let studyIndex = 0;
let studyCorrectCount = 0;
let studyModeLabel = '全問モード';
let questionStartTime = 0;
let currentOrderSelection = [];

// =============================================================
// 3. DOM要素の参照
// =============================================================
const authSection = document.getElementById('auth-section');
const shareLoginNotice = document.getElementById('share-login-notice');
const dashboardSection = document.getElementById('dashboard-section');
const deckDetailSection = document.getElementById('deck-detail-section');
const studySection = document.getElementById('study-section');
const creatorSection = document.getElementById('creator-section');

const homeLogo = document.getElementById('home-logo');
const userStatus = document.getElementById('user-status');
const editProfileBtn = document.getElementById('edit-profile-btn');
const userDisplayNameEl = document.getElementById('user-display-name');

const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const logoutBtn = document.getElementById('logout-btn');

const deckTitle = document.getElementById('deck-title');
const textbookName = document.getElementById('textbook-name');
const createDeckBtn = document.getElementById('create-deck-btn');
const decksList = document.getElementById('decks-list');
const savedDecksList = document.getElementById('saved-decks-list');
const publicDecksList = document.getElementById('public-decks-list');

// 詳細・カード作成・共有画面
const backToDashboardBtn = document.getElementById('back-to-dashboard-btn');
const detailDeckTitle = document.getElementById('detail-deck-title');
const sharedDeckBadge = document.getElementById('shared-deck-badge');
const detailDeckTextbook = document.getElementById('detail-deck-textbook');
const detailCreatorBtn = document.getElementById('detail-creator-btn');
const detailCreatorName = document.getElementById('detail-creator-name');
const toggleSaveDeckBtn = document.getElementById('toggle-save-deck-btn');
const startWeakStudyBtn = document.getElementById('start-weak-study-btn');
const weakCardsCount = document.getElementById('weak-cards-count');
const startStudyBtn = document.getElementById('start-study-btn');

const shareSettingsPanel = document.getElementById('share-settings-panel');
const deckVisibilitySelect = document.getElementById('deck-visibility-select');
const shareLinkBox = document.getElementById('share-link-box');
const shareUrlInput = document.getElementById('share-url-input');
const copyShareUrlBtn = document.getElementById('copy-share-url-btn');

const statTotalCards = document.getElementById('stat-total-cards');
const statAccuracyRate = document.getElementById('stat-accuracy-rate');
const statWeakCards = document.getElementById('stat-weak-cards');

const createCardContainer = document.getElementById('create-card-container');
const cardTypeTabs = document.querySelectorAll('.card-type-tab');
const dynamicCardFields = document.getElementById('dynamic-card-fields');
const cardPageNumber = document.getElementById('card-page-number');
const cardQuestionNumber = document.getElementById('card-question-number');
const createCardBtn = document.getElementById('create-card-btn');
const cardsCount = document.getElementById('cards-count');
const cardsList = document.getElementById('cards-list');

// 学習画面
const exitStudyBtn = document.getElementById('exit-study-btn');
const studyModeBadge = document.getElementById('study-mode-badge');
const studyProgress = document.getElementById('study-progress');
const studyCardContainer = document.getElementById('study-card-container');

// クリエイターページ
const creatorBackBtn = document.getElementById('creator-back-btn');
const creatorPageName = document.getElementById('creator-page-name');
const creatorPageSummary = document.getElementById('creator-page-summary');
const creatorDecksList = document.getElementById('creator-decks-list');

// =============================================================
// 4. URLルーティング（リロード維持 & ブラウザ戻る対応）
// =============================================================
function updateUrlParams(paramsObj, replace = false) {
  const url = new URL(window.location.href);
  url.searchParams.delete('deck');
  url.searchParams.delete('share');
  url.searchParams.delete('mode');
  url.searchParams.delete('user');

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

function showView(viewName) {
  authSection.classList.add('hidden');
  dashboardSection.classList.add('hidden');
  deckDetailSection.classList.add('hidden');
  studySection.classList.add('hidden');
  creatorSection.classList.add('hidden');

  if (viewName === 'auth') authSection.classList.remove('hidden');
  if (viewName === 'dashboard') {
    dashboardSection.classList.remove('hidden');
    loadDecks();
    loadSavedDecks();
    loadPublicDecks();
  }
  if (viewName === 'detail') deckDetailSection.classList.remove('hidden');
  if (viewName === 'study') studySection.classList.remove('hidden');
  if (viewName === 'creator') creatorSection.classList.remove('hidden');
}

async function routeFromCurrentUrl() {
  const params = new URLSearchParams(window.location.search);
  const creatorUserId = params.get('user');
  const shareId = params.get('share');
  const deckId = params.get('deck');
  const mode = params.get('mode');

  if (creatorUserId) {
    await window.openCreatorPage(creatorUserId, true);
  } else if (shareId) {
    await window.openDeckByShareId(shareId, mode);
  } else if (deckId) {
    await window.openDeck(deckId, mode, true);
  } else {
    showView('dashboard');
  }
}

window.addEventListener('popstate', async () => {
  if (currentUser) {
    await routeFromCurrentUrl();
  }
});

homeLogo.addEventListener('click', () => {
  if (!currentUser) return;
  currentDeck = null;
  updateUrlParams({});
  showView('dashboard');
});

backToDashboardBtn.addEventListener('click', () => {
  currentDeck = null;
  updateUrlParams({});
  showView('dashboard');
});

creatorBackBtn.addEventListener('click', () => {
  updateUrlParams({});
  showView('dashboard');
});

// =============================================================
// 5. プロフィール（ユーザー名）取得・設定
// =============================================================
async function initUserProfile(user) {
  const defaultName = user.email ? user.email.split('@')[0] : 'ユーザー';
  const { data } = await supabaseClient
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();

  if (data && data.display_name) {
    currentDisplayName = data.display_name;
  } else {
    currentDisplayName = defaultName;
    // 初回ログイン時にデフォルト表示名を自動登録
    await supabaseClient.from('profiles').upsert({
      id: user.id,
      display_name: defaultName
    });
  }
  profileCache[user.id] = currentDisplayName;
  userDisplayNameEl.textContent = currentDisplayName;
}

async function fetchDisplayNames(userIds) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const missingIds = uniqueIds.filter(id => !profileCache[id]);

  if (missingIds.length > 0) {
    const { data } = await supabaseClient
      .from('profiles')
      .select('id, display_name')
      .in('id', missingIds);

    (data || []).forEach(p => {
      profileCache[p.id] = p.display_name;
    });
  }

  uniqueIds.forEach(id => {
    if (!profileCache[id]) {
      profileCache[id] = `ユーザー (${id.slice(0, 6)})`;
    }
  });
}

editProfileBtn.addEventListener('click', async () => {
  if (!currentUser) return;
  const newName = prompt('新しいユーザー名（表示名）を入力してください:', currentDisplayName);
  if (newName === null) return;
  const trimmed = newName.trim();
  if (!trimmed) return alert('ユーザー名を入力してください');

  const { error } = await supabaseClient
    .from('profiles')
    .upsert({ id: currentUser.id, display_name: trimmed, updated_at: new Date().toISOString() });

  if (error) {
    alert(`ユーザー名の更新に失敗しました: ${error.message}`);
  } else {
    currentDisplayName = trimmed;
    profileCache[currentUser.id] = trimmed;
    userDisplayNameEl.textContent = trimmed;
    if (isDeckOwner && currentDeck) {
      detailCreatorName.textContent = trimmed;
    }
  }
});

// =============================================================
// 6. 認証状態の監視 & ログイン処理
// =============================================================
supabaseClient.auth.onAuthStateChange(async (event, session) => {
  if (session) {
    currentUser = session.user;
    userStatus.classList.remove('hidden');
    await initUserProfile(session.user);
    await routeFromCurrentUrl();
  } else {
    currentUser = null;
    userStatus.classList.add('hidden');
    const params = new URLSearchParams(window.location.search);
    if (params.get('share') || params.get('user')) {
      shareLoginNotice.classList.remove('hidden');
    } else {
      shareLoginNotice.classList.add('hidden');
    }
    showView('auth');
  }
});

signupBtn.addEventListener('click', async () => {
  const { error } = await supabaseClient.auth.signUp({
    email: authEmail.value,
    password: authPassword.value,
  });
  if (error) alert(`登録失敗: ${error.message}`);
  else alert('登録完了！そのままログインするか確認メールを処理してください。');
});

loginBtn.addEventListener('click', async () => {
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: authEmail.value,
    password: authPassword.value,
  });
  if (error) alert(`ログイン失敗: ${error.message}`);
});

logoutBtn.addEventListener('click', async () => {
  updateUrlParams({}, true);
  await supabaseClient.auth.signOut();
});

// =============================================================
// 7. 単語帳一覧（マイ単語帳・保存ライブラリ・全体公開）
// =============================================================
async function loadDecks() {
  if (!currentUser) return;
  decksList.innerHTML = '<p class="text-gray-500 text-sm">読み込み中...</p>';

  const { data: decks, error } = await supabaseClient
    .from('decks')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });

  if (error) {
    decksList.innerHTML = `<p class="text-rose-500 text-sm">取得エラー: ${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!decks || decks.length === 0) {
    decksList.innerHTML = '<p class="text-gray-500 text-sm">まだ単語帳がありません。</p>';
    return;
  }

  const visLabelMap = {
    private: '🔒 非公開',
    link: '🔗 リンク共有中',
    public: '🌐 全体公開'
  };

  decksList.innerHTML = decks.map(deck => `
    <div onclick="window.openDeck('${deck.id}')" class="bg-white p-5 rounded-xl shadow border border-slate-100 hover:border-indigo-300 hover:shadow-md cursor-pointer transition flex justify-between items-start">
      <div>
        <h3 class="text-lg font-bold text-slate-800">${escapeHtml(deck.title)}</h3>
        <p class="text-xs text-indigo-600 font-semibold mt-1">${deck.textbook_name ? escapeHtml(deck.textbook_name) : '教科書未指定'}</p>
        <div class="flex items-center gap-2 mt-2">
          <span class="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">${visLabelMap[deck.visibility] || '🔒 非公開'}</span>
          <span class="text-xs text-indigo-500 font-medium">開く →</span>
        </div>
      </div>
      <button onclick="event.stopPropagation(); window.deleteDeck('${deck.id}')" class="text-xs bg-rose-50 text-rose-600 hover:bg-rose-100 px-3 py-1.5 rounded font-medium transition">削除</button>
    </div>
  `).join('');
}

async function loadSavedDecks() {
  if (!currentUser) return;
  savedDecksList.innerHTML = '<p class="text-gray-500 text-sm">読み込み中...</p>';

  const { data: savedRows, error } = await supabaseClient
    .from('saved_decks')
    .select('deck_id, saved_at, decks(*)')
    .eq('user_id', currentUser.id)
    .order('saved_at', { ascending: false });

  if (error) {
    savedDecksList.innerHTML = `<p class="text-rose-500 text-sm">取得エラー: ${escapeHtml(error.message)}</p>`;
    return;
  }

  const validDecks = (savedRows || []).map(r => r.decks).filter(Boolean);
  if (validDecks.length === 0) {
    savedDecksList.innerHTML = '<p class="text-gray-500 text-sm">まだ保存した単語帳はありません。共有リンクや公開単語帳から「☆ ライブラリに保存」を押すとここに並びます。</p>';
    return;
  }

  await fetchDisplayNames(validDecks.map(d => d.user_id));

  savedDecksList.innerHTML = validDecks.map(deck => {
    const creatorName = profileCache[deck.user_id] || '作成者';
    return `
      <div onclick="window.openDeck('${deck.id}')" class="bg-white p-5 rounded-xl shadow border border-amber-100 hover:border-amber-300 hover:shadow-md cursor-pointer transition flex justify-between items-start gap-3">
        <div>
          <span class="text-xs font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700">⭐ ライブラリ</span>
          <h3 class="text-lg font-bold text-slate-800 mt-1">${escapeHtml(deck.title)}</h3>
          <p class="text-xs text-indigo-600 font-semibold mt-0.5">${deck.textbook_name ? escapeHtml(deck.textbook_name) : '教科書未指定'}</p>
          <button type="button" onclick="event.stopPropagation(); window.openCreatorPage('${deck.user_id}')" class="mt-2 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-indigo-600 hover:underline font-medium">
            👤 ${escapeHtml(creatorName)}
          </button>
        </div>
        <button onclick="event.stopPropagation(); window.removeSavedDeck('${deck.id}')" class="text-xs bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600 px-2.5 py-1 rounded font-medium transition shrink-0">解除</button>
      </div>
    `;
  }).join('');
}

window.removeSavedDeck = async function(deckId) {
  if (!currentUser) return;
  await supabaseClient
    .from('saved_decks')
    .delete()
    .eq('user_id', currentUser.id)
    .eq('deck_id', deckId);
  loadSavedDecks();
};

async function loadPublicDecks() {
  if (!currentUser) return;
  publicDecksList.innerHTML = '<p class="text-gray-500 text-sm">読み込み中...</p>';

  const { data: decks, error } = await supabaseClient
    .from('decks')
    .select('*')
    .eq('visibility', 'public')
    .neq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    publicDecksList.innerHTML = `<p class="text-rose-500 text-sm">取得エラー: ${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!decks || decks.length === 0) {
    publicDecksList.innerHTML = '<p class="text-gray-500 text-sm">現在公開されている他のユーザーの単語帳はありません。</p>';
    return;
  }

  await fetchDisplayNames(decks.map(d => d.user_id));

  publicDecksList.innerHTML = decks.map(deck => {
    const creatorName = profileCache[deck.user_id] || '作成者';
    return `
      <div onclick="window.openDeck('${deck.id}')" class="bg-white p-5 rounded-xl shadow border border-slate-100 hover:border-indigo-300 hover:shadow-md cursor-pointer transition">
        <div class="flex justify-between items-start">
          <div>
            <span class="text-xs font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">🌐 公開単語帳</span>
            <h3 class="text-lg font-bold text-slate-800 mt-1">${escapeHtml(deck.title)}</h3>
            <p class="text-xs text-indigo-600 font-semibold mt-0.5">${deck.textbook_name ? escapeHtml(deck.textbook_name) : '教科書未指定'}</p>
            <button type="button" onclick="event.stopPropagation(); window.openCreatorPage('${deck.user_id}')" class="mt-2 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-indigo-600 hover:underline font-medium">
              👤 ${escapeHtml(creatorName)}
            </button>
          </div>
          <span class="text-xs text-indigo-600 font-bold">学習する →</span>
        </div>
      </div>
    `;
  }).join('');
}

createDeckBtn.addEventListener('click', async () => {
  const title = deckTitle.value.trim();
  const textbook = textbookName.value.trim();

  if (!title) return alert('タイトルを入力してください');
  if (!currentUser) return alert('ログインが必要です');

  const { error } = await supabaseClient.from('decks').insert([
    {
      user_id: currentUser.id,
      title: title,
      textbook_name: textbook || null,
      visibility: 'private',
      edit_access: 'owner'
    }
  ]);

  if (error) {
    alert(`作成エラー: ${error.message}`);
  } else {
    deckTitle.value = '';
    textbookName.value = '';
    loadDecks();
  }
});

window.deleteDeck = async function(deckId) {
  if (!confirm('この単語帳を削除しますか？（中のカードもすべて削除されます）')) return;

  const { error } = await supabaseClient.from('decks').delete().eq('id', deckId);
  if (error) {
    alert(`削除エラー: ${error.message}`);
  } else {
    loadDecks();
  }
};

// =============================================================
// 8. クリエイターページ（特定ユーザーの単語帳一覧）
// =============================================================
window.openCreatorPage = async function(targetUserId, skipPushState = false) {
  if (!skipPushState) {
    updateUrlParams({ user: targetUserId });
  }

  showView('creator');
  creatorDecksList.innerHTML = '<p class="text-slate-500 text-sm">読み込み中...</p>';

  await fetchDisplayNames([targetUserId]);
  const creatorName = profileCache[targetUserId] || 'ユーザー';
  const isMe = currentUser && currentUser.id === targetUserId;

  creatorPageName.textContent = isMe ? `${creatorName}（あなた）` : creatorName;

  const { data: decks, error } = await supabaseClient
    .rpc('get_creator_decks', { target_user_id: targetUserId });

  if (error) {
    creatorDecksList.innerHTML = `<p class="text-rose-500 text-sm">取得エラー: ${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!decks || decks.length === 0) {
    creatorPageSummary.textContent = '作成した単語帳はまだありません';
    creatorDecksList.innerHTML = '<p class="text-slate-500 text-sm bg-white p-4 rounded-xl">単語帳がありません。</p>';
    return;
  }

  const publicCount = decks.filter(d => d.visibility === 'public').length;
  creatorPageSummary.textContent = `全 ${decks.length} セット作成（うち全体公開 ${publicCount} セット）`;

  creatorDecksList.innerHTML = decks.map(deck => {
    const canOpen = deck.visibility === 'public' || isMe;

    if (canOpen) {
      return `
        <div onclick="window.openDeck('${deck.id}')" class="bg-white p-5 rounded-xl shadow border border-slate-100 hover:border-indigo-300 hover:shadow-md cursor-pointer transition">
          <div class="flex justify-between items-start gap-2">
            <div>
              <span class="text-xs font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
                ${deck.visibility === 'public' ? '🌐 全体公開' : '🔒 自分の非公開'}
              </span>
              <h4 class="text-lg font-bold text-slate-800 mt-1">${escapeHtml(deck.title)}</h4>
              <p class="text-xs text-indigo-600 font-semibold mt-0.5">${deck.textbook_name ? escapeHtml(deck.textbook_name) : '教科書未指定'}</p>
              <p class="text-xs text-slate-500 mt-2">カード数: ${deck.card_count}枚</p>
            </div>
            <span class="text-xs text-indigo-600 font-bold shrink-0">中身を見る →</span>
          </div>
        </div>
      `;
    } else {
      // 非公開・リンク限定セットはタイトルとカード枚数のみ表示（中身ロック）
      return `
        <div class="bg-slate-50 p-5 rounded-xl border border-slate-200 opacity-80">
          <div class="flex justify-between items-start gap-2">
            <div>
              <span class="text-xs font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-600">🔒 非公開セット</span>
              <h4 class="text-lg font-bold text-slate-700 mt-1">${escapeHtml(deck.title)}</h4>
              <p class="text-xs text-slate-500 mt-2">カード数: ${deck.card_count}枚（非公開のため中身は閲覧できません）</p>
            </div>
            <span class="text-lg text-slate-400">🔒</span>
          </div>
        </div>
      `;
    }
  }).join('');
};

// =============================================================
// 9. 単語帳詳細 & ライブラリ保存 & 共有設定 & カード管理
// =============================================================
async function checkAndRenderSaveButton(deckId) {
  if (!currentUser || isDeckOwner) {
    toggleSaveDeckBtn.classList.add('hidden');
    return;
  }

  toggleSaveDeckBtn.classList.remove('hidden');
  const { data } = await supabaseClient
    .from('saved_decks')
    .select('deck_id')
    .eq('user_id', currentUser.id)
    .eq('deck_id', deckId)
    .maybeSingle();

  isCurrentDeckSaved = Boolean(data);
  updateSaveButtonUI();
}

function updateSaveButtonUI() {
  if (isCurrentDeckSaved) {
    toggleSaveDeckBtn.textContent = '⭐ ライブラリ保存済み';
    toggleSaveDeckBtn.className = 'border-2 border-amber-500 bg-amber-400 hover:bg-amber-500 text-slate-900 px-4 py-3 rounded-xl font-bold shadow-sm transition';
  } else {
    toggleSaveDeckBtn.textContent = '☆ ライブラリに保存';
    toggleSaveDeckBtn.className = 'border-2 border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-800 px-4 py-3 rounded-xl font-bold shadow-sm transition';
  }
}

toggleSaveDeckBtn.addEventListener('click', async () => {
  if (!currentUser || !currentDeck || isDeckOwner) return;

  if (isCurrentDeckSaved) {
    await supabaseClient
      .from('saved_decks')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('deck_id', currentDeck.id);
    isCurrentDeckSaved = false;
  } else {
    await supabaseClient
      .from('saved_decks')
      .insert([{ user_id: currentUser.id, deck_id: currentDeck.id }]);
    isCurrentDeckSaved = true;
  }
  updateSaveButtonUI();
});

async function setupAndRenderDeck(deck, autoStudyMode = null, skipPushState = false) {
  currentDeck = deck;
  isDeckOwner = currentUser && deck.user_id === currentUser.id;

  if (!skipPushState) {
    const params = deck.share_id && !isDeckOwner
      ? { share: deck.share_id }
      : { deck: deck.id };
    if (autoStudyMode) params.mode = autoStudyMode;
    updateUrlParams(params);
  }

  detailDeckTitle.textContent = deck.title;
  detailDeckTextbook.textContent = deck.textbook_name ? `教科書: ${deck.textbook_name}` : '教科書未指定';

  // 作成者名の取得とクリック遷移設定
  await fetchDisplayNames([deck.user_id]);
  detailCreatorName.textContent = profileCache[deck.user_id] || '作成者';
  detailCreatorBtn.onclick = () => window.openCreatorPage(deck.user_id);

  if (isDeckOwner) {
    sharedDeckBadge.classList.add('hidden');
    shareSettingsPanel.classList.remove('hidden');
    createCardContainer.classList.remove('hidden');
    deckVisibilitySelect.value = deck.visibility || 'private';
    updateShareLinkBox(deck);
  } else {
    sharedDeckBadge.classList.remove('hidden');
    shareSettingsPanel.classList.add('hidden');
    createCardContainer.classList.add('hidden');
  }

  await checkAndRenderSaveButton(deck.id);
  renderCardFormFields(selectedCardType);
  await loadCardsAndStats(deck.id);

  if (autoStudyMode === 'study' && currentCards.length > 0) {
    startQuizSession(currentCards, false, true);
  } else if (autoStudyMode === 'weak' && weakCards.length > 0) {
    startQuizSession(weakCards, true, true);
  } else {
    showView('detail');
  }
}

window.openDeck = async function(deckId, autoStudyMode = null, skipPushState = false) {
  const { data: deck, error } = await supabaseClient
    .from('decks')
    .select('*')
    .eq('id', deckId)
    .single();

  if (error || !deck) {
    alert('単語帳が見つからないか、アクセス権限がありません');
    updateUrlParams({}, true);
    showView('dashboard');
    return;
  }

  await setupAndRenderDeck(deck, autoStudyMode, skipPushState);
};

window.openDeckByShareId = async function(shareId, autoStudyMode = null) {
  const { data: deck, error } = await supabaseClient
    .from('decks')
    .select('*')
    .eq('share_id', shareId)
    .single();

  if (error || !deck) {
    alert('共有リンクが無効か、非公開に設定されています');
    updateUrlParams({}, true);
    showView('dashboard');
    return;
  }

  await setupAndRenderDeck(deck, autoStudyMode, true);
};

function updateShareLinkBox(deck) {
  if (deck.visibility === 'link' || deck.visibility === 'public') {
    shareLinkBox.classList.remove('hidden');
    const shareUrl = new URL(window.location.href);
    shareUrl.search = `?share=${deck.share_id}`;
    shareUrlInput.value = shareUrl.toString();
  } else {
    shareLinkBox.classList.add('hidden');
  }
}

deckVisibilitySelect.addEventListener('change', async () => {
  if (!currentDeck || !isDeckOwner) return;
  const newVisibility = deckVisibilitySelect.value;

  const { data, error } = await supabaseClient
    .from('decks')
    .update({ visibility: newVisibility })
    .eq('id', currentDeck.id)
    .select()
    .single();

  if (error) {
    alert(`公開設定の更新に失敗しました: ${error.message}`);
  } else if (data) {
    currentDeck = data;
    updateShareLinkBox(data);
  }
});

copyShareUrlBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(shareUrlInput.value);
    const originalText = copyShareUrlBtn.textContent;
    copyShareUrlBtn.textContent = '✓ コピー完了！';
    setTimeout(() => { copyShareUrlBtn.textContent = originalText; }, 2000);
  } catch {
    shareUrlInput.select();
    document.execCommand('copy');
    alert('共有URLをコピーしました！');
  }
});

cardTypeTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    selectedCardType = tab.dataset.cardType;
    cardTypeTabs.forEach(t => {
      t.classList.remove('bg-indigo-600', 'text-white');
      t.classList.add('bg-slate-100', 'text-slate-700');
    });
    tab.classList.remove('bg-slate-100', 'text-slate-700');
    tab.classList.add('bg-indigo-600', 'text-white');
    renderCardFormFields(selectedCardType);
  });
});

function renderCardFormFields(type) {
  if (type === 'basic') {
    dynamicCardFields.innerHTML = `
      <div>
        <label class="block text-sm font-medium mb-1">表面（問題・英単語など）</label>
        <textarea id="input-basic-front" rows="2" class="w-full border rounded p-2" placeholder="例: achieve"></textarea>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">裏面（答え・意味）</label>
        <textarea id="input-basic-back" rows="2" class="w-full border rounded p-2" placeholder="例: 〜を達成する"></textarea>
      </div>
    `;
  } else if (type === 'order') {
    dynamicCardFields.innerHTML = `
      <div>
        <label class="block text-sm font-medium mb-1">問題文（何を並べ替えるか）</label>
        <input type="text" id="input-order-prompt" class="w-full border rounded p-2" placeholder="例: 以下の出来事を古い順に並べ替えよ">
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">正しい順番の要素（1行に1つずつ、上から正解順に入力）</label>
        <textarea id="input-order-items" rows="4" class="w-full border rounded p-2" placeholder="大化の改新&#10;平城京遷都&#10;平安京遷都"></textarea>
      </div>
    `;
  } else if (type === 'multi_element') {
    dynamicCardFields.innerHTML = `
      <div>
        <label class="block text-sm font-medium mb-1">問題文</label>
        <input type="text" id="input-multi-prompt" class="w-full border rounded p-2" placeholder="例: 日本国憲法の三原則をすべて挙げよ">
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">正解となる要素（1行に1つずつ入力・順不同で完答判定）</label>
        <textarea id="input-multi-answers" rows="4" class="w-full border rounded p-2" placeholder="国民主権&#10;基本的人権の尊重&#10;平和主義"></textarea>
      </div>
    `;
  } else if (type === 'cloze') {
    dynamicCardFields.innerHTML = `
      <div>
        <label class="block text-sm font-medium mb-1">穴埋め文章（空欄にしたい語句を <code class="bg-slate-100 px-1 rounded text-indigo-600">{{語句}}</code> で囲む）</label>
        <textarea id="input-cloze-text" rows="3" class="w-full border rounded p-2" placeholder="例: 光合成は植物の{{葉緑体}}で行われ、二酸化炭素と水から{{デンプン}}と酸素をつくる。"></textarea>
      </div>
    `;
  }
}

createCardBtn.addEventListener('click', async () => {
  if (!currentDeck || !isDeckOwner) return;

  let content = null;

  if (selectedCardType === 'basic') {
    const front = document.getElementById('input-basic-front').value.trim();
    const back = document.getElementById('input-basic-back').value.trim();
    if (!front || !back) return alert('表面と裏面の両方を入力してください');
    content = { front, back };

  } else if (selectedCardType === 'order') {
    const prompt = document.getElementById('input-order-prompt').value.trim();
    const items = document.getElementById('input-order-items').value
      .split('\n').map(s => s.trim()).filter(Boolean);
    if (!prompt || items.length < 2) return alert('問題文と、2つ以上の並べ替え要素を入力してください');
    content = { prompt, items };

  } else if (selectedCardType === 'multi_element') {
    const prompt = document.getElementById('input-multi-prompt').value.trim();
    const answers = document.getElementById('input-multi-answers').value
      .split('\n').map(s => s.trim()).filter(Boolean);
    if (!prompt || answers.length < 2) return alert('問題文と、2つ以上の正解要素を入力してください');
    content = { prompt, answers };

  } else if (selectedCardType === 'cloze') {
    const text = document.getElementById('input-cloze-text').value.trim();
    const matches = [...text.matchAll(/\{\{(.+?)\}\}/g)];
    if (!text || matches.length === 0) {
      return alert('空欄にしたい部分を {{答え}} のように二重波括弧で囲んでください');
    }
    content = { text };
  }

  const pageVal = cardPageNumber.value ? parseInt(cardPageNumber.value, 10) : null;
  const qNumVal = cardQuestionNumber.value.trim() || null;

  const { error } = await supabaseClient.from('cards').insert([
    {
      deck_id: currentDeck.id,
      card_type: selectedCardType,
      page_number: pageVal,
      question_number: qNumVal,
      content: content
    }
  ]);

  if (error) {
    alert(`カード追加エラー: ${error.message}`);
  } else {
    renderCardFormFields(selectedCardType);
    cardQuestionNumber.value = '';
    await loadCardsAndStats(currentDeck.id);
  }
});

async function loadCardsAndStats(deckId) {
  cardsList.innerHTML = '<p class="text-slate-500 text-sm">カードと学習履歴を読み込み中...</p>';

  const { data: cards, error: cardsError } = await supabaseClient
    .from('cards')
    .select('*')
    .eq('deck_id', deckId)
    .order('created_at', { ascending: true });

  if (cardsError) {
    cardsList.innerHTML = `<p class="text-rose-500 text-sm">読み込みエラー: ${escapeHtml(cardsError.message)}</p>`;
    return;
  }

  currentCards = cards || [];
  cardsCount.textContent = currentCards.length;
  statTotalCards.textContent = `${currentCards.length}枚`;

  if (currentCards.length === 0) {
    weakCards = [];
    updateStatsUI(0, 0, 0);
    cardsList.innerHTML = '<p class="text-slate-500 text-sm bg-white p-4 rounded-xl">まだカードがありません。</p>';
    return;
  }

  const cardIds = currentCards.map(c => c.id);
  const { data: logs } = await supabaseClient
    .from('learning_logs')
    .select('card_id, is_correct, reviewed_at')
    .eq('user_id', currentUser.id)
    .in('card_id', cardIds)
    .order('reviewed_at', { ascending: false });

  const statsByCard = {};
  let totalAttempts = 0;
  let totalCorrect = 0;

  (logs || []).forEach(log => {
    totalAttempts++;
    if (log.is_correct) totalCorrect++;

    if (!statsByCard[log.card_id]) {
      statsByCard[log.card_id] = {
        attempts: 0,
        correct: 0,
        lastResult: log.is_correct
      };
    }
    statsByCard[log.card_id].attempts++;
    if (log.is_correct) statsByCard[log.card_id].correct++;
  });

  weakCards = currentCards.filter(card => {
    const st = statsByCard[card.id];
    if (!st || st.attempts === 0) return false;
    const rate = st.correct / st.attempts;
    return st.lastResult === false || rate < 0.7;
  });

  updateStatsUI(totalAttempts, totalCorrect, weakCards.length);

  const typeBadgeMap = {
    basic: { label: '一問一答', color: 'bg-blue-100 text-blue-700' },
    order: { label: '並べ替え', color: 'bg-amber-100 text-amber-700' },
    multi_element: { label: '複数要素', color: 'bg-purple-100 text-purple-700' },
    cloze: { label: '穴埋め', color: 'bg-emerald-100 text-emerald-700' }
  };

  cardsList.innerHTML = currentCards.map(card => {
    const badge = typeBadgeMap[card.card_type] || { label: card.card_type, color: 'bg-slate-100 text-slate-700' };
    const st = statsByCard[card.id];
    const isWeak = weakCards.some(w => w.id === card.id);

    let accuracyHtml = '<span class="text-xs text-slate-400">未学習</span>';
    if (st && st.attempts > 0) {
      const pct = Math.round((st.correct / st.attempts) * 100);
      const rateColor = pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-rose-600';
      accuracyHtml = `<span class="text-xs font-semibold ${rateColor}">正答率 ${pct}% (${st.correct}/${st.attempts})</span>`;
    }

    let summaryHtml = '';
    if (card.card_type === 'basic') {
      summaryHtml = `<p class="font-bold text-slate-800">${escapeHtml(card.content.front)}</p>
                     <p class="text-sm text-slate-600 mt-1">答: ${escapeHtml(card.content.back)}</p>`;
    } else if (card.card_type === 'order') {
      summaryHtml = `<p class="font-bold text-slate-800">${escapeHtml(card.content.prompt)}</p>
                     <p class="text-xs text-slate-600 mt-1">正解順: ${card.content.items.map(escapeHtml).join(' → ')}</p>`;
    } else if (card.card_type === 'multi_element') {
      summaryHtml = `<p class="font-bold text-slate-800">${escapeHtml(card.content.prompt)}</p>
                     <p class="text-xs text-slate-600 mt-1">要素 (${card.content.answers.length}個): ${card.content.answers.map(escapeHtml).join(' / ')}</p>`;
    } else if (card.card_type === 'cloze') {
      const formatted = escapeHtml(card.content.text).replace(/\{\{(.+?)\}\}/g, '<span class="font-bold text-emerald-700 underline">[$1]</span>');
      summaryHtml = `<p class="text-slate-800">${formatted}</p>`;
    }

    const metaText = [
      card.page_number !== null ? `P.${card.page_number}` : '',
      card.question_number ? `${card.question_number}` : ''
    ].filter(Boolean).join(' / ');

    return `
      <div class="bg-white p-4 rounded-xl shadow-sm border ${isWeak ? 'border-rose-200' : 'border-slate-100'} flex justify-between items-start gap-4">
        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-semibold px-2 py-0.5 rounded ${badge.color}">${badge.label}</span>
            ${isWeak ? '<span class="text-xs font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-700">🔥 要復習</span>' : ''}
            ${accuracyHtml}
            ${metaText ? `<span class="text-xs text-slate-400">・${escapeHtml(metaText)}</span>` : ''}
          </div>
          <div class="pt-1">${summaryHtml}</div>
        </div>
        ${isDeckOwner ? `<button onclick="window.deleteCard('${card.id}')" class="text-xs text-rose-500 hover:bg-rose-50 px-2.5 py-1 rounded transition shrink-0">削除</button>` : ''}
      </div>
    `;
  }).join('');
}

function updateStatsUI(totalAttempts, totalCorrect, weakCount) {
  statAccuracyRate.textContent = totalAttempts > 0
    ? `${Math.round((totalCorrect / totalAttempts) * 100)}%`
    : '--%';
  statWeakCards.textContent = `${weakCount}枚`;
  weakCardsCount.textContent = weakCount;
  startWeakStudyBtn.disabled = weakCount === 0;
}

window.deleteCard = async function(cardId) {
  if (!isDeckOwner || !confirm('このカードを削除しますか？')) return;
  const { error } = await supabaseClient.from('cards').delete().eq('id', cardId);
  if (error) alert(`削除エラー: ${error.message}`);
  else if (currentDeck) await loadCardsAndStats(currentDeck.id);
};

// =============================================================
// 10. 学習（クイズ）モード & 4カードタイプの出題・判定ロジック
// =============================================================
function startQuizSession(cardsToStudy, isWeakOnly, skipPushState = false) {
  if (!cardsToStudy || cardsToStudy.length === 0) {
    return alert('出題できるカードがありません');
  }
  studyQueue = [...cardsToStudy].sort(() => Math.random() - 0.5);
  studyIndex = 0;
  studyCorrectCount = 0;
  studyModeLabel = isWeakOnly ? '🔥 苦手復習モード' : '全問モード';

  if (!skipPushState && currentDeck) {
    const params = currentDeck.share_id && !isDeckOwner
      ? { share: currentDeck.share_id, mode: isWeakOnly ? 'weak' : 'study' }
      : { deck: currentDeck.id, mode: isWeakOnly ? 'weak' : 'study' };
    updateUrlParams(params);
  }

  studyModeBadge.textContent = studyModeLabel;
  studyModeBadge.className = isWeakOnly
    ? 'text-xs font-bold px-2.5 py-0.5 rounded bg-rose-100 text-rose-700'
    : 'text-xs font-bold px-2.5 py-0.5 rounded bg-indigo-100 text-indigo-700';

  showView('study');
  renderStudyQuestion();
}

startStudyBtn.addEventListener('click', () => {
  if (currentCards.length === 0) {
    return alert('学習するカードがありません。先に問題カードを追加してください！');
  }
  startQuizSession(currentCards, false);
});

startWeakStudyBtn.addEventListener('click', () => {
  if (weakCards.length === 0) return;
  startQuizSession(weakCards, true);
});

exitStudyBtn.addEventListener('click', () => {
  if (currentDeck) {
    setupAndRenderDeck(currentDeck, null, false);
  } else {
    updateUrlParams({});
    showView('dashboard');
  }
});

function renderStudyQuestion() {
  if (studyIndex >= studyQueue.length) {
    renderStudyComplete();
    return;
  }

  const card = studyQueue[studyIndex];
  questionStartTime = Date.now();
  studyProgress.textContent = `${studyIndex + 1} / ${studyQueue.length}`;

  if (card.card_type === 'basic') {
    studyCardContainer.innerHTML = `
      <div class="space-y-4">
        <span class="text-xs font-bold px-2.5 py-1 rounded bg-blue-100 text-blue-700">一問一答</span>
        <div class="text-2xl font-bold text-slate-800 py-6 text-center whitespace-pre-wrap">${escapeHtml(card.content.front)}</div>
        <div id="basic-answer-area" class="hidden border-t pt-6 text-center space-y-4">
          <p class="text-sm text-slate-500">正解</p>
          <div class="text-xl font-bold text-indigo-700 whitespace-pre-wrap">${escapeHtml(card.content.back)}</div>
        </div>
      </div>
      <div id="basic-controls" class="pt-6">
        <button id="reveal-basic-btn" type="button" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition">答えを見る</button>
      </div>
    `;

    document.getElementById('reveal-basic-btn').addEventListener('click', () => {
      document.getElementById('basic-answer-area').classList.remove('hidden');
      document.getElementById('basic-controls').innerHTML = `
        <div class="grid grid-cols-2 gap-3">
          <button type="button" onclick="window.submitAnswer(false)" class="bg-rose-500 hover:bg-rose-600 text-white font-bold py-3 rounded-xl transition">✕ 覚え直し</button>
          <button type="button" onclick="window.submitAnswer(true)" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition">○ 正解！</button>
        </div>
      `;
    });

  } else if (card.card_type === 'order') {
    currentOrderSelection = [];
    const shuffledItems = [...card.content.items].sort(() => Math.random() - 0.5);

    studyCardContainer.innerHTML = `
      <div class="space-y-4">
        <span class="text-xs font-bold px-2.5 py-1 rounded bg-amber-100 text-amber-700">並べ替え</span>
        <h3 class="text-lg font-bold text-slate-800">${escapeHtml(card.content.prompt)}</h3>
        
        <div class="bg-slate-50 p-3 rounded-xl border border-slate-200 min-h-[64px]">
          <p class="text-xs text-slate-400 mb-2">あなたの解答順（タップして選択）：</p>
          <div id="order-selected-list" class="flex flex-wrap gap-2"></div>
        </div>

        <div id="order-pool-list" class="flex flex-wrap gap-2 pt-2">
          ${shuffledItems.map((item, idx) => `
            <button type="button" data-idx="${idx}" data-val="${escapeHtml(item)}" class="order-choice-btn bg-white border-2 border-indigo-200 hover:border-indigo-500 px-3 py-2 rounded-lg text-sm font-semibold shadow-sm transition">
              ${escapeHtml(item)}
            </button>
          `).join('')}
        </div>
        <div id="study-feedback" class="hidden p-4 rounded-xl text-sm font-bold"></div>
      </div>
      <div id="order-controls" class="flex gap-2 pt-6">
        <button id="reset-order-btn" type="button" class="w-1/3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 rounded-xl transition">リセット</button>
        <button id="check-order-btn" type="button" class="w-2/3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition">判定する</button>
      </div>
    `;

    const poolBtns = document.querySelectorAll('.order-choice-btn');
    const selectedContainer = document.getElementById('order-selected-list');

    function updateOrderUI() {
      selectedContainer.innerHTML = currentOrderSelection.map((val, i) => `
        <span class="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold">${i + 1}. ${escapeHtml(val)}</span>
      `).join('');
    }

    poolBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.classList.add('opacity-30');
        currentOrderSelection.push(btn.dataset.val);
        updateOrderUI();
      });
    });

    document.getElementById('reset-order-btn').addEventListener('click', () => {
      currentOrderSelection = [];
      poolBtns.forEach(btn => {
        btn.disabled = false;
        btn.classList.remove('opacity-30');
      });
      updateOrderUI();
    });

    document.getElementById('check-order-btn').addEventListener('click', () => {
      const correctItems = card.content.items;
      if (currentOrderSelection.length !== correctItems.length) {
        return alert('すべての選択肢を並べてから判定してください');
      }
      const isCorrect = currentOrderSelection.every((val, idx) => val === correctItems[idx]);
      showResultAndNext(
        isCorrect,
        isCorrect ? '○ 大正解！順番も完璧です。' : `✕ 不正解… 正解順: ${correctItems.join(' → ')}`
      );
    });

  } else if (card.card_type === 'multi_element') {
    const count = card.content.answers.length;
    studyCardContainer.innerHTML = `
      <div class="space-y-4">
        <span class="text-xs font-bold px-2.5 py-1 rounded bg-purple-100 text-purple-700">複数要素（${count}つすべて解答）</span>
        <h3 class="text-lg font-bold text-slate-800">${escapeHtml(card.content.prompt)}</h3>
        <div class="space-y-2">
          ${Array.from({ length: count }).map((_, i) => `
            <input type="text" class="multi-input w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500" placeholder="要素 ${i + 1}">
          `).join('')}
        </div>
        <div id="study-feedback" class="hidden p-4 rounded-xl text-sm font-bold"></div>
      </div>
      <div id="multi-controls" class="pt-6">
        <button id="check-multi-btn" type="button" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition">判定する</button>
      </div>
    `;

    document.getElementById('check-multi-btn').addEventListener('click', () => {
      const userInputs = [...document.querySelectorAll('.multi-input')].map(el => el.value.trim());
      if (userInputs.some(v => !v)) return alert('すべての空欄を入力してください');

      const normalize = s => s.toLowerCase().replace(/\s+/g, '');
      const expectedSet = new Set(card.content.answers.map(normalize));
      const userSet = new Set(userInputs.map(normalize));

      const isCorrect = expectedSet.size === userSet.size &&
        [...expectedSet].every(ans => userSet.has(ans));

      showResultAndNext(
        isCorrect,
        isCorrect ? '○ 完答！すべて正解です。' : `✕ 不正解… 正解の要素: ${card.content.answers.join(' / ')}`
      );
    });

  } else if (card.card_type === 'cloze') {
    const answers = [];
    let blankIndex = 0;
    const htmlWithInputs = escapeHtml(card.content.text).replace(/\{\{(.+?)\}\}/g, (_, ans) => {
      answers.push(ans);
      blankIndex++;
      return `<input type="text" data-blank-idx="${blankIndex - 1}" class="cloze-input inline-block border-b-2 border-indigo-500 bg-indigo-50 px-2 py-0.5 mx-1 w-32 text-center font-bold text-indigo-900 focus:outline-none" placeholder="(${blankIndex})">`;
    });

    studyCardContainer.innerHTML = `
      <div class="space-y-4">
        <span class="text-xs font-bold px-2.5 py-1 rounded bg-emerald-100 text-emerald-700">穴埋め</span>
        <div class="text-lg leading-loose text-slate-800 py-4">${htmlWithInputs}</div>
        <div id="study-feedback" class="hidden p-4 rounded-xl text-sm font-bold"></div>
      </div>
      <div id="cloze-controls" class="pt-6">
        <button id="check-cloze-btn" type="button" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition">判定する</button>
      </div>
    `;

    document.getElementById('check-cloze-btn').addEventListener('click', () => {
      const inputs = [...document.querySelectorAll('.cloze-input')];
      const normalize = s => s.trim().toLowerCase().replace(/\s+/g, '');
      const isCorrect = inputs.every((input, idx) => normalize(input.value) === normalize(answers[idx]));

      showResultAndNext(
        isCorrect,
        isCorrect ? '○ 正解！' : `✕ 不正解… 正解: ${answers.map((a, i) => `(${i + 1}) ${a}`).join(' / ')}`
      );
    });
  }
}

function showResultAndNext(isCorrect, message) {
  const feedbackEl = document.getElementById('study-feedback');
  feedbackEl.classList.remove('hidden');
  feedbackEl.classList.add(isCorrect ? 'bg-emerald-50' : 'bg-rose-50', isCorrect ? 'text-emerald-700' : 'text-rose-700');
  feedbackEl.textContent = message;

  const controlDiv = studyCardContainer.lastElementChild;
  controlDiv.innerHTML = `
    <button type="button" onclick="window.submitAnswer(${isCorrect})" class="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl transition">
      次の問題へ →
    </button>
  `;
}

window.submitAnswer = async function(isCorrect) {
  const card = studyQueue[studyIndex];
  const timeTakenSec = Math.max(1, Math.round((Date.now() - questionStartTime) / 1000));

  if (isCorrect) studyCorrectCount++;

  if (currentUser && card) {
    await supabaseClient.from('learning_logs').insert([
      {
        user_id: currentUser.id,
        card_id: card.id,
        is_correct: isCorrect,
        time_taken_sec: timeTakenSec
      }
    ]);
  }

  studyIndex++;
  renderStudyQuestion();
};

function renderStudyComplete() {
  const total = studyQueue.length;
  const rate = Math.round((studyCorrectCount / total) * 100);

  studyCardContainer.innerHTML = `
    <div class="text-center py-8 space-y-4">
      <div class="text-5xl">🎉</div>
      <h3 class="text-2xl font-bold text-slate-800">${escapeHtml(studyModeLabel)} 完了！</h3>
      <p class="text-lg text-slate-600">
        正答率: <span class="font-bold text-indigo-600 text-2xl">${rate}%</span>（${studyCorrectCount} / ${total} 問正解）
      </p>
      <div class="pt-6 flex justify-center gap-3">
        <button type="button" onclick="window.returnToDeckDetail()" class="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-6 py-3 rounded-xl transition">
          単語帳に戻る（成績を更新）
        </button>
      </div>
    </div>
  `;
}

window.returnToDeckDetail = function() {
  if (currentDeck) {
    setupAndRenderDeck(currentDeck, null, false);
  } else {
    updateUrlParams({});
    showView('dashboard');
  }
};

// =============================================================
// 11. ユーティリティ
// =============================================================
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}
