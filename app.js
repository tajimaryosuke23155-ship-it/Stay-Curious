// =============================================================
// 1. Supabase 初期化
// =============================================================
const SUPABASE_URL = 'https://wiglfddygldrnebqfhpn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_cGuWmJFqG7OlKC7ZG5hz0w_wuYot0tY';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =============================================================
// 2. アプリケーション状態（State）
// =============================================================
let currentDeck = null;
let currentCards = [];
let weakCards = [];
let selectedCardType = 'basic';

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
const dashboardSection = document.getElementById('dashboard-section');
const deckDetailSection = document.getElementById('deck-detail-section');
const studySection = document.getElementById('study-section');

const homeLogo = document.getElementById('home-logo');
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

// 詳細・カード作成画面
const backToDashboardBtn = document.getElementById('back-to-dashboard-btn');
const detailDeckTitle = document.getElementById('detail-deck-title');
const detailDeckTextbook = document.getElementById('detail-deck-textbook');
const startWeakStudyBtn = document.getElementById('start-weak-study-btn');
const weakCardsCount = document.getElementById('weak-cards-count');
const startStudyBtn = document.getElementById('start-study-btn');

const statTotalCards = document.getElementById('stat-total-cards');
const statAccuracyRate = document.getElementById('stat-accuracy-rate');
const statWeakCards = document.getElementById('stat-weak-cards');

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

// =============================================================
// 4. SPA 画面遷移ルーター
// =============================================================
function showView(viewName) {
  authSection.classList.add('hidden');
  dashboardSection.classList.add('hidden');
  deckDetailSection.classList.add('hidden');
  studySection.classList.add('hidden');

  if (viewName === 'auth') authSection.classList.remove('hidden');
  if (viewName === 'dashboard') {
    dashboardSection.classList.remove('hidden');
    loadDecks();
  }
  if (viewName === 'detail') deckDetailSection.classList.remove('hidden');
  if (viewName === 'study') studySection.classList.remove('hidden');
}

homeLogo.addEventListener('click', async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) showView('dashboard');
});

backToDashboardBtn.addEventListener('click', () => {
  currentDeck = null;
  showView('dashboard');
});

// =============================================================
// 5. 認証状態の監視 & ログイン処理
// =============================================================
supabaseClient.auth.onAuthStateChange((event, session) => {
  if (session) {
    userStatus.classList.remove('hidden');
    userEmail.textContent = session.user.email;
    showView('dashboard');
  } else {
    userStatus.classList.add('hidden');
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
  await supabaseClient.auth.signOut();
});

// =============================================================
// 6. 単語帳（decks）の操作
// =============================================================
async function loadDecks() {
  decksList.innerHTML = '<p class="text-gray-500">読み込み中...</p>';

  const { data: decks, error } = await supabaseClient
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
    <div onclick="window.openDeck('${deck.id}')" class="bg-white p-5 rounded-xl shadow border border-slate-100 hover:border-indigo-300 hover:shadow-md cursor-pointer transition flex justify-between items-start">
      <div>
        <h3 class="text-lg font-bold text-slate-800">${escapeHtml(deck.title)}</h3>
        <p class="text-xs text-indigo-600 font-semibold mt-1">${deck.textbook_name ? escapeHtml(deck.textbook_name) : '教科書未指定'}</p>
        <span class="inline-block mt-2 text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">開いて学習・カード追加 →</span>
      </div>
      <button onclick="event.stopPropagation(); window.deleteDeck('${deck.id}')" class="text-xs bg-rose-50 text-rose-600 hover:bg-rose-100 px-3 py-1.5 rounded font-medium transition">削除</button>
    </div>
  `).join('');
}

createDeckBtn.addEventListener('click', async () => {
  const title = deckTitle.value.trim();
  const textbook = textbookName.value.trim();

  if (!title) return alert('タイトルを入力してください');

  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return alert('ログインが必要です');

  const { error } = await supabaseClient.from('decks').insert([
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
// 7. 単語帳詳細 & 4種類のカード作成・学習履歴集計
// =============================================================
window.openDeck = async function(deckId) {
  const { data: deck, error } = await supabaseClient
    .from('decks')
    .select('*')
    .eq('id', deckId)
    .single();

  if (error || !deck) {
    alert('単語帳の読み込みに失敗しました');
    return;
  }

  currentDeck = deck;
  detailDeckTitle.textContent = deck.title;
  detailDeckTextbook.textContent = deck.textbook_name ? `教科書: ${deck.textbook_name}` : '教科書未指定';

  renderCardFormFields(selectedCardType);
  showView('detail');
  await loadCardsAndStats(deck.id);
};

// タブ切り替えで入力フォームを動的生成
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

// カード追加処理
createCardBtn.addEventListener('click', async () => {
  if (!currentDeck) return;

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

// カード一覧 ＋ learning_logs から正答率と苦手問題を集計
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
    cardsList.innerHTML = '<p class="text-slate-500 text-sm bg-white p-4 rounded-xl">まだカードがありません。上のフォームから追加しましょう！</p>';
    return;
  }

  // この単語帳に含まれるカードの学習ログを取得（新しい順）
  const cardIds = currentCards.map(c => c.id);
  const { data: logs } = await supabaseClient
    .from('learning_logs')
    .select('card_id, is_correct, reviewed_at')
    .in('card_id', cardIds)
    .order('reviewed_at', { ascending: false });

  // カードIDごとに統計を集計
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
        lastResult: log.is_correct // 新しい順なので最初に来たものが最新結果
      };
    }
    statsByCard[log.card_id].attempts++;
    if (log.is_correct) statsByCard[log.card_id].correct++;
  });

  // 苦手カードの抽出（直近が不正解、または正答率70%未満）
  weakCards = currentCards.filter(card => {
    const st = statsByCard[card.id];
    if (!st || st.attempts === 0) return false; // 未学習は苦手扱いしない
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

    // 正答率バッジの生成
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
        <button onclick="window.deleteCard('${card.id}')" class="text-xs text-rose-500 hover:bg-rose-50 px-2.5 py-1 rounded transition shrink-0">削除</button>
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
  if (!confirm('このカードを削除しますか？')) return;
  const { error } = await supabaseClient.from('cards').delete().eq('id', cardId);
  if (error) alert(`削除エラー: ${error.message}`);
  else if (currentDeck) await loadCardsAndStats(currentDeck.id);
};

// =============================================================
// 8. 学習（クイズ）モード & 4カードタイプの出題・判定ロジック
// =============================================================
function startQuizSession(cardsToStudy, isWeakOnly) {
  if (!cardsToStudy || cardsToStudy.length === 0) {
    return alert('出題できるカードがありません');
  }
  studyQueue = [...cardsToStudy].sort(() => Math.random() - 0.5);
  studyIndex = 0;
  studyCorrectCount = 0;
  studyModeLabel = isWeakOnly ? '🔥 苦手復習モード' : '全問モード';

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
  if (currentDeck) window.openDeck(currentDeck.id);
  else showView('dashboard');
});

function renderStudyQuestion() {
  if (studyIndex >= studyQueue.length) {
    renderStudyComplete();
    return;
  }

  const card = studyQueue[studyIndex];
  questionStartTime = Date.now();
  studyProgress.textContent = `${studyIndex + 1} / ${studyQueue.length}`;

  // 1. 一問一答 (basic)
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

  // 2. 並べ替え (order)
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

  // 3. 複数要素（完答）(multi_element)
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

  // 4. 穴埋め (cloze)
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

  const { data: { user } } = await supabaseClient.auth.getUser();
  if (user && card) {
    await supabaseClient.from('learning_logs').insert([
      {
        user_id: user.id,
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
        <button type="button" onclick="window.openDeck('${currentDeck.id}')" class="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-6 py-3 rounded-xl transition">
          単語帳に戻る（成績を更新）
        </button>
      </div>
    </div>
  `;
}

// =============================================================
// 9. ユーティリティ
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
