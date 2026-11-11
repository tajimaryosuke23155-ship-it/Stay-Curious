// =============================================================
// 1. Supabase 初期化
// =============================================================
const SUPABASE_URL = 'YOUR_SUPABASE_URL';https:wiglfddygldrnebqfhpn.supabase.co       // ← Project URL
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; sb_publishable_cGuWmJFqG7OlKC7ZG5hz0w_wuYot0tY// ← anon key

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =============================================================
// 2. DOM要素の参照
// =============================================================
const authSection = document.getElementById('auth-section');
const dashboardSection = document.getElementById('dashboard-section');
const userStatus = document.getElementById('user-status');
const userEmail = document.getElementById('user-email');

const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const logoutBtn = document.getElementById('logout-btn');

const deckTitle = document.getElementById('deck-title');
const textbookName = document.getElementById('textbook-name');
const createDeckBtn = document.getElementById('create-deck-btn');
const decksList = document.getElementById('decks-list');

// =============================================================
// 3. 認証状態の監視 & ログイン処理
// =============================================================
supabase.auth.onAuthStateChange((event, session) => {
  if (session) {
    authSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');
    userStatus.classList.remove('hidden');
    userEmail.textContent = session.user.email;
    loadDecks();
  } else {
    authSection.classList.remove('hidden');
    dashboardSection.classList.add('hidden');
    userStatus.classList.add('hidden');
  }
});

// 新規登録
signupBtn.addEventListener('click', async () => {
  const { error } = await supabase.auth.signUp({
    email: authEmail.value,
    password: authPassword.value,
  });
  if (error) alert(`登録失敗: ${error.message}`);
  else alert('登録完了！そのままログインするか確認メールを処理してください。');
});

// ログイン
loginBtn.addEventListener('click', async () => {
  const { error } = await supabase.auth.signInWithPassword({
    email: authEmail.value,
    password: authPassword.value,
  });
  if (error) alert(`ログイン失敗: ${error.message}`);
});

// ログアウト
logoutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut();
});

// =============================================================
// 4. 単語帳（decks）の操作 (CRUD)
// =============================================================

// 単語帳一覧の取得
async function loadDecks() {
  decksList.innerHTML = '<p class="text-gray-500">読み込み中...</p>';
  
  const { data: decks, error } = await supabase
    .from('decks')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    decksList.innerHTML = `<p class="text-rose-500">取得エラー: ${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!decks || decks.length === 0) {
    decksList.innerHTML = '<p class="text-gray-500">まだ単語帳がありません。</p>';
    return;
  }

  decksList.innerHTML = decks.map(deck => `
    <div class="bg-white p-5 rounded-xl shadow border border-slate-100 flex justify-between items-start">
      <div>
        <h3 class="text-lg font-bold text-slate-800">${escapeHtml(deck.title)}</h3>
        <p class="text-xs text-indigo-600 font-semibold mt-1">${deck.textbook_name ? escapeHtml(deck.textbook_name) : '教科書未指定'}</p>
        <span class="inline-block mt-2 text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">公開設定: ${escapeHtml(deck.visibility || 'private')}</span>
      </div>
      <button onclick="window.deleteDeck('${deck.id}')" class="text-xs bg-rose-50 text-rose-600 hover:bg-rose-100 px-3 py-1.5 rounded font-medium transition">削除</button>
    </div>
  `).join('');
}

// 単語帳の作成
createDeckBtn.addEventListener('click', async () => {
  const title = deckTitle.value.trim();
  const textbook = textbookName.value.trim();

  if (!title) return alert('タイトルを入力してください');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return alert('ログインが必要です');

  const { error } = await supabase.from('decks').insert([
    {
      user_id: user.id,
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

// 単語帳の削除（HTML側の onclick から呼び出せるよう window オブジェクトに追加）
window.deleteDeck = async function(deckId) {
  if (!confirm('この単語帳を削除しますか？')) return;

  const { error } = await supabase.from('decks').delete().eq('id', deckId);
  if (error) {
    alert(`削除エラー: ${error.message}`);
  } else {
    loadDecks();
  }
};

// XSS対策用エスケープ関数
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
