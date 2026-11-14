import { supabaseClient, escapeHtml } from './config.js';
import { state } from './state.js';
import { fetchDisplayNames } from './auth.js';
import { updateUrlParams, showView } from './router.js';
import { setupAndRenderDeck, openDeck } from './deckDetail.js';
import { loadMyClasses } from './classes.js';

export async function refreshDashboard() {
  await Promise.all([
    loadDecks(),
    loadMyClasses(),
    loadSavedDecks(),
    loadPublicDecks(),
    loadLearningSummary()
  ]);
}

export async function loadDecks() {
  if (!state.currentUser) return;
  const listEl = document.getElementById('decks-list');
  listEl.innerHTML = '<p class="text-gray-500 text-sm">読み込み中...</p>';

  const { data: decks, error } = await supabaseClient
    .from('decks')
    .select('*')
    .eq('user_id', state.currentUser.id)
    .order('created_at', { ascending: false });

  if (error) {
    listEl.innerHTML = `<p class="text-rose-500 text-sm">取得エラー: ${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!decks || decks.length === 0) {
    listEl.innerHTML = '<p class="text-gray-500 text-sm">まだ単語帳がありません。</p>';
    return;
  }

  const visLabelMap = { private: '🔒 非公開', link: '🔗 リンク共有中', public: '🌐 全体公開' };

  listEl.innerHTML = decks.map(deck => `
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

export async function loadSavedDecks() {
  if (!state.currentUser) return;
  const listEl = document.getElementById('saved-decks-list');
  listEl.innerHTML = '<p class="text-gray-500 text-sm">読み込み中...</p>';

  const { data: savedRows, error } = await supabaseClient
    .from('saved_decks')
    .select('deck_id, saved_at, decks(*)')
    .eq('user_id', state.currentUser.id)
    .order('saved_at', { ascending: false });

  if (error) {
    listEl.innerHTML = `<p class="text-rose-500 text-sm">取得エラー: ${escapeHtml(error.message)}</p>`;
    return;
  }

  const validDecks = (savedRows || []).map(r => r.decks).filter(Boolean);
  if (validDecks.length === 0) {
    listEl.innerHTML = '<p class="text-gray-500 text-sm">まだ保存した単語帳はありません。</p>';
    return;
  }

  await fetchDisplayNames(validDecks.map(d => d.user_id));

  listEl.innerHTML = validDecks.map(deck => {
    const creatorName = state.profileCache[deck.user_id] || '作成者';
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

export async function loadPublicDecks() {
  if (!state.currentUser) return;
  const listEl = document.getElementById('public-decks-list');
  listEl.innerHTML = '<p class="text-gray-500 text-sm">読み込み中...</p>';

  const { data: decks, error } = await supabaseClient
    .from('decks')
    .select('*')
    .eq('visibility', 'public')
    .neq('user_id', state.currentUser.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    listEl.innerHTML = `<p class="text-rose-500 text-sm">取得エラー: ${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!decks || decks.length === 0) {
    listEl.innerHTML = '<p class="text-gray-500 text-sm">現在公開されている他のユーザーの単語帳はありません。</p>';
    return;
  }

  await fetchDisplayNames(decks.map(d => d.user_id));

  listEl.innerHTML = decks.map(deck => {
    const creatorName = state.profileCache[deck.user_id] || '作成者';
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

export async function openCreatorPage(targetUserId, skipPushState = false) {
  if (!skipPushState) updateUrlParams({ user: targetUserId });
  showView('creator');

  const listEl = document.getElementById('creator-decks-list');
  listEl.innerHTML = '<p class="text-slate-500 text-sm">読み込み中...</p>';

  await fetchDisplayNames([targetUserId]);
  const creatorName = state.profileCache[targetUserId] || 'ユーザー';
  const isMe = state.currentUser && state.currentUser.id === targetUserId;

  document.getElementById('creator-page-name').textContent = isMe ? `${creatorName}（あなた）` : creatorName;

  const { data: decks, error } = await supabaseClient.rpc('get_creator_decks', { target_user_id: targetUserId });
  if (error) {
    listEl.innerHTML = `<p class="text-rose-500 text-sm">取得エラー: ${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!decks || decks.length === 0) {
    document.getElementById('creator-page-summary').textContent = '作成した単語帳はまだありません';
    listEl.innerHTML = '<p class="text-slate-500 text-sm bg-white p-4 rounded-xl">単語帳がありません。</p>';
    return;
  }

  const publicCount = decks.filter(d => d.visibility === 'public').length;
  document.getElementById('creator-page-summary').textContent = `全 ${decks.length} セット作成（うち全体公開 ${publicCount} セット）`;

  listEl.innerHTML = decks.map(deck => {
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
    }
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
  }).join('');
}

function toLocalDateKey(dateObj) {
  return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
}

function getMondayKey(dateObj) {
  const d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return toLocalDateKey(d);
}

export async function loadLearningSummary() {
  if (!state.currentUser) return;
  const streakDaysEl = document.getElementById('stat-streak-days');
  if (!streakDaysEl) return;

  const [createdRes, logsRes] = await Promise.all([
    supabaseClient.from('decks').select('id', { count: 'exact', head: true }).eq('user_id', state.currentUser.id),
    supabaseClient.from('learning_logs').select('is_correct, reviewed_at, cards(deck_id)').eq('user_id', state.currentUser.id).order('reviewed_at', { ascending: false }).limit(5000)
  ]);

  const logs = logsRes.data || [];
  document.getElementById('stat-created-decks').textContent = createdRes.count || 0;

  const studiedDeckIds = new Set();
  const studiedDateSet = new Set();
  const studiedWeekSet = new Set();
  let correctCount = 0;

  logs.forEach(log => {
    if (log.is_correct) correctCount++;
    if (log.cards && log.cards.deck_id) studiedDeckIds.add(log.cards.deck_id);
    if (log.reviewed_at) {
      const dt = new Date(log.reviewed_at);
      studiedDateSet.add(toLocalDateKey(dt));
      studiedWeekSet.add(getMondayKey(dt));
    }
  });

  document.getElementById('stat-studied-decks').textContent = studiedDeckIds.size;
  document.getElementById('stat-total-logs').textContent = logs.length;
  document.getElementById('stat-overall-accuracy').textContent = logs.length > 0
    ? `正答率 ${Math.round((correctCount / logs.length) * 100)}%`
    : '正答率 --%';

  const now = new Date();
  const todayKey = toLocalDateKey(now);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const streakBadgeEl = document.getElementById('streak-status-badge');

  let streakDays = 0;
  let cursor = null;

  if (studiedDateSet.has(todayKey)) {
    cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    streakBadgeEl.textContent = '✨ 今日の学習達成済み！';
    streakBadgeEl.className = 'text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800';
  } else if (studiedDateSet.has(toLocalDateKey(yesterday))) {
    cursor = yesterday;
    streakBadgeEl.textContent = '⚡ 今日1問解くと連続記録が伸びます！';
    streakBadgeEl.className = 'text-xs font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-800';
  } else {
    streakBadgeEl.textContent = '🌱 今日から連続記録をスタートしよう';
    streakBadgeEl.className = 'text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-600';
  }

  while (cursor && studiedDateSet.has(toLocalDateKey(cursor))) {
    streakDays++;
    cursor.setDate(cursor.getDate() - 1);
  }

  const thisWeekKey = getMondayKey(now);
  const lastWeekDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
  let streakWeeks = 0;
  let weekCursor = studiedWeekSet.has(thisWeekKey)
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
    : (studiedWeekSet.has(getMondayKey(lastWeekDate)) ? lastWeekDate : null);

  while (weekCursor && studiedWeekSet.has(getMondayKey(weekCursor))) {
    streakWeeks++;
    weekCursor.setDate(weekCursor.getDate() - 7);
  }

  streakDaysEl.textContent = streakDays;
  document.getElementById('stat-streak-weeks').textContent = `（${streakWeeks}週連続学習中）`;

  const weekDayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const daysHtml = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const done = studiedDateSet.has(toLocalDateKey(d));
    const isToday = i === 0;
    daysHtml.push(`
      <div class="p-2 rounded-lg border ${done ? 'bg-amber-50 border-amber-300' : 'bg-slate-50 border-slate-100'} ${isToday ? 'ring-2 ring-indigo-400' : ''}">
        <p class="text-[10px] font-bold ${isToday ? 'text-indigo-600' : 'text-slate-400'}">${d.getMonth() + 1}/${d.getDate()}(${weekDayNames[d.getDay()]})</p>
        <div class="text-lg mt-1">${done ? '🔥' : '・'}</div>
      </div>
    `);
  }
  document.getElementById('weekly-activity-calendar').innerHTML = daysHtml.join('');
}

export function initDashboardEvents() {
  const createDeckBtn = document.getElementById('create-deck-btn');
  const deckTitleInput = document.getElementById('deck-title');
  const textbookInput = document.getElementById('textbook-name');

  createDeckBtn.addEventListener('click', async () => {
    const title = deckTitleInput.value.trim();
    const textbook = textbookInput.value.trim();
    if (!title) return alert('タイトルを入力してください');
    if (!state.currentUser) return alert('ログインが必要です');

    createDeckBtn.disabled = true;
    createDeckBtn.textContent = '作成中...';

    const { data: createdDeck, error } = await supabaseClient
      .from('decks')
      .insert([{
        user_id: state.currentUser.id,
        title,
        textbook_name: textbook || null,
        visibility: 'private',
        edit_access: 'owner'
      }])
      .select()
      .single();

    createDeckBtn.disabled = false;
    createDeckBtn.textContent = '作成する';

    if (error || !createdDeck) {
      alert(`作成エラー: ${error ? error.message : '作成に失敗しました'}`);
    } else {
      deckTitleInput.value = '';
      textbookInput.value = '';
      await setupAndRenderDeck(createdDeck, null, false);
      const firstInput = document.getElementById('dynamic-card-fields').querySelector('input, textarea');
      if (firstInput) firstInput.focus();
    }
  });

  window.deleteDeck = async function(deckId) {
    if (!confirm('この単語帳を削除しますか？（中のカードもすべて削除されます）')) return;
    const { error } = await supabaseClient.from('decks').delete().eq('id', deckId);
    if (error) alert(`削除エラー: ${error.message}`);
    else loadDecks();
  };

  window.removeSavedDeck = async function(deckId) {
    if (!state.currentUser) return;
    await supabaseClient.from('saved_decks').delete().eq('user_id', state.currentUser.id).eq('deck_id', deckId);
    loadSavedDecks();
  };

  window.openCreatorPage = openCreatorPage;
}
