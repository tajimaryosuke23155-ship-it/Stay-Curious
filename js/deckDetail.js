import { supabaseClient, escapeHtml } from './config.js';
import { state } from './state.js';
import { fetchDisplayNames } from './auth.js';
import { updateUrlParams, showView } from './router.js';
import { getUserClasses } from './classes.js';
import { startQuizSession } from './study.js';

export async function openDeck(deckId, autoStudyMode = null, skipPushState = false) {
  const { data: deck, error } = await supabaseClient.from('decks').select('*').eq('id', deckId).single();
  if (error || !deck) {
    alert('単語帳が見つからないか、アクセス権限がありません');
    updateUrlParams({}, true);
    showView('dashboard');
    return;
  }
  await setupAndRenderDeck(deck, autoStudyMode, skipPushState);
}

export async function openDeckByShareId(shareId, autoStudyMode = null) {
  const { data: deck, error } = await supabaseClient.from('decks').select('*').eq('share_id', shareId).single();
  if (error || !deck) {
    alert('共有リンクが無効か、非公開に設定されています');
    updateUrlParams({}, true);
    showView('dashboard');
    return;
  }
  await setupAndRenderDeck(deck, autoStudyMode, true);
}

export async function setupAndRenderDeck(deck, autoStudyMode = null, skipPushState = false) {
  state.currentDeck = deck;
  state.isDeckOwner = state.currentUser && deck.user_id === state.currentUser.id;

  if (!skipPushState) {
    const params = deck.share_id && !state.isDeckOwner ? { share: deck.share_id } : { deck: deck.id };
    if (autoStudyMode) params.mode = autoStudyMode;
    updateUrlParams(params);
  }

  document.getElementById('detail-deck-title').textContent = deck.title;
  document.getElementById('detail-deck-textbook').textContent = deck.textbook_name ? `教科書: ${deck.textbook_name}` : '教科書未指定';

  await fetchDisplayNames([deck.user_id]);
  document.getElementById('detail-creator-name').textContent = state.profileCache[deck.user_id] || '作成者';
  document.getElementById('detail-creator-btn').onclick = () => window.openCreatorPage(deck.user_id);

  document.getElementById('deck-title-display-area').classList.remove('hidden');
  document.getElementById('deck-title-edit-area').classList.add('hidden');

  const editDeckMetaBtn = document.getElementById('edit-deck-meta-btn');
  const sharedDeckBadge = document.getElementById('shared-deck-badge');
  const shareSettingsPanel = document.getElementById('share-settings-panel');
  const createCardContainer = document.getElementById('create-card-container');

  if (state.isDeckOwner) {
    editDeckMetaBtn.classList.remove('hidden');
    sharedDeckBadge.classList.add('hidden');
    shareSettingsPanel.classList.remove('hidden');
    createCardContainer.classList.remove('hidden');
    document.getElementById('deck-visibility-select').value = deck.visibility || 'private';
    updateShareLinkBox(deck);
    await renderDeckClassShareToggles(deck.id);
  } else {
    editDeckMetaBtn.classList.add('hidden');
    sharedDeckBadge.classList.remove('hidden');
    shareSettingsPanel.classList.add('hidden');
    createCardContainer.classList.add('hidden');
  }

  await checkAndRenderSaveButton(deck.id);
  renderCardFormFields(state.selectedCardType);
  await loadCardsAndStats(deck.id);

  if (autoStudyMode === 'study' && state.currentCards.length > 0) {
    startQuizSession(state.currentCards, false, true);
  } else if (autoStudyMode === 'weak' && state.weakCards.length > 0) {
    startQuizSession(state.weakCards, true, true);
  } else {
    showView('detail');
  }
}

function updateShareLinkBox(deck) {
  const box = document.getElementById('share-link-box');
  if (deck.visibility === 'link' || deck.visibility === 'public') {
    box.classList.remove('hidden');
    const shareUrl = new URL(window.location.href);
    shareUrl.search = `?share=${deck.share_id}`;
    document.getElementById('share-url-input').value = shareUrl.toString();
  } else {
    box.classList.add('hidden');
  }
}

async function checkAndRenderSaveButton(deckId) {
  const btn = document.getElementById('toggle-save-deck-btn');
  if (!state.currentUser || state.isDeckOwner) {
    btn.classList.add('hidden');
    return;
  }
  btn.classList.remove('hidden');
  const { data } = await supabaseClient.from('saved_decks').select('deck_id').eq('user_id', state.currentUser.id).eq('deck_id', deckId).maybeSingle();
  state.isCurrentDeckSaved = Boolean(data);
  updateSaveButtonUI();
}

function updateSaveButtonUI() {
  const btn = document.getElementById('toggle-save-deck-btn');
  if (state.isCurrentDeckSaved) {
    btn.textContent = '⭐ ライブラリ保存済み';
    btn.className = 'border-2 border-amber-500 bg-amber-400 hover:bg-amber-500 text-slate-900 px-4 py-3 rounded-xl font-bold shadow-sm transition';
  } else {
    btn.textContent = '☆ ライブラリに保存';
    btn.className = 'border-2 border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-800 px-4 py-3 rounded-xl font-bold shadow-sm transition';
  }
}

async function renderDeckClassShareToggles(deckId) {
  const box = document.getElementById('deck-class-share-box');
  const toggles = document.getElementById('deck-class-toggles');
  const userClasses = await getUserClasses();

  if (userClasses.length === 0) {
    box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');

  const { data: sharedRows } = await supabaseClient.from('class_decks').select('class_id').eq('deck_id', deckId);
  const sharedSet = new Set((sharedRows || []).map(r => r.class_id));

  toggles.innerHTML = userClasses.map(cls => {
    const isShared = sharedSet.has(cls.id);
    return `
      <button type="button" onclick="window.toggleDeckClassShare('${deckId}', '${cls.id}', ${isShared})"
        class="text-xs px-2.5 py-1 rounded-full font-semibold border transition ${isShared ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'}">
        ${isShared ? '✓ ' : '+ '}${escapeHtml(cls.name)}
      </button>
    `;
  }).join('');
}

export function renderCardFormFields(type) {
  const container = document.getElementById('dynamic-card-fields');
  if (type === 'basic') {
    container.innerHTML = `
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
    container.innerHTML = `
      <div>
        <label class="block text-sm font-medium mb-1">問題文（何を並べ替えるか）</label>
        <input type="text" id="input-order-prompt" class="w-full border rounded p-2" placeholder="例: 以下の出来事を古い順に並べ替えよ">
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">正しい順番の要素（1行に1つずつ、上から正解順に入力）</label>
        <textarea id="input-order-items" rows="4" class="w-full border rounded p-2" placeholder="大化の改新
平城京遷都
平安京遷都"></textarea>
      </div>
    `;
  } else if (type === 'multi_element') {
    container.innerHTML = `
      <div>
        <label class="block text-sm font-medium mb-1">問題文</label>
        <input type="text" id="input-multi-prompt" class="w-full border rounded p-2" placeholder="例: 日本国憲法の三原則をすべて挙げよ">
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">正解となる要素（1行に1つずつ入力・順不同で完答判定）</label>
        <textarea id="input-multi-answers" rows="4" class="w-full border rounded p-2" placeholder="国民主権
基本的人権の尊重
平和主義"></textarea>
      </div>
    `;
  } else if (type === 'cloze') {
    container.innerHTML = `
      <div>
        <label class="block text-sm font-medium mb-1">穴埋め文章（空欄にしたい語句を <code class="bg-slate-100 px-1 rounded text-indigo-600">{{語句}}</code> で囲む）</label>
        <textarea id="input-cloze-text" rows="3" class="w-full border rounded p-2" placeholder="例: 光合成は植物の{{葉緑体}}で行われ、二酸化炭素と水から{{デンプン}}と酸素をつくる。"></textarea>
      </div>
    `;
  }
}

export async function loadCardsAndStats(deckId) {
  const cardsListEl = document.getElementById('cards-list');
  cardsListEl.innerHTML = '<p class="text-slate-500 text-sm">カードと学習履歴を読み込み中...</p>';

  const { data: cards, error } = await supabaseClient.from('cards').select('*').eq('deck_id', deckId).order('created_at', { ascending: true });
  if (error) {
    cardsListEl.innerHTML = `<p class="text-rose-500 text-sm">読み込みエラー: ${escapeHtml(error.message)}</p>`;
    return;
  }

  state.currentCards = cards || [];
  document.getElementById('cards-count').textContent = state.currentCards.length;
  document.getElementById('stat-total-cards').textContent = `${state.currentCards.length}枚`;

  if (state.currentCards.length === 0) {
    state.weakCards = [];
    updateStatsUI(0, 0, 0);
    cardsListEl.innerHTML = '<p class="text-slate-500 text-sm bg-white p-4 rounded-xl">まだカードがありません。</p>';
    return;
  }

  const cardIds = state.currentCards.map(c => c.id);
  const { data: logs } = await supabaseClient
    .from('learning_logs')
    .select('card_id, is_correct, reviewed_at')
    .eq('user_id', state.currentUser.id)
    .in('card_id', cardIds)
    .order('reviewed_at', { ascending: false });

  const statsByCard = {};
  let totalAttempts = 0;
  let totalCorrect = 0;

  (logs || []).forEach(log => {
    totalAttempts++;
    if (log.is_correct) totalCorrect++;
    if (!statsByCard[log.card_id]) statsByCard[log.card_id] = { attempts: 0, correct: 0, lastResult: log.is_correct };
    statsByCard[log.card_id].attempts++;
    if (log.is_correct) statsByCard[log.card_id].correct++;
  });

  state.weakCards = state.currentCards.filter(card => {
    const st = statsByCard[card.id];
    if (!st || st.attempts === 0) return false;
    return st.lastResult === false || (st.correct / st.attempts) < 0.7;
  });

  updateStatsUI(totalAttempts, totalCorrect, state.weakCards.length);

  const typeBadgeMap = {
    basic: { label: '一問一答', color: 'bg-blue-100 text-blue-700' },
    order: { label: '並べ替え', color: 'bg-amber-100 text-amber-700' },
    multi_element: { label: '複数要素', color: 'bg-purple-100 text-purple-700' },
    cloze: { label: '穴埋め', color: 'bg-emerald-100 text-emerald-700' }
  };

  cardsListEl.innerHTML = state.currentCards.map(card => {
    const badge = typeBadgeMap[card.card_type] || { label: card.card_type, color: 'bg-slate-100 text-slate-700' };
    const st = statsByCard[card.id];
    const isWeak = state.weakCards.some(w => w.id === card.id);

    let accuracyHtml = '<span class="text-xs text-slate-400">未学習</span>';
    if (st && st.attempts > 0) {
      const pct = Math.round((st.correct / st.attempts) * 100);
      const rateColor = pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-rose-600';
      accuracyHtml = `<span class="text-xs font-semibold ${rateColor}">正答率 ${pct}% (${st.correct}/${st.attempts})</span>`;
    }

    let summaryHtml = '';
    if (card.card_type === 'basic') {
      summaryHtml = `<p class="font-bold text-slate-800">${escapeHtml(card.content.front)}</p><p class="text-sm text-slate-600 mt-1">答: ${escapeHtml(card.content.back)}</p>`;
    } else if (card.card_type === 'order') {
      summaryHtml = `<p class="font-bold text-slate-800">${escapeHtml(card.content.prompt)}</p><p class="text-xs text-slate-600 mt-1">正解順: ${card.content.items.map(escapeHtml).join(' → ')}</p>`;
    } else if (card.card_type === 'multi_element') {
      summaryHtml = `<p class="font-bold text-slate-800">${escapeHtml(card.content.prompt)}</p><p class="text-xs text-slate-600 mt-1">要素 (${card.content.answers.length}個): ${card.content.answers.map(escapeHtml).join(' / ')}</p>`;
    } else if (card.card_type === 'cloze') {
      const formatted = escapeHtml(card.content.text).replace(/\{\{(.+?)\}\}/g, '<span class="font-bold text-emerald-700 underline">[$1]</span>');
      summaryHtml = `<p class="text-slate-800">${formatted}</p>`;
    }

    const metaText = [card.page_number !== null ? `P.${card.page_number}` : '', card.question_number || ''].filter(Boolean).join(' / ');

    return `
      <div id="card-item-${card.id}" class="bg-white p-4 rounded-xl shadow-sm border ${isWeak ? 'border-rose-200' : 'border-slate-100'} space-y-3">
        <div class="flex justify-between items-start gap-4">
          <div class="space-y-1 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs font-semibold px-2 py-0.5 rounded ${badge.color}">${badge.label}</span>
              ${isWeak ? '<span class="text-xs font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-700">🔥 要復習</span>' : ''}
              ${accuracyHtml}
              ${metaText ? `<span class="text-xs text-slate-400">・${escapeHtml(metaText)}</span>` : ''}
            </div>
            <div class="pt-1">${summaryHtml}</div>
          </div>
          ${state.isDeckOwner ? `
            <div class="flex gap-1.5 shrink-0">
              <button type="button" onclick="window.openEditCard('${card.id}')" class="text-xs bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 px-2.5 py-1 rounded font-medium transition">✎ 編集</button>
              <button type="button" onclick="window.deleteCard('${card.id}')" class="text-xs text-rose-500 hover:bg-rose-50 px-2.5 py-1 rounded font-medium transition">削除</button>
            </div>
          ` : ''}
        </div>
        <div id="card-edit-form-${card.id}" class="hidden pt-3 border-t border-slate-100 bg-slate-50 p-3.5 rounded-lg space-y-2.5"></div>
      </div>
    `;
  }).join('');
}

function updateStatsUI(totalAttempts, totalCorrect, weakCount) {
  document.getElementById('stat-accuracy-rate').textContent = totalAttempts > 0 ? `${Math.round((totalCorrect / totalAttempts) * 100)}%` : '--%';
  document.getElementById('stat-weak-cards').textContent = `${weakCount}枚`;
  document.getElementById('weak-cards-count').textContent = weakCount;
  document.getElementById('start-weak-study-btn').disabled = weakCount === 0;
}

export function initDeckDetailEvents() {
  // タイトル・教科書名のインライン編集
  document.getElementById('edit-deck-meta-btn').addEventListener('click', () => {
    if (!state.currentDeck || !state.isDeckOwner) return;
    const titleInput = document.getElementById('edit-deck-title-input');
    titleInput.value = state.currentDeck.title || '';
    document.getElementById('edit-deck-textbook-input').value = state.currentDeck.textbook_name || '';
    document.getElementById('deck-title-display-area').classList.add('hidden');
    document.getElementById('deck-title-edit-area').classList.remove('hidden');
    titleInput.focus();
    titleInput.select();
  });

  document.getElementById('cancel-deck-meta-btn').addEventListener('click', () => {
    document.getElementById('deck-title-edit-area').classList.add('hidden');
    document.getElementById('deck-title-display-area').classList.remove('hidden');
  });

  document.getElementById('save-deck-meta-btn').addEventListener('click', async () => {
    if (!state.currentDeck || !state.isDeckOwner) return;
    const newTitle = document.getElementById('edit-deck-title-input').value.trim();
    const newTextbook = document.getElementById('edit-deck-textbook-input').value.trim();
    if (!newTitle) return alert('タイトルを入力してください');

    const { data: updated, error } = await supabaseClient
      .from('decks')
      .update({ title: newTitle, textbook_name: newTextbook || null })
      .eq('id', state.currentDeck.id)
      .select()
      .single();

    if (error) alert(`更新エラー: ${error.message}`);
    else if (updated) {
      state.currentDeck = updated;
      document.getElementById('detail-deck-title').textContent = updated.title;
      document.getElementById('detail-deck-textbook').textContent = updated.textbook_name ? `教科書: ${updated.textbook_name}` : '教科書未指定';
      document.getElementById('deck-title-edit-area').classList.add('hidden');
      document.getElementById('deck-title-display-area').classList.remove('hidden');
    }
  });

  // ライブラリ保存
  document.getElementById('toggle-save-deck-btn').addEventListener('click', async () => {
    if (!state.currentUser || !state.currentDeck || state.isDeckOwner) return;
    if (state.isCurrentDeckSaved) {
      await supabaseClient.from('saved_decks').delete().eq('user_id', state.currentUser.id).eq('deck_id', state.currentDeck.id);
      state.isCurrentDeckSaved = false;
    } else {
      await supabaseClient.from('saved_decks').insert([{ user_id: state.currentUser.id, deck_id: state.currentDeck.id }]);
      state.isCurrentDeckSaved = true;
    }
    updateSaveButtonUI();
  });

  // 公開設定変更 & URLコピー
  document.getElementById('deck-visibility-select').addEventListener('change', async (e) => {
    if (!state.currentDeck || !state.isDeckOwner) return;
    const { data, error } = await supabaseClient.from('decks').update({ visibility: e.target.value }).eq('id', state.currentDeck.id).select().single();
    if (error) alert(`公開設定の更新に失敗しました: ${error.message}`);
    else if (data) {
      state.currentDeck = data;
      updateShareLinkBox(data);
    }
  });

  document.getElementById('copy-share-url-btn').addEventListener('click', async () => {
    const input = document.getElementById('share-url-input');
    const btn = document.getElementById('copy-share-url-btn');
    try {
      await navigator.clipboard.writeText(input.value);
      const orig = btn.textContent;
      btn.textContent = '✓ コピー完了！';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    } catch {
      input.select();
      document.execCommand('copy');
      alert('共有URLをコピーしました！');
    }
  });

  // カード種別タブ切替
  const cardTypeTabs = document.querySelectorAll('.card-type-tab');
  cardTypeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      state.selectedCardType = tab.dataset.cardType;
      cardTypeTabs.forEach(t => {
        t.classList.remove('bg-indigo-600', 'text-white');
        t.classList.add('bg-slate-100', 'text-slate-700');
      });
      tab.classList.remove('bg-slate-100', 'text-slate-700');
      tab.classList.add('bg-indigo-600', 'text-white');
      renderCardFormFields(state.selectedCardType);
    });
  });

  // カード新規作成
  document.getElementById('create-card-btn').addEventListener('click', async () => {
    if (!state.currentDeck || !state.isDeckOwner) return;
    let content = null;
    const type = state.selectedCardType;

    if (type === 'basic') {
      const front = document.getElementById('input-basic-front').value.trim();
      const back = document.getElementById('input-basic-back').value.trim();
      if (!front || !back) return alert('表面と裏面の両方を入力してください');
      content = { front, back };
    } else if (type === 'order') {
      const prompt = document.getElementById('input-order-prompt').value.trim();
      const items = document.getElementById('input-order-items').value.split('\n').map(s => s.trim()).filter(Boolean);
      if (!prompt || items.length < 2) return alert('問題文と、2つ以上の並べ替え要素を入力してください');
      content = { prompt, items };
    } else if (type === 'multi_element') {
      const prompt = document.getElementById('input-multi-prompt').value.trim();
      const answers = document.getElementById('input-multi-answers').value.split('\n').map(s => s.trim()).filter(Boolean);
      if (!prompt || answers.length < 2) return alert('問題文と、2つ以上の正解要素を入力してください');
      content = { prompt, answers };
    } else if (type === 'cloze') {
      const text = document.getElementById('input-cloze-text').value.trim();
      if (!text || [...text.matchAll(/\{\{(.+?)\}\}/g)].length === 0) {
        return alert('空欄にしたい部分を {{答え}} のように二重波括弧で囲んでください');
      }
      content = { text };
    }

    const pageInput = document.getElementById('card-page-number');
    const qNumInput = document.getElementById('card-question-number');
    const pageVal = pageInput.value ? parseInt(pageInput.value, 10) : null;
    const qNumVal = qNumInput.value.trim() || null;

    const { error } = await supabaseClient.from('cards').insert([{
      deck_id: state.currentDeck.id,
      card_type: type,
      page_number: pageVal,
      question_number: qNumVal,
      content
    }]);

    if (error) {
      alert(`カード追加エラー: ${error.message}`);
    } else {
      renderCardFormFields(type);
      qNumInput.value = '';
      await loadCardsAndStats(state.currentDeck.id);
      const nextInput = document.getElementById('dynamic-card-fields').querySelector('input, textarea');
      if (nextInput) nextInput.focus();
    }
  });

  // グローバル公開関数（HTML onclick用）
  window.openDeck = openDeck;

  window.toggleDeckClassShare = async function(deckId, classId, currentlyShared) {
    if (!state.currentUser) return;
    if (currentlyShared) {
      await supabaseClient.from('class_decks').delete().eq('class_id', classId).eq('deck_id', deckId);
    } else {
      await supabaseClient.from('class_decks').insert([{ class_id: classId, deck_id: deckId, added_by: state.currentUser.id }]);
    }
    await renderDeckClassShareToggles(deckId);
  };

  window.deleteCard = async function(cardId) {
    if (!state.isDeckOwner || !confirm('このカードを削除しますか？')) return;
    const { error } = await supabaseClient.from('cards').delete().eq('id', cardId);
    if (error) alert(`削除エラー: ${error.message}`);
    else if (state.currentDeck) await loadCardsAndStats(state.currentDeck.id);
  };

  window.openEditCard = function(cardId) {
    if (!state.isDeckOwner) return;
    const card = state.currentCards.find(c => c.id === cardId);
    const formBox = document.getElementById(`card-edit-form-${cardId}`);
    if (!card || !formBox) return;

    let fieldsHtml = '';
    if (card.card_type === 'basic') {
      fieldsHtml = `
        <div><label class="block text-xs font-bold text-slate-600 mb-1">表面</label><textarea id="edit-front-${cardId}" rows="2" class="w-full border rounded p-2 text-sm bg-white">${escapeHtml(card.content.front)}</textarea></div>
        <div><label class="block text-xs font-bold text-slate-600 mb-1">裏面</label><textarea id="edit-back-${cardId}" rows="2" class="w-full border rounded p-2 text-sm bg-white">${escapeHtml(card.content.back)}</textarea></div>
      `;
    } else if (card.card_type === 'order') {
      fieldsHtml = `
        <div><label class="block text-xs font-bold text-slate-600 mb-1">問題文</label><input type="text" id="edit-prompt-${cardId}" value="${escapeHtml(card.content.prompt)}" class="w-full border rounded p-2 text-sm bg-white"></div>
        <div><label class="block text-xs font-bold text-slate-600 mb-1">正解順（1行に1つずつ）</label><textarea id="edit-items-${cardId}" rows="3" class="w-full border rounded p-2 text-sm bg-white">${escapeHtml(card.content.items.join('\n'))}</textarea></div>
      `;
    } else if (card.card_type === 'multi_element') {
      fieldsHtml = `
        <div><label class="block text-xs font-bold text-slate-600 mb-1">問題文</label><input type="text" id="edit-prompt-${cardId}" value="${escapeHtml(card.content.prompt)}" class="w-full border rounded p-2 text-sm bg-white"></div>
        <div><label class="block text-xs font-bold text-slate-600 mb-1">正解要素（1行に1つずつ）</label><textarea id="edit-answers-${cardId}" rows="3" class="w-full border rounded p-2 text-sm bg-white">${escapeHtml(card.content.answers.join('\n'))}</textarea></div>
      `;
    } else if (card.card_type === 'cloze') {
      fieldsHtml = `
        <div><label class="block text-xs font-bold text-slate-600 mb-1">穴埋め文章（{{語句}} で空欄指定）</label><textarea id="edit-cloze-${cardId}" rows="3" class="w-full border rounded p-2 text-sm bg-white">${escapeHtml(card.content.text)}</textarea></div>
      `;
    }

    formBox.innerHTML = `
      ${fieldsHtml}
      <div class="grid grid-cols-2 gap-2">
        <div><label class="block text-[11px] text-slate-500 mb-0.5">ページ番号</label><input type="number" id="edit-page-${cardId}" value="${card.page_number !== null ? card.page_number : ''}" class="w-full border rounded p-1.5 text-xs bg-white"></div>
        <div><label class="block text-[11px] text-slate-500 mb-0.5">問題番号</label><input type="text" id="edit-qnum-${cardId}" value="${card.question_number ? escapeHtml(card.question_number) : ''}" class="w-full border rounded p-1.5 text-xs bg-white"></div>
      </div>
      <div class="flex justify-end gap-2 pt-1">
        <button type="button" onclick="document.getElementById('card-edit-form-${cardId}').classList.add('hidden')" class="text-xs bg-white border border-slate-300 text-slate-600 px-3 py-1.5 rounded font-semibold">キャンセル</button>
        <button type="button" onclick="window.saveEditedCard('${cardId}')" class="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded font-bold">変更を保存</button>
      </div>
    `;
    formBox.classList.remove('hidden');
  };

  window.saveEditedCard = async function(cardId) {
    if (!state.isDeckOwner || !state.currentDeck) return;
    const card = state.currentCards.find(c => c.id === cardId);
    if (!card) return;

    let newContent = null;
    if (card.card_type === 'basic') {
      const front = document.getElementById(`edit-front-${cardId}`).value.trim();
      const back = document.getElementById(`edit-back-${cardId}`).value.trim();
      if (!front || !back) return alert('表面と裏面の両方を入力してください');
      newContent = { front, back };
    } else if (card.card_type === 'order') {
      const prompt = document.getElementById(`edit-prompt-${cardId}`).value.trim();
      const items = document.getElementById(`edit-items-${cardId}`).value.split('\n').map(s => s.trim()).filter(Boolean);
      if (!prompt || items.length < 2) return alert('問題文と2つ以上の要素を入力してください');
      newContent = { prompt, items };
    } else if (card.card_type === 'multi_element') {
      const prompt = document.getElementById(`edit-prompt-${cardId}`).value.trim();
      const answers = document.getElementById(`edit-answers-${cardId}`).value.split('\n').map(s => s.trim()).filter(Boolean);
      if (!prompt || answers.length < 2) return alert('問題文と2つ以上の正解要素を入力してください');
      newContent = { prompt, answers };
    } else if (card.card_type === 'cloze') {
      const text = document.getElementById(`edit-cloze-${cardId}`).value.trim();
      if (!text || [...text.matchAll(/\{\{(.+?)\}\}/g)].length === 0) return alert('空欄部分を {{答え}} で囲んでください');
      newContent = { text };
    }

    const pageStr = document.getElementById(`edit-page-${cardId}`).value;
    const pageVal = pageStr !== '' ? parseInt(pageStr, 10) : null;
    const qNumVal = document.getElementById(`edit-qnum-${cardId}`).value.trim() || null;

    const { error } = await supabaseClient.from('cards').update({ content: newContent, page_number: pageVal, question_number: qNumVal }).eq('id', cardId);
    if (error) alert(`カード更新エラー: ${error.message}`);
    else await loadCardsAndStats(state.currentDeck.id);
  };
}
