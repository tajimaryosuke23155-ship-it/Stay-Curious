import { supabaseClient, escapeHtml } from './config.js';
import { state } from './state.js';
import { fetchDisplayNames } from './auth.js';
import { updateUrlParams, showView } from './router.js';
import { startQuizSession } from './study.js';
import { loadUserStarredCards } from './studyOptions.js';

export async function getUserFolders() {
  if (!state.currentUser) return [];
  const { data } = await supabaseClient
    .from('folders')
    .select('*, folder_decks(deck_id)')
    .eq('user_id', state.currentUser.id)
    .order('created_at', { ascending: false });
  return data || [];
}

export async function loadMyFolders() {
  if (!state.currentUser) return;
  const listEl = document.getElementById('folders-list');
  if (!listEl) return;
  listEl.innerHTML = '<p class="text-gray-500 text-sm">読み込み中...</p>';

  const folders = await getUserFolders();
  if (folders.length === 0) {
    listEl.innerHTML = '<p class="text-gray-500 text-sm">まだフォルダはありません。「＋ 新しいフォルダを作成」から科目やテスト範囲ごとにセットをまとめられます。</p>';
    return;
  }

  listEl.innerHTML = folders.map(folder => {
    const count = (folder.folder_decks || []).length;
    return `
      <div onclick="window.openFolderPage('${folder.id}')" class="bg-white p-5 rounded-xl shadow border border-amber-100 hover:border-amber-400 hover:shadow-md cursor-pointer transition flex justify-between items-start gap-3">
        <div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">📁 フォルダ</span>
            <span class="text-xs text-slate-500 font-semibold">${count} セット</span>
          </div>
          <h3 class="text-lg font-bold text-slate-800 mt-1.5">${escapeHtml(folder.title)}</h3>
          ${folder.description ? `<p class="text-xs text-slate-500 mt-1 line-clamp-1">${escapeHtml(folder.description)}</p>` : ''}
        </div>
        <span class="text-xs text-amber-700 font-bold shrink-0">開く →</span>
      </div>
    `;
  }).join('');
}

export async function openFolderPage(folderId, skipPushState = false) {
  const { data: folder, error } = await supabaseClient
    .from('folders')
    .select('*')
    .eq('id', folderId)
    .single();

  if (error || !folder) {
    alert('フォルダが見つかりません');
    updateUrlParams({}, true);
    showView('dashboard');
    return;
  }

  state.currentFolder = folder;
  if (!skipPushState) updateUrlParams({ folder: folder.id });

  showView('folder');
  document.getElementById('folder-detail-title').textContent = folder.title;
  document.getElementById('folder-detail-desc').textContent = folder.description || '説明なし';

  await loadFolderDecksAndSelector(folder.id);
}

export async function loadFolderDecksAndSelector(folderId) {
  const listEl = document.getElementById('folder-decks-list');
  const selectEl = document.getElementById('folder-add-deck-select');
  listEl.innerHTML = '<p class="text-slate-500 text-sm">読み込み中...</p>';

  const [
    { data: folderRows },
    { data: myDecks },
    { data: savedRows }
  ] = await Promise.all([
    supabaseClient.from('folder_decks').select('deck_id, added_at, decks(*)').eq('folder_id', folderId).order('added_at', { ascending: false }),
    supabaseClient.from('decks').select('id, title, user_id').eq('user_id', state.currentUser.id).order('created_at', { ascending: false }),
    supabaseClient.from('saved_decks').select('deck_id, decks(id, title, user_id)').eq('user_id', state.currentUser.id)
  ]);

  const inFolderIds = new Set((folderRows || []).map(r => r.deck_id));

  const candidateMap = new Map();
  (myDecks || []).forEach(d => {
    if (!inFolderIds.has(d.id)) candidateMap.set(d.id, { ...d, source: 'マイ単語帳' });
  });
  (savedRows || []).forEach(r => {
    if (r.decks && !inFolderIds.has(r.decks.id) && !candidateMap.has(r.decks.id)) {
      candidateMap.set(r.decks.id, { ...r.decks, source: '保存ライブラリ' });
    }
  });

  const candidates = [...candidateMap.values()];
  selectEl.innerHTML = candidates.length > 0
    ? `<option value="">フォルダに追加するセットを選択...</option>` +
      candidates.map(d => `<option value="${d.id}">[${d.source}] ${escapeHtml(d.title)}</option>`).join('')
    : `<option value="">追加できるセットがありません（マイ単語帳・ライブラリはすべて追加済み）</option>`;

  const validRows = (folderRows || []).filter(r => r.decks);
  document.getElementById('folder-decks-count').textContent = validRows.length;

  // フォルダ横断学習用カードと成績を集計
  await loadFolderStudyStats(validRows.map(r => r.decks.id));

  if (validRows.length === 0) {
    listEl.innerHTML = '<p class="text-slate-500 text-sm bg-white p-4 rounded-xl">このフォルダにはまだセットが入っていません。上のプルダウンからマイ単語帳や保存したライブラリを追加しましょう！</p>';
    return;
  }

  await fetchDisplayNames(validRows.map(r => r.decks.user_id));

  listEl.innerHTML = validRows.map(row => {
    const deck = row.decks;
    const isMine = deck.user_id === state.currentUser.id;
    const creatorName = state.profileCache[deck.user_id] || '作成者';
    return `
      <div onclick="window.openDeck('${deck.id}')" class="bg-white p-5 rounded-xl shadow border border-slate-100 hover:border-amber-300 hover:shadow-md cursor-pointer transition flex justify-between items-start gap-3">
        <div>
          <span class="text-xs font-bold px-2 py-0.5 rounded ${isMine ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-700'}">
            ${isMine ? '📚 マイ単語帳' : '⭐ ライブラリ'}
          </span>
          <h4 class="text-lg font-bold text-slate-800 mt-1">${escapeHtml(deck.title)}</h4>
          <p class="text-xs text-indigo-600 font-semibold mt-0.5">${deck.textbook_name ? escapeHtml(deck.textbook_name) : '教科書未指定'}</p>
          <button type="button" onclick="event.stopPropagation(); window.openCreatorPage('${deck.user_id}')" class="mt-2 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-indigo-600 hover:underline font-medium">
            👤 ${escapeHtml(creatorName)}
          </button>
        </div>
        <button type="button" onclick="event.stopPropagation(); window.removeDeckFromFolder('${folderId}', '${deck.id}')" class="text-xs bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 px-2.5 py-1 rounded font-medium transition shrink-0">フォルダから外す</button>
      </div>
    `;
  }).join('');
}

async function loadFolderStudyStats(deckIds) {
  await loadUserStarredCards();

  if (!deckIds || deckIds.length === 0) {
    state.folderAllCards = [];
    state.folderWeakCards = [];
    updateFolderStudyButtonsUI(0, 0, 0);
    return;
  }

  const { data: cards } = await supabaseClient
    .from('cards')
    .select('*')
    .in('deck_id', deckIds)
    .order('created_at', { ascending: true });

  state.folderAllCards = cards || [];

  if (state.folderAllCards.length === 0) {
    state.folderWeakCards = [];
    updateFolderStudyButtonsUI(0, 0, 0);
    return;
  }

  const cardIds = state.folderAllCards.map(c => c.id);
  const { data: logs } = await supabaseClient
    .from('learning_logs')
    .select('card_id, is_correct, reviewed_at')
    .eq('user_id', state.currentUser.id)
    .in('card_id', cardIds)
    .order('reviewed_at', { ascending: false });

  const statsByCard = {};
  (logs || []).forEach(log => {
    if (!statsByCard[log.card_id]) statsByCard[log.card_id] = { attempts: 0, correct: 0, lastResult: log.is_correct };
    statsByCard[log.card_id].attempts++;
    if (log.is_correct) statsByCard[log.card_id].correct++;
  });

  state.folderWeakCards = state.folderAllCards.filter(card => {
    const st = statsByCard[card.id];
    if (!st || st.attempts === 0) return false;
    return st.lastResult === false || (st.correct / st.attempts) < 0.7;
  });

  const starredCount = state.folderAllCards.filter(c => state.starredCardIds.has(c.id)).length;
  updateFolderStudyButtonsUI(state.folderAllCards.length, state.folderWeakCards.length, starredCount);
}

function updateFolderStudyButtonsUI(totalCount, weakCount, starredCount) {
  const allBtn = document.getElementById('folder-start-all-btn');
  const weakBtn = document.getElementById('folder-start-weak-btn');
  const starBtn = document.getElementById('folder-start-starred-btn');

  if (allBtn) {
    document.getElementById('folder-total-cards-count').textContent = totalCount;
    allBtn.disabled = totalCount === 0;
  }
  if (weakBtn) {
    document.getElementById('folder-weak-cards-count').textContent = weakCount;
    weakBtn.disabled = weakCount === 0;
  }
  if (starBtn) {
    document.getElementById('folder-starred-cards-count').textContent = starredCount;
    starBtn.disabled = starredCount === 0;
  }
}

export function initFolderEvents() {
  document.getElementById('create-folder-btn').addEventListener('click', async () => {
    const titleEl = document.getElementById('new-folder-title');
    const descEl = document.getElementById('new-folder-desc');
    const title = titleEl.value.trim();
    const desc = descEl.value.trim();
    if (!title) return alert('フォルダ名を入力してください');
    if (!state.currentUser) return;

    const { data: created, error } = await supabaseClient
      .from('folders')
      .insert([{ user_id: state.currentUser.id, title, description: desc || null }])
      .select()
      .single();

    if (error || !created) {
      alert(`フォルダ作成エラー: ${error ? error.message : '作成に失敗しました'}`);
      return;
    }

    titleEl.value = '';
    descEl.value = '';
    await openFolderPage(created.id);
  });

  document.getElementById('folder-add-deck-btn').addEventListener('click', async () => {
    if (!state.currentFolder || !state.currentUser) return;
    const deckId = document.getElementById('folder-add-deck-select').value;
    if (!deckId) return alert('追加するセットを選択してください');

    const { error } = await supabaseClient
      .from('folder_decks')
      .insert([{ folder_id: state.currentFolder.id, deck_id: deckId }]);

    if (error) alert(`追加エラー: ${error.message}`);
    else await loadFolderDecksAndSelector(state.currentFolder.id);
  });

  // フォルダ横断学習ボタン（全問 / 苦手 / 星つき）
  document.getElementById('folder-start-all-btn').addEventListener('click', () => {
    startQuizSession(state.folderAllCards, {
      isWeakMode: false,
      modeLabel: `📁 ${state.currentFolder.title}（全問）`,
      context: 'folder'
    });
  });

  document.getElementById('folder-start-weak-btn').addEventListener('click', () => {
    startQuizSession(state.folderWeakCards, {
      isWeakMode: true,
      modeLabel: `📁 ${state.currentFolder.title}（🔥 苦手）`,
      context: 'folder'
    });
  });

  document.getElementById('folder-start-starred-btn').addEventListener('click', () => {
    const starred = state.folderAllCards.filter(c => state.starredCardIds.has(c.id));
    startQuizSession(starred, {
      isWeakMode: false,
      modeLabel: `📁 ${state.currentFolder.title}（⭐ 星つき）`,
      context: 'folder'
    });
  });

  // フォルダの学習設定トグル（シャッフル / 表裏反転）
  const folderShuffleChk = document.getElementById('folder-opt-shuffle');
  const folderReverseChk = document.getElementById('folder-opt-reverse');
  if (folderShuffleChk) {
    folderShuffleChk.addEventListener('change', (e) => {
      state.studyOptions.shuffle = e.target.checked;
      const deckShuffle = document.getElementById('deck-opt-shuffle');
      if (deckShuffle) deckShuffle.checked = e.target.checked;
    });
  }
  if (folderReverseChk) {
    folderReverseChk.addEventListener('change', (e) => {
      state.studyOptions.reverse = e.target.checked;
      const deckReverse = document.getElementById('deck-opt-reverse');
      if (deckReverse) deckReverse.checked = e.target.checked;
    });
  }

  document.getElementById('edit-folder-btn').addEventListener('click', async () => {
    if (!state.currentFolder) return;
    const newTitle = prompt('新しいフォルダ名:', state.currentFolder.title);
    if (newTitle === null) return;
    const trimmed = newTitle.trim();
    if (!trimmed) return alert('フォルダ名を入力してください');
    const newDesc = prompt('フォルダの説明（任意）:', state.currentFolder.description || '');

    const { data: updated, error } = await supabaseClient
      .from('folders')
      .update({ title: trimmed, description: newDesc !== null ? (newDesc.trim() || null) : state.currentFolder.description })
      .eq('id', state.currentFolder.id)
      .select()
      .single();

    if (error) alert(`更新エラー: ${error.message}`);
    else if (updated) {
      state.currentFolder = updated;
      document.getElementById('folder-detail-title').textContent = updated.title;
      document.getElementById('folder-detail-desc').textContent = updated.description || '説明なし';
    }
  });

  document.getElementById('delete-folder-btn').addEventListener('click', async () => {
    if (!state.currentFolder) return;
    if (!confirm('このフォルダを削除しますか？（中の単語帳セット自体は削除されず、ライブラリに残ります）')) return;

    const { error } = await supabaseClient.from('folders').delete().eq('id', state.currentFolder.id);
    if (error) alert(`削除エラー: ${error.message}`);
    else {
      state.currentFolder = null;
      updateUrlParams({});
      showView('dashboard');
    }
  });

  window.openFolderPage = openFolderPage;

  window.removeDeckFromFolder = async function(folderId, deckId) {
    await supabaseClient.from('folder_decks').delete().eq('folder_id', folderId).eq('deck_id', deckId);
    await loadFolderDecksAndSelector(folderId);
  };
}
