import { supabaseClient, escapeHtml } from './config.js';
import { state } from './state.js';
import { updateUrlParams, showView } from './router.js';
import { loadCardsAndStats } from './deckDetail.js';
import { loadFolderDecksAndSelector } from './folders.js';
import { prepareCardsForStudy, renderStudyResultScreen } from './studyOptions.js';

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 学習セッションを開始する
 * @param {Array} cardsList 出題対象カード配列
 * @param {Object} config { isWeakMode, modeLabel, context ('deck'|'folder'), skipPushState }
 */
export function startQuizSession(cardsList, config = {}) {
  const {
    isWeakMode = false,
    modeLabel = isWeakMode ? '苦手復習' : '全問学習',
    context = 'deck',
    skipPushState = false
  } = typeof config === 'boolean'
    ? { isWeakMode: config, skipPushState: arguments[2] || false }
    : config;

  if (!cardsList || cardsList.length === 0) return;

  state.studyContext = context;
  state.isWeakReviewMode = isWeakMode;
  state.studyModeLabel = modeLabel;
  state.studyQueue = prepareCardsForStudy(cardsList, state.studyOptions);
  state.currentStudyIndex = 0;
  state.studySessionStats = {
    correctCount: 0,
    wrongCards: []
  };

  if (!skipPushState) {
    if (context === 'folder' && state.currentFolder) {
      updateUrlParams({ folder: state.currentFolder.id, mode: isWeakMode ? 'weak' : 'study' });
    } else if (state.currentDeck) {
      const base = state.currentDeck.share_id && !state.isDeckOwner
        ? { share: state.currentDeck.share_id }
        : { deck: state.currentDeck.id };
      updateUrlParams({ ...base, mode: isWeakMode ? 'weak' : 'study' });
    }
  }

  const modeBadge = document.getElementById('study-mode-badge');
  modeBadge.textContent = modeLabel;
  modeBadge.className = isWeakMode
    ? 'text-xs font-bold px-2.5 py-0.5 rounded bg-rose-100 text-rose-700'
    : 'text-xs font-bold px-2.5 py-0.5 rounded bg-indigo-100 text-indigo-700';

  showView('study');
  renderCurrentQuestion();
}

export async function recordLearningLog(cardId, isCorrect) {
  if (!state.currentUser) return;
  await supabaseClient.from('learning_logs').insert([{
    user_id: state.currentUser.id,
    card_id: cardId,
    is_correct: isCorrect
  }]);
}

function renderCardStarButton(cardId) {
  const isStarred = state.starredCardIds.has(cardId);
  return `
    <button type="button" data-star-card-id="${cardId}" onclick="window.handleToggleStar('${cardId}')"
      class="text-2xl leading-none p-1 rounded-lg transition ${isStarred ? 'text-amber-400 hover:text-amber-500' : 'text-slate-300 hover:text-amber-400'}"
      title="${isStarred ? '星マークを外す' : '星マークをつける'}">
      ${isStarred ? '★' : '☆'}
    </button>
  `;
}

export function renderCurrentQuestion() {
  const container = document.getElementById('study-card-container');
  const total = state.studyQueue.length;

  // 全問終了時は円グラフ付きリザルト画面を表示
  if (state.currentStudyIndex >= total) {
    renderStudyResultScreen(
      container,
      {
        totalCount: total,
        correctCount: state.studySessionStats.correctCount,
        wrongCards: state.studySessionStats.wrongCards,
        modeLabel: state.studyModeLabel
      },
      {
        onRetryWrong: () => {
          startQuizSession(state.studySessionStats.wrongCards, {
            isWeakMode: true,
            modeLabel: '間違えた問題の復習',
            context: state.studyContext,
            skipPushState: true
          });
        },
        onRetryAll: () => {
          startQuizSession(state.studyQueue, {
            isWeakMode: state.isWeakReviewMode,
            modeLabel: state.studyModeLabel,
            context: state.studyContext,
            skipPushState: true
          });
        },
        onBack: () => exitStudyToOrigin()
      }
    );
    return;
  }

  document.getElementById('study-progress').textContent = `${state.currentStudyIndex + 1} / ${total}`;
  const card = state.studyQueue[state.currentStudyIndex];

  const metaBadge = (card.page_number !== null || card.question_number)
    ? `<span class="text-xs text-slate-400">${card.page_number !== null ? `P.${card.page_number}` : ''} ${card.question_number ? escapeHtml(card.question_number) : ''}</span>`
    : '<span></span>';

  const headerBar = `
    <div class="flex justify-between items-center mb-3">
      <div class="flex items-center gap-2">
        ${metaBadge}
        ${card._isReversed ? '<span class="text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-600">⇄ 表裏反転</span>' : ''}
      </div>
      ${renderCardStarButton(card.id)}
    </div>
  `;

  if (card.card_type === 'basic') {
    container.innerHTML = `
      <div>
        ${headerBar}
        <p class="text-xs font-bold text-indigo-600 mb-2">一問一答</p>
        <p class="text-xl md:text-2xl font-bold text-slate-800 whitespace-pre-wrap">${escapeHtml(card.content.front)}</p>
        <div id="basic-answer-area" class="hidden mt-6 pt-6 border-t border-slate-100">
          <p class="text-xs font-bold text-emerald-600 mb-1">答え</p>
          <p class="text-lg md:text-xl font-bold text-slate-700 whitespace-pre-wrap">${escapeHtml(card.content.back)}</p>
        </div>
      </div>
      <div class="mt-8">
        <button id="show-basic-answer-btn" type="button" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition">答えを表示する</button>
        <div id="basic-judge-btns" class="hidden grid grid-cols-2 gap-3">
          <button id="judge-wrong-btn" type="button" class="bg-rose-500 hover:bg-rose-600 text-white font-bold py-3 rounded-xl transition">× まだ・不正解</button>
          <button id="judge-correct-btn" type="button" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition">○ 覚えた・正解</button>
        </div>
      </div>
    `;

    document.getElementById('show-basic-answer-btn').addEventListener('click', () => {
      document.getElementById('basic-answer-area').classList.remove('hidden');
      document.getElementById('show-basic-answer-btn').classList.add('hidden');
      document.getElementById('basic-judge-btns').classList.remove('hidden');
    });

    document.getElementById('judge-wrong-btn').addEventListener('click', async () => {
      state.studySessionStats.wrongCards.push(card);
      await recordLearningLog(card.id, false);
      state.currentStudyIndex++;
      renderCurrentQuestion();
    });

    document.getElementById('judge-correct-btn').addEventListener('click', async () => {
      state.studySessionStats.correctCount++;
      await recordLearningLog(card.id, true);
      state.currentStudyIndex++;
      renderCurrentQuestion();
    });

  } else if (card.card_type === 'order') {
    const shuffled = shuffleArray(card.content.items);
    let selectedOrder = [];

    container.innerHTML = `
      <div>
        ${headerBar}
        <p class="text-xs font-bold text-amber-600 mb-2">並べ替え問題（正しい順番にタップ）</p>
        <p class="text-lg md:text-xl font-bold text-slate-800 mb-4">${escapeHtml(card.content.prompt)}</p>
        <div class="mb-4">
          <p class="text-xs text-slate-500 mb-1.5">あなたの解答順:</p>
          <div id="order-selected-box" class="min-h-[48px] p-2.5 bg-slate-50 border border-dashed border-slate-300 rounded-xl flex flex-wrap gap-2 items-center">
            <span class="text-xs text-slate-400">下の選択肢をタップしてください</span>
          </div>
        </div>
        <div>
          <p class="text-xs text-slate-500 mb-1.5">選択肢:</p>
          <div id="order-pool-box" class="flex flex-wrap gap-2"></div>
        </div>
        <div id="order-result-box" class="hidden mt-5 p-4 rounded-xl"></div>
      </div>
      <div class="mt-6 flex gap-3">
        <button id="order-reset-btn" type="button" class="w-1/3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-xl transition">リセット</button>
        <button id="order-submit-btn" type="button" class="w-2/3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition">解答を確定する</button>
        <button id="order-next-btn" type="button" class="hidden w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition">次の問題へ →</button>
      </div>
    `;

    const selectedBox = document.getElementById('order-selected-box');
    const poolBox = document.getElementById('order-pool-box');

    function renderOrderState() {
      selectedBox.innerHTML = selectedOrder.length === 0
        ? '<span class="text-xs text-slate-400">下の選択肢をタップしてください</span>'
        : selectedOrder.map((idx, pos) => `<span class="bg-indigo-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg">${pos + 1}. ${escapeHtml(shuffled[idx])}</span>`).join('');

      poolBox.innerHTML = shuffled.map((text, idx) => {
        const used = selectedOrder.includes(idx);
        return `<button type="button" data-idx="${idx}" ${used ? 'disabled' : ''} class="order-choice-btn text-sm font-medium px-3.5 py-2 rounded-lg border transition ${used ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed' : 'bg-white hover:bg-indigo-50 text-slate-800 border-slate-300 shadow-sm'}">${escapeHtml(text)}</button>`;
      }).join('');

      poolBox.querySelectorAll('.order-choice-btn:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedOrder.push(parseInt(btn.dataset.idx, 10));
          renderOrderState();
        });
      });
    }

    renderOrderState();

    document.getElementById('order-reset-btn').addEventListener('click', () => {
      selectedOrder = [];
      renderOrderState();
    });

    document.getElementById('order-submit-btn').addEventListener('click', async () => {
      if (selectedOrder.length !== shuffled.length) return alert('すべての選択肢を並べ替えてから確定してください');
      const userAnswers = selectedOrder.map(idx => shuffled[idx]);
      const isCorrect = userAnswers.every((val, i) => val === card.content.items[i]);

      if (isCorrect) state.studySessionStats.correctCount++;
      else state.studySessionStats.wrongCards.push(card);

      await recordLearningLog(card.id, isCorrect);

      const resultBox = document.getElementById('order-result-box');
      resultBox.classList.remove('hidden');
      resultBox.className = `mt-5 p-4 rounded-xl ${isCorrect ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`;
      resultBox.innerHTML = `<p class="font-bold text-base">${isCorrect ? '🎉 正解！' : '❌ 不正解…'}</p><p class="text-sm mt-1">正しい順番: ${card.content.items.map(escapeHtml).join(' → ')}</p>`;

      document.getElementById('order-reset-btn').classList.add('hidden');
      document.getElementById('order-submit-btn').classList.add('hidden');
      document.getElementById('order-next-btn').classList.remove('hidden');
    });

    document.getElementById('order-next-btn').addEventListener('click', () => {
      state.currentStudyIndex++;
      renderCurrentQuestion();
    });

  } else if (card.card_type === 'multi_element') {
    const count = card.content.answers.length;
    const inputsHtml = Array.from({ length: count }, (_, i) => `
      <div class="flex items-center gap-2">
        <span class="text-xs font-bold text-slate-400 w-6">${i + 1}.</span>
        <input type="text" class="multi-answer-input w-full border rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="要素 ${i + 1} を入力">
      </div>
    `).join('');

    container.innerHTML = `
      <div>
        ${headerBar}
        <p class="text-xs font-bold text-purple-600 mb-2">複数要素問題（${count}つすべて完答で正解・順不同）</p>
        <p class="text-lg md:text-xl font-bold text-slate-800 mb-4">${escapeHtml(card.content.prompt)}</p>
        <div class="space-y-2.5">${inputsHtml}</div>
        <div id="multi-result-box" class="hidden mt-5 p-4 rounded-xl"></div>
      </div>
      <div class="mt-6">
        <button id="multi-submit-btn" type="button" class="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl transition">採点する</button>
        <button id="multi-next-btn" type="button" class="hidden w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition">次の問題へ →</button>
      </div>
    `;

    document.getElementById('multi-submit-btn').addEventListener('click', async () => {
      const userInputs = [...document.querySelectorAll('.multi-answer-input')].map(el => el.value.trim());
      if (userInputs.some(v => v === '')) return alert(`${count}個すべての欄を入力してください`);

      const normalize = s => s.toLowerCase().replace(/\s+/g, '');
      const remainingAnswers = card.content.answers.map(normalize);
      let matchedAll = true;

      for (const u of userInputs) {
        const idx = remainingAnswers.indexOf(normalize(u));
        if (idx === -1) { matchedAll = false; break; }
        remainingAnswers.splice(idx, 1);
      }
      const isCorrect = matchedAll && remainingAnswers.length === 0;

      if (isCorrect) state.studySessionStats.correctCount++;
      else state.studySessionStats.wrongCards.push(card);

      await recordLearningLog(card.id, isCorrect);

      document.querySelectorAll('.multi-answer-input').forEach(el => { el.disabled = true; });
      const resultBox = document.getElementById('multi-result-box');
      resultBox.classList.remove('hidden');
      resultBox.className = `mt-5 p-4 rounded-xl ${isCorrect ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`;
      resultBox.innerHTML = `<p class="font-bold text-base">${isCorrect ? '🎉 完答・正解！' : '❌ 不正解（すべて一致で正解）'}</p><p class="text-sm mt-1">正解の要素: ${card.content.answers.map(escapeHtml).join(' / ')}</p>`;

      document.getElementById('multi-submit-btn').classList.add('hidden');
      document.getElementById('multi-next-btn').classList.remove('hidden');
    });

    document.getElementById('multi-next-btn').addEventListener('click', () => {
      state.currentStudyIndex++;
      renderCurrentQuestion();
    });

  } else if (card.card_type === 'cloze') {
    const rawText = card.content.text;
    const answers = [];
    let blankIndex = 0;

    const questionHtml = escapeHtml(rawText).replace(/\{\{(.+?)\}\}/g, (_, ans) => {
      answers.push(ans.trim());
      blankIndex++;
      return `<input type="text" data-blank-idx="${blankIndex - 1}" class="cloze-blank-input inline-block w-32 md:w-40 mx-1 px-2 py-1 border-b-2 border-emerald-600 bg-emerald-50/50 text-center font-bold text-emerald-900 focus:outline-none focus:bg-emerald-100 rounded-t" placeholder="(${blankIndex})">`;
    });

    container.innerHTML = `
      <div>
        ${headerBar}
        <p class="text-xs font-bold text-emerald-600 mb-2">穴埋め問題（空欄に入る語句を入力）</p>
        <div class="text-lg md:text-xl leading-relaxed text-slate-800 bg-slate-50 p-5 rounded-xl border border-slate-200">${questionHtml}</div>
        <div id="cloze-result-box" class="hidden mt-5 p-4 rounded-xl"></div>
      </div>
      <div class="mt-6">
        <button id="cloze-submit-btn" type="button" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition">答え合わせをする</button>
        <button id="cloze-next-btn" type="button" class="hidden w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition">次の問題へ →</button>
      </div>
    `;

    document.getElementById('cloze-submit-btn').addEventListener('click', async () => {
      const inputs = [...document.querySelectorAll('.cloze-blank-input')];
      if (inputs.some(el => el.value.trim() === '')) return alert('すべての空欄を入力してください');

      const normalize = s => s.toLowerCase().replace(/\s+/g, '');
      const isCorrect = inputs.every((el, idx) => normalize(el.value) === normalize(answers[idx]));

      if (isCorrect) state.studySessionStats.correctCount++;
      else state.studySessionStats.wrongCards.push(card);

      await recordLearningLog(card.id, isCorrect);

      inputs.forEach((el, idx) => {
        el.disabled = true;
        const ok = normalize(el.value) === normalize(answers[idx]);
        el.classList.add(ok ? 'bg-emerald-200' : 'bg-rose-200');
      });

      const resultBox = document.getElementById('cloze-result-box');
      resultBox.classList.remove('hidden');
      resultBox.className = `mt-5 p-4 rounded-xl ${isCorrect ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`;
      resultBox.innerHTML = `<p class="font-bold text-base">${isCorrect ? '🎉 全空欄正解！' : '❌ 不正解'}</p><p class="text-sm mt-1">正解: ${answers.map((a, i) => `(${i + 1}) ${escapeHtml(a)}`).join(' / ')}</p>`;

      document.getElementById('cloze-submit-btn').classList.add('hidden');
      document.getElementById('cloze-next-btn').classList.remove('hidden');
    });

    document.getElementById('cloze-next-btn').addEventListener('click', () => {
      state.currentStudyIndex++;
      renderCurrentQuestion();
    });
  }
}

export async function exitStudyToOrigin() {
  if (state.studyContext === 'folder' && state.currentFolder) {
    updateUrlParams({ folder: state.currentFolder.id });
    showView('folder');
    await loadFolderDecksAndSelector(state.currentFolder.id);
    return;
  }

  if (state.currentDeck) {
    const base = state.currentDeck.share_id && !state.isDeckOwner
      ? { share: state.currentDeck.share_id }
      : { deck: state.currentDeck.id };
    updateUrlParams(base);
    showView('detail');
    await loadCardsAndStats(state.currentDeck.id);
  } else {
    updateUrlParams({});
    showView('dashboard');
  }
}

export function initStudyEvents() {
  // 単語帳詳細画面からの学習開始
  document.getElementById('start-study-btn').addEventListener('click', () => {
    startQuizSession(state.currentCards, {
      isWeakMode: false,
      modeLabel: '全問学習',
      context: 'deck'
    });
  });

  document.getElementById('start-weak-study-btn').addEventListener('click', () => {
    startQuizSession(state.weakCards, {
      isWeakMode: true,
      modeLabel: '🔥 苦手だけ復習',
      context: 'deck'
    });
  });

  document.getElementById('start-starred-study-btn').addEventListener('click', () => {
    const starredCards = state.currentCards.filter(c => state.starredCardIds.has(c.id));
    startQuizSession(starredCards, {
      isWeakMode: false,
      modeLabel: '⭐ 星つきだけ復習',
      context: 'deck'
    });
  });

  // 学習設定トグル（単語帳画面）
  const deckShuffleChk = document.getElementById('deck-opt-shuffle');
  const deckReverseChk = document.getElementById('deck-opt-reverse');
  if (deckShuffleChk) {
    deckShuffleChk.addEventListener('change', (e) => {
      state.studyOptions.shuffle = e.target.checked;
      const folderShuffle = document.getElementById('folder-opt-shuffle');
      if (folderShuffle) folderShuffle.checked = e.target.checked;
    });
  }
  if (deckReverseChk) {
    deckReverseChk.addEventListener('change', (e) => {
      state.studyOptions.reverse = e.target.checked;
      const folderReverse = document.getElementById('folder-opt-reverse');
      if (folderReverse) folderReverse.checked = e.target.checked;
    });
  }

  // 学習終了ボタン
  document.getElementById('exit-study-btn').addEventListener('click', exitStudyToOrigin);
}
