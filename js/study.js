import { supabaseClient, escapeHtml } from './config.js';
import { state } from './state.js';
import { updateUrlParams, showView } from './router.js';
import { setupAndRenderDeck } from './deckDetail.js';

let studyQueue = [];
let studyIndex = 0;
let studyCorrectCount = 0;
let studyModeLabel = '全問モード';
let questionStartTime = 0;
let currentOrderSelection = [];

export function startQuizSession(cardsToStudy, isWeakOnly, skipPushState = false) {
  if (!cardsToStudy || cardsToStudy.length === 0) {
    return alert('出題できるカードがありません');
  }
  studyQueue = [...cardsToStudy].sort(() => Math.random() - 0.5);
  studyIndex = 0;
  studyCorrectCount = 0;
  studyModeLabel = isWeakOnly ? '🔥 苦手復習モード' : '全問モード';

  if (!skipPushState && state.currentDeck) {
    const params = state.currentDeck.share_id && !state.isDeckOwner
      ? { share: state.currentDeck.share_id, mode: isWeakOnly ? 'weak' : 'study' }
      : { deck: state.currentDeck.id, mode: isWeakOnly ? 'weak' : 'study' };
    updateUrlParams(params);
  }

  const badge = document.getElementById('study-mode-badge');
  badge.textContent = studyModeLabel;
  badge.className = isWeakOnly
    ? 'text-xs font-bold px-2.5 py-0.5 rounded bg-rose-100 text-rose-700'
    : 'text-xs font-bold px-2.5 py-0.5 rounded bg-indigo-100 text-indigo-700';

  showView('study');
  renderStudyQuestion();
}

function renderStudyQuestion() {
  const container = document.getElementById('study-card-container');
  if (studyIndex >= studyQueue.length) {
    const total = studyQueue.length;
    const rate = Math.round((studyCorrectCount / total) * 100);
    container.innerHTML = `
      <div class="text-center py-8 space-y-4">
        <div class="text-5xl">🎉</div>
        <h3 class="text-2xl font-bold text-slate-800">${escapeHtml(studyModeLabel)} 完了！</h3>
        <p class="text-lg text-slate-600">正答率: <span class="font-bold text-indigo-600 text-2xl">${rate}%</span>（${studyCorrectCount} / ${total} 問正解）</p>
        <div class="pt-6 flex justify-center gap-3">
          <button type="button" onclick="window.returnToDeckDetail()" class="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-6 py-3 rounded-xl transition">単語帳に戻る（成績を更新）</button>
        </div>
      </div>
    `;
    return;
  }

  const card = studyQueue[studyIndex];
  questionStartTime = Date.now();
  document.getElementById('study-progress').textContent = `${studyIndex + 1} / ${studyQueue.length}`;

  if (card.card_type === 'basic') {
    container.innerHTML = `
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
    container.innerHTML = `
      <div class="space-y-4">
        <span class="text-xs font-bold px-2.5 py-1 rounded bg-amber-100 text-amber-700">並べ替え</span>
        <h3 class="text-lg font-bold text-slate-800">${escapeHtml(card.content.prompt)}</h3>
        <div class="bg-slate-50 p-3 rounded-xl border border-slate-200 min-h-[64px]">
          <p class="text-xs text-slate-400 mb-2">あなたの解答順（タップして選択）：</p>
          <div id="order-selected-list" class="flex flex-wrap gap-2"></div>
        </div>
        <div id="order-pool-list" class="flex flex-wrap gap-2 pt-2">
          ${shuffledItems.map((item, idx) => `<button type="button" data-idx="${idx}" data-val="${escapeHtml(item)}" class="order-choice-btn bg-white border-2 border-indigo-200 hover:border-indigo-500 px-3 py-2 rounded-lg text-sm font-semibold shadow-sm transition">${escapeHtml(item)}</button>`).join('')}
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
    const updateOrderUI = () => {
      selectedContainer.innerHTML = currentOrderSelection.map((val, i) => `<span class="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold">${i + 1}. ${escapeHtml(val)}</span>`).join('');
    };
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
      poolBtns.forEach(btn => { btn.disabled = false; btn.classList.remove('opacity-30'); });
      updateOrderUI();
    });
    document.getElementById('check-order-btn').addEventListener('click', () => {
      const correctItems = card.content.items;
      if (currentOrderSelection.length !== correctItems.length) return alert('すべての選択肢を並べてから判定してください');
      const isCorrect = currentOrderSelection.every((val, idx) => val === correctItems[idx]);
      showResultAndNext(isCorrect, isCorrect ? '○ 大正解！順番も完璧です。' : `✕ 不正解… 正解順: ${correctItems.join(' → ')}`);
    });

  } else if (card.card_type === 'multi_element') {
    const count = card.content.answers.length;
    container.innerHTML = `
      <div class="space-y-4">
        <span class="text-xs font-bold px-2.5 py-1 rounded bg-purple-100 text-purple-700">複数要素（${count}つすべて解答）</span>
        <h3 class="text-lg font-bold text-slate-800">${escapeHtml(card.content.prompt)}</h3>
        <div class="space-y-2">${Array.from({ length: count }).map((_, i) => `<input type="text" class="multi-input w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500" placeholder="要素 ${i + 1}">`).join('')}</div>
        <div id="study-feedback" class="hidden p-4 rounded-xl text-sm font-bold"></div>
      </div>
      <div id="multi-controls" class="pt-6"><button id="check-multi-btn" type="button" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition">判定する</button></div>
    `;
    document.getElementById('check-multi-btn').addEventListener('click', () => {
      const userInputs = [...document.querySelectorAll('.multi-input')].map(el => el.value.trim());
      if (userInputs.some(v => !v)) return alert('すべての空欄を入力してください');
      const normalize = s => s.toLowerCase().replace(/\s+/g, '');
      const expectedSet = new Set(card.content.answers.map(normalize));
      const userSet = new Set(userInputs.map(normalize));
      const isCorrect = expectedSet.size === userSet.size && [...expectedSet].every(ans => userSet.has(ans));
      showResultAndNext(isCorrect, isCorrect ? '○ 完答！すべて正解です。' : `✕ 不正解… 正解の要素: ${card.content.answers.join(' / ')}`);
    });

  } else if (card.card_type === 'cloze') {
    const answers = [];
    let blankIndex = 0;
    const htmlWithInputs = escapeHtml(card.content.text).replace(/\{\{(.+?)\}\}/g, (_, ans) => {
      answers.push(ans);
      blankIndex++;
      return `<input type="text" data-blank-idx="${blankIndex - 1}" class="cloze-input inline-block border-b-2 border-indigo-500 bg-indigo-50 px-2 py-0.5 mx-1 w-32 text-center font-bold text-indigo-900 focus:outline-none" placeholder="(${blankIndex})">`;
    });
    container.innerHTML = `
      <div class="space-y-4">
        <span class="text-xs font-bold px-2.5 py-1 rounded bg-emerald-100 text-emerald-700">穴埋め</span>
        <div class="text-lg leading-loose text-slate-800 py-4">${htmlWithInputs}</div>
        <div id="study-feedback" class="hidden p-4 rounded-xl text-sm font-bold"></div>
      </div>
      <div id="cloze-controls" class="pt-6"><button id="check-cloze-btn" type="button" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition">判定する</button></div>
    `;
    document.getElementById('check-cloze-btn').addEventListener('click', () => {
      const inputs = [...document.querySelectorAll('.cloze-input')];
      const normalize = s => s.trim().toLowerCase().replace(/\s+/g, '');
      const isCorrect = inputs.every((input, idx) => normalize(input.value) === normalize(answers[idx]));
      showResultAndNext(isCorrect, isCorrect ? '○ 正解！' : `✕ 不正解… 正解: ${answers.map((a, i) => `(${i + 1}) ${a}`).join(' / ')}`);
    });
  }
}

function showResultAndNext(isCorrect, message) {
  const feedbackEl = document.getElementById('study-feedback');
  feedbackEl.classList.remove('hidden');
  feedbackEl.classList.add(isCorrect ? 'bg-emerald-50' : 'bg-rose-50', isCorrect ? 'text-emerald-700' : 'text-rose-700');
  feedbackEl.textContent = message;

  const container = document.getElementById('study-card-container');
  container.lastElementChild.innerHTML = `<button type="button" onclick="window.submitAnswer(${isCorrect})" class="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl transition">次の問題へ →</button>`;
}

export function initStudyEvents() {
  document.getElementById('start-study-btn').addEventListener('click', () => {
    if (state.currentCards.length === 0) return alert('学習するカードがありません。先に問題カードを追加してください！');
    startQuizSession(state.currentCards, false);
  });

  document.getElementById('start-weak-study-btn').addEventListener('click', () => {
    if (state.weakCards.length === 0) return;
    startQuizSession(state.weakCards, true);
  });

  document.getElementById('exit-study-btn').addEventListener('click', () => {
    if (state.currentDeck) setupAndRenderDeck(state.currentDeck, null, false);
    else {
      updateUrlParams({});
      showView('dashboard');
    }
  });

  window.submitAnswer = async function(isCorrect) {
    const card = studyQueue[studyIndex];
    const timeTakenSec = Math.max(1, Math.round((Date.now() - questionStartTime) / 1000));
    if (isCorrect) studyCorrectCount++;

    if (state.currentUser && card) {
      await supabaseClient.from('learning_logs').insert([{
        user_id: state.currentUser.id,
        card_id: card.id,
        is_correct: isCorrect,
        time_taken_sec: timeTakenSec
      }]);
    }
    studyIndex++;
    renderStudyQuestion();
  };

  window.returnToDeckDetail = function() {
    if (state.currentDeck) setupAndRenderDeck(state.currentDeck, null, false);
    else {
      updateUrlParams({});
      showView('dashboard');
    }
  };
}
