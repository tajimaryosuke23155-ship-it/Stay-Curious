import { supabaseClient, escapeHtml } from './config.js';
import { state } from './state.js';
import { fetchDisplayNames } from './auth.js';
import { openDeck } from './deckDetail.js';
import { loadMyClasses } from './classes.js';
import { loadMyFolders } from './folders.js';

export async function loadDecks() {
  if (!state.currentUser) return;
  const decksListEl = document.getElementById('decks-list');
  decksListEl.innerHTML = '<p class="text-gray-500 text-sm">読み込み中...</p>';

  const { data: decks, error } = await supabaseClient
    .from('decks')
    .select('*')
    .eq('user_id', state.currentUser.id)
    .order('created_at', { ascending: false });

  if (error) {
    decksListEl.innerHTML = `<p class="text-rose-500 text-sm">読み込みエラー: ${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!decks || decks.length === 0) {
    decksListEl.innerHTML = '<p class="text-gray-500 text-sm">まだ単語帳がありません。上のフォームから作成しましょう！</p>';
    return;
  }

  const visBadgeMap = {
    private: { text: '🔒 非公開', cls: 'bg-slate-100 text-slate-600' },
    link: { text: '🔗 限定公開', cls: 'bg-amber-100 text-amber-800' },
    public: { text: '🌐 全体公開', cls: 'bg-emerald-100 text-emerald-700' }
  };

  decksListEl.innerHTML = decks.map(deck => {
    const vb = visBadgeMap[deck.visibility || 'private'];
    return `
      <div onclick="window.openDeck('${deck.id}')" class="bg-white p-5 rounded-xl shadow hover:shadow-md cursor-pointer transition border border-slate-100 hover:border-indigo-300 flex flex-col justify-between">
        <div>
          <div class="flex justify-between items-start gap-2">
            <h3 class="text-lg font-bold text-slate-800">${escapeHtml(deck.title)}</h3>
            <span class="text-[11px] font-semibold px-2 py-0.5 rounded shrink-0 ${vb.cls}">${vb.text}</span>
          </div>
          <p class="text-xs text-indigo-600 font-semibold mt-1">${deck.textbook_name ? escapeHtml(deck.textbook_name) : '教科書未指定'}</p>
        </div>
        <div class="flex justify-between items-center mt-4 pt-2 border-t border-slate-100">
          <span class="text-xs text-slate-400">作成日: ${new Date(deck.created_at).toLocaleDateString('ja-JP')}</span>
          <span class="text-xs text-indigo-600 font-semibold">開く →</span>
        </div>
      </div>
    `;
  }).join('');
}

export async function loadSavedDecks() {
  if (!state.currentUser) return;
  const savedListEl = document.getElementById('saved-decks-list');
  savedListEl.innerHTML = '<p class="text-gray-500 text-sm">読み込み中...</p>';

  const { data: rows, error } = await supabaseClient
    .from('saved_decks')
    .select('deck_id, created_at, decks(*)')
    .eq('user_id', state.currentUser.id)
    .order('created_at', { ascending: false });

  if (error) {
    savedListEl.innerHTML = `<p class="text-rose-500 text-sm">読み込みエラー: ${escapeHtml(error.message)}</p>`;
    return;
  }

  const validDecks = (rows || []).map(r => r.decks).filter(Boolean);
  if (validDecks.length === 0) {
    savedListEl.innerHTML = '<p class="text-gray-500 text-sm">まだ保存したライブラリはありません。他の人の単語帳を開いて「☆ ライブラリに保存」を押すとここに追加されます。</p>';
    return;
  }

  await fetchDisplayNames(validDecks.map(d => d.user_id));

  savedListEl.innerHTML = validDecks.map(deck => {
    const creatorName = state.profileCache[deck.user_id] || '作成者';
    return `
      <div onclick="window.openDeck('${deck.id}')" class="bg-white p-5 rounded-xl shadow hover:shadow-md cursor-pointer transition border border-amber-100 hover:border-amber-400 flex flex-col justify-between">
        <div>
          <div class="flex justify-between items-start gap-2">
            <h3 class="text-lg font-bold text-slate-800">${escapeHtml(deck.title)}</h3>
            <span class="text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800 shrink-0">⭐ 保存済み</span>
          </div>
          <p class="text-xs text-indigo-600 font-semibold mt-1">${deck.textbook_name ? escapeHtml(deck.textbook_name) : '教科書未指定'}</p>
        </div>
        <div class="flex justify-between items-center mt-4 pt-2 border-t border-slate-100">
          <button type="button" onclick="event.stopPropagation(); window.openCreatorPage('${deck.user_id}')" class="text-xs text-slate-600 hover:text-indigo-600 hover:underline font-medium flex items-center gap-1">
            👤 ${escapeHtml(creatorName)}
          </button>
          <span class="text-xs text-amber-700 font-semibold">学習する →</span>
        </div>
      </div>
    `;
  }).join('');
}

export async function loadPublicDecks() {
  if (!state.currentUser) return;
  const publicListEl = document.getElementById('public-decks-list');
  publicListEl.innerHTML = '<p class="text-gray-500 text-sm">読み込み中...</p>';

  const { data: decks, error } = await supabaseClient
    .from('decks')
    .select('*')
    .eq('visibility', 'public')
    .neq('user_id', state.currentUser.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    publicListEl.innerHTML = `<p class="text-rose-500 text-sm">読み込みエラー: ${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!decks || decks.length === 0) {
    publicListEl.innerHTML = '<p class="text-gray-500 text-sm">現在公開されている他のユーザーの単語帳はありません。</p>';
    return;
  }

  await fetchDisplayNames(decks.map(d => d.user_id));

  publicListEl.innerHTML = decks.map(deck => {
    const creatorName = state.profileCache[deck.user_id] || '作成者';
    return `
      <div onclick="window.openDeck('${deck.id}')" class="bg-white p-5 rounded-xl shadow hover:shadow-md cursor-pointer transition border border-slate-100 hover:border-emerald-300 flex flex-col justify-between">
        <div>
          <div class="flex justify-between items-start gap-2">
            <h3 class="text-lg font-bold text-slate-800">${escapeHtml(deck.title)}</h3>
            <span class="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 shrink-0">🌐 公開</span>
          </div>
          <p class="text-xs text-indigo-600 font-semibold mt-1">${deck.textbook_name ? escapeHtml(deck.textbook_name) : '教科書未指定'}</p>
        </div>
        <div class="flex justify-between items-center mt-4 pt-2 border-t border-slate-100">
          <button type="button" onclick="event.stopPropagation(); window.openCreatorPage('${deck.user_id}')" class="text-xs text-slate-600 hover:text-indigo-600 hover:underline font-medium flex items-center gap-1">
            👤 ${escapeHtml(creatorName)}
          </button>
          <span class="text-xs text-emerald-600 font-semibold">学習する →</span>
        </div>
      </div>
    `;
  }).join('');
}

function getLocalDateStr(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function loadLearningStats() {
  if (!state.currentUser) return;

  const [
    { count: createdCount },
    { data: logs }
  ] = await Promise.all([
    supabaseClient.from('decks').select('*', { count: 'exact', head: true }).eq('user_id', state.currentUser.id),
    supabaseClient.from('learning_logs').select('card_id, is_correct, reviewed_at, cards(deck_id)').eq('user_id', state.currentUser.id).order('reviewed_at', { ascending: false }).limit(5000)
  ]);

  document.getElementById('stat-created-decks').textContent = createdCount || 0;

  const safeLogs = logs || [];
  const totalLogs = safeLogs.length;
  const totalCorrect = safeLogs.filter(l => l.is_correct).length;

  document.getElementById('stat-total-logs').textContent = totalLogs;
  document.getElementById('stat-overall-accuracy').textContent = totalLogs > 0
    ? `正答率 ${Math.round((totalCorrect / totalLogs) * 100)}%`
    : '正答率 --%';

  const studiedDeckIds = new Set();
  const activeDatesSet = new Set();
  const logsCountByDate = {};

  safeLogs.forEach(log => {
    if (log.cards && log.cards.deck_id) studiedDeckIds.add(log.cards.deck_id);
    if (log.reviewed_at) {
      const dateStr = getLocalDateStr(new Date(log.reviewed_at));
      activeDatesSet.add(dateStr);
      logsCountByDate[dateStr] = (logsCountByDate[dateStr] || 0) + 1;
    }
  });
  document.getElementById('stat-studied-decks').textContent = studiedDeckIds.size;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const todayStr = getLocalDateStr(today);
  const yesterdayStr = getLocalDateStr(yesterday);

  let streakDays = 0;
  let checkCursor = null;

  if (activeDatesSet.has(todayStr)) checkCursor = new Date(today);
  else if (activeDatesSet.has(yesterdayStr)) checkCursor = new Date(yesterday);

  if (checkCursor) {
    while (activeDatesSet.has(getLocalDateStr(checkCursor))) {
      streakDays++;
      checkCursor.setDate(checkCursor.getDate() - 1);
    }
  }

  document.getElementById('stat-streak-days').textContent = streakDays;
  document.getElementById('stat-streak-weeks').textContent = `（${Math.floor(streakDays / 7)}週連続）`;

  const badgeEl = document.getElementById('streak-status-badge');
  if (activeDatesSet.has(todayStr)) {
    badgeEl.textContent = '✨ 今日の学習達成済み！';
    badgeEl.className = 'text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-700';
  } else if (streakDays > 0) {
    badgeEl.textContent = '⏳ 今日学習するとストリーク継続！';
    badgeEl.className = 'text-xs font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-800';
  } else {
    badgeEl.textContent = '🌱 今日から連続記録をスタートしよう';
    badgeEl.className = 'text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-600';
  }

  const calEl = document.getElementById('weekly-activity-calendar');
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const cellsHtml = [];

  for (let offset = 6; offset >= 0; offset--) {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    const dStr = getLocalDateStr(d);
    const count = logsCountByDate[dStr] || 0;
    const isToday = offset === 0;
    const dayLabel = dayNames[d.getDay()];

    cellsHtml.push(`
      <div class="p-2 rounded-lg border ${count > 0 ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-slate-200'} ${isToday ? 'ring-2 ring-indigo-400' : ''}">
        <p class="text-[10px] font-bold ${isToday ? 'text-indigo-600' : 'text-slate-500'}">${isToday ? '今日' : dayLabel}</p>
        <div class="my-1 text-base">${count > 0 ? '🔥' : '・'}</div>
        <p class="text-[10px] font-semibold ${count > 0 ? 'text-emerald-700' : 'text-slate-400'}">${count > 0 ? `${count}問` : '0問'}</p>
      </div>
    `);
  }
  calEl.innerHTML = cellsHtml.join('');
}

export function initDashboardEvents() {
  document.getElementById('create-deck-btn').addEventListener('click', async () => {
    const titleInput = document.getElementById('deck-title');
    const textbookInput = document.getElementById('textbook-name');
    const title = titleInput.value.trim();
    const textbookName = textbookInput.value.trim();

    if (!title) return alert('単語帳タイトルを入力してください');
    if (!state.currentUser) return;

    const { data: createdDeck, error } = await supabaseClient
      .from('decks')
      .insert([{ user_id: state.currentUser.id, title, textbook_name: textbookName || null }])
      .select()
      .single();

    if (error || !createdDeck) {
      alert(`作成エラー: ${error ? error.message : 'データの取得に失敗しました'}`);
      return;
    }

    titleInput.value = '';
    textbookInput.value = '';
    await openDeck(createdDeck.id);
  });

  window.refreshDashboard = async function() {
    await Promise.all([
      loadDecks(),
      loadMyFolders(),
      loadMyClasses(),
      loadSavedDecks(),
      loadPublicDecks(),
      loadLearningStats()
    ]);
  };
}
