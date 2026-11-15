import { supabaseClient, escapeHtml } from './config.js';
import { state } from './state.js';

/**
 * ユーザーの星つきカードID一覧をSupabaseから取得し、state.starredCardIds (Set) を更新する
 */
export async function loadUserStarredCards() {
  if (!state.currentUser) {
    state.starredCardIds = new Set();
    return state.starredCardIds;
  }
  const { data, error } = await supabaseClient
    .from('starred_cards')
    .select('card_id')
    .eq('user_id', state.currentUser.id);

  if (!error && data) {
    state.starredCardIds = new Set(data.map(row => row.card_id));
  }
  return state.starredCardIds;
}

/**
 * 指定カードの星マークをトグル（DB反映 + state更新 + 画面上の全星ボタン同期）
 */
export async function toggleStarCard(cardId) {
  if (!state.currentUser) return false;
  const currentlyStarred = state.starredCardIds.has(cardId);

  if (currentlyStarred) {
    const { error } = await supabaseClient
      .from('starred_cards')
      .delete()
      .eq('user_id', state.currentUser.id)
      .eq('card_id', cardId);
    if (!error) state.starredCardIds.delete(cardId);
  } else {
    const { error } = await supabaseClient
      .from('starred_cards')
      .insert([{ user_id: state.currentUser.id, card_id: cardId }]);
    if (!error) state.starredCardIds.add(cardId);
  }

  const nowStarred = state.starredCardIds.has(cardId);
  syncStarButtonsUI(cardId, nowStarred);
  updateDeckStarCountUI();
  return nowStarred;
}

/**
 * 画面上の同じ cardId を持つすべての星ボタンの見た目を同期する
 */
export function syncStarButtonsUI(cardId, isStarred) {
  document.querySelectorAll(`[data-star-card-id="${cardId}"]`).forEach(btn => {
    btn.textContent = isStarred ? '★' : '☆';
    btn.title = isStarred ? '星マークを外す' : '星マークをつける';
    if (isStarred) {
      btn.classList.remove('text-slate-300', 'hover:text-amber-400');
      btn.classList.add('text-amber-400', 'hover:text-amber-500');
    } else {
      btn.classList.remove('text-amber-400', 'hover:text-amber-500');
      btn.classList.add('text-slate-300', 'hover:text-amber-400');
    }
  });
}

/**
 * 単語帳詳細画面の「星つきだけ復習」ボタンの件数を更新する
 */
export function updateDeckStarCountUI() {
  const countEl = document.getElementById('starred-cards-count');
  const btnEl = document.getElementById('start-starred-study-btn');
  if (!countEl || !btnEl || !state.currentCards) return;

  const starredInDeck = state.currentCards.filter(c => state.starredCardIds.has(c.id));
  countEl.textContent = starredInDeck.length;
  btnEl.disabled = starredInDeck.length === 0;
}

/**
 * シャッフル & 表裏反転のオプションを適用した出題用カード配列を生成する
 */
export function prepareCardsForStudy(cards, options = {}) {
  const { shuffle = false, reverse = false } = options;
  let result = cards.map(card => {
    if (reverse && card.card_type === 'basic') {
      return {
        ...card,
        content: {
          front: card.content.back,
          back: card.content.front
        },
        _isReversed: true
      };
    }
    return { ...card, _isReversed: false };
  });

  if (shuffle) {
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
  }
  return result;
}

/**
 * 学習完了時のドーナツ型円グラフ付きリザルト画面を描画する
 */
export function renderStudyResultScreen(containerEl, summary, callbacks) {
  const { totalCount, correctCount, wrongCards, modeLabel } = summary;
  const wrongCount = totalCount - correctCount;
  const accuracyPct = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

  let message = 'お疲れさまでした！';
  let badgeColor = 'bg-indigo-100 text-indigo-700';
  if (accuracyPct === 100) {
    message = 'パーフェクト！全問正解です！🎉';
    badgeColor = 'bg-emerald-100 text-emerald-700';
  } else if (accuracyPct >= 80) {
    message = '素晴らしい成績です！あと少しで完璧です！✨';
    badgeColor = 'bg-emerald-100 text-emerald-700';
  } else if (accuracyPct >= 50) {
    message = 'ナイスファイト！間違えた問題を復習して定着させましょう 💪';
    badgeColor = 'bg-amber-100 text-amber-800';
  } else {
    message = 'まずは間違えた問題に星をつけて繰り返し覚えましょう 🌱';
    badgeColor = 'bg-rose-100 text-rose-700';
  }

  const wrongListHtml = wrongCards.length > 0
    ? `
      <div class="text-left space-y-2.5 pt-4 border-t border-slate-100">
        <div class="flex flex-wrap justify-between items-center gap-2">
          <h4 class="text-sm font-bold text-slate-700">❌ 間違えた問題 (${wrongCards.length}問)</h4>
          <button type="button" id="result-star-all-wrong-btn" class="text-xs bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold px-3 py-1 rounded-full transition">
            ★ 間違えた問題すべてに星をつける
          </button>
        </div>
        <div class="space-y-2 max-h-64 overflow-y-auto pr-1">
          ${wrongCards.map(card => {
            const isStarred = state.starredCardIds.has(card.id);
            const frontText = getCardPreviewFront(card);
            const backText = getCardPreviewBack(card);
            return `
              <div class="flex items-center justify-between gap-3 bg-rose-50/60 border border-rose-100 p-3 rounded-xl">
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-bold text-slate-800 truncate">${escapeHtml(frontText)}</p>
                  <p class="text-xs text-slate-600 truncate mt-0.5">答: ${escapeHtml(backText)}</p>
                </div>
                <button type="button" data-star-card-id="${card.id}" onclick="window.handleToggleStar('${card.id}')"
                  class="text-xl leading-none p-1.5 rounded-lg transition ${isStarred ? 'text-amber-400 hover:text-amber-500' : 'text-slate-300 hover:text-amber-400'}"
                  title="${isStarred ? '星マークを外す' : '星マークをつける'}">
                  ${isStarred ? '★' : '☆'}
                </button>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `
    : `
      <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-800 font-semibold">
        間違えた問題はありませんでした！この調子で次のセットも進めましょう。
      </div>
    `;

  containerEl.innerHTML = `
    <div class="text-center space-y-6 py-2">
      <div>
        <span class="text-xs font-bold px-3 py-1 rounded-full ${badgeColor}">${escapeHtml(modeLabel)} 完了</span>
        <h3 class="text-xl md:text-2xl font-extrabold text-slate-800 mt-2">${message}</h3>
      </div>

      <!-- アニメーション付きドーナツ型円グラフ -->
      <div class="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-10 py-2">
        <div class="relative w-44 h-44 flex items-center justify-center">
          <div id="result-donut-chart"
            class="w-full h-full rounded-full transition-all duration-700 ease-out shadow-inner"
            style="background: conic-gradient(#10b981 0% 0%, #f43f5e 0% 100%);">
          </div>
          <div class="absolute inset-4 bg-white rounded-full flex flex-col items-center justify-center shadow-sm">
            <span class="text-xs font-bold text-slate-400">正答率</span>
            <span id="result-accuracy-number" class="text-3xl font-extrabold text-slate-800">0%</span>
            <span class="text-xs font-semibold text-slate-500 mt-0.5">${correctCount} / ${totalCount} 問</span>
          </div>
        </div>

        <!-- 凡例・内訳カード -->
        <div class="grid grid-cols-2 md:grid-cols-1 gap-3 text-left min-w-[180px]">
          <div class="bg-emerald-50 border border-emerald-200 px-4 py-2.5 rounded-xl flex items-center justify-between gap-4">
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span>
              <span class="text-xs font-bold text-emerald-900">正解</span>
            </div>
            <span class="text-base font-extrabold text-emerald-700">${correctCount}問</span>
          </div>
          <div class="bg-rose-50 border border-rose-200 px-4 py-2.5 rounded-xl flex items-center justify-between gap-4">
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full bg-rose-500 inline-block"></span>
              <span class="text-xs font-bold text-rose-900">不正解</span>
            </div>
            <span class="text-base font-extrabold text-rose-700">${wrongCount}問</span>
          </div>
        </div>
      </div>

      ${wrongListHtml}

      <!-- アクションボタン -->
      <div class="flex flex-wrap justify-center gap-3 pt-2">
        ${wrongCards.length > 0 ? `
          <button type="button" id="result-retry-wrong-btn" class="bg-rose-500 hover:bg-rose-600 text-white font-bold px-5 py-3 rounded-xl shadow transition">
            🔥 間違えた${wrongCards.length}問だけ解き直す
          </button>
        ` : ''}
        <button type="button" id="result-retry-all-btn" class="bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-bold px-5 py-3 rounded-xl transition">
          ↻ もう一度最初から学習
        </button>
        <button type="button" id="result-back-btn" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-3 rounded-xl shadow transition">
          元の画面に戻る
        </button>
      </div>
    </div>
  `;

  // 円グラフのアニメーション発火
  requestAnimationFrame(() => {
    setTimeout(() => {
      const chartEl = document.getElementById('result-donut-chart');
      const numEl = document.getElementById('result-accuracy-number');
      if (chartEl) {
        chartEl.style.background = `conic-gradient(#10b981 0% ${accuracyPct}%, #f43f5e ${accuracyPct}% 100%)`;
      }
      if (numEl) {
        numEl.textContent = `${accuracyPct}%`;
      }
    }, 60);
  });

  // イベントバインド
  const starAllBtn = document.getElementById('result-star-all-wrong-btn');
  if (starAllBtn && state.currentUser) {
    starAllBtn.addEventListener('click', async () => {
      const toInsert = wrongCards
        .filter(c => !state.starredCardIds.has(c.id))
        .map(c => ({ user_id: state.currentUser.id, card_id: c.id }));
      if (toInsert.length > 0) {
        await supabaseClient.from('starred_cards').insert(toInsert);
        toInsert.forEach(row => {
          state.starredCardIds.add(row.card_id);
          syncStarButtonsUI(row.card_id, true);
        });
        updateDeckStarCountUI();
      }
      starAllBtn.textContent = '✓ すべてに星をつけました';
      starAllBtn.disabled = true;
    });
  }

  const retryWrongBtn = document.getElementById('result-retry-wrong-btn');
  if (retryWrongBtn && callbacks.onRetryWrong) {
    retryWrongBtn.addEventListener('click', callbacks.onRetryWrong);
  }

  const retryAllBtn = document.getElementById('result-retry-all-btn');
  if (retryAllBtn && callbacks.onRetryAll) {
    retryAllBtn.addEventListener('click', callbacks.onRetryAll);
  }

  const backBtn = document.getElementById('result-back-btn');
  if (backBtn && callbacks.onBack) {
    backBtn.addEventListener('click', callbacks.onBack);
  }
}

function getCardPreviewFront(card) {
  if (card.card_type === 'basic') return card.content.front;
  if (card.card_type === 'order') return card.content.prompt;
  if (card.card_type === 'multi_element') return card.content.prompt;
  if (card.card_type === 'cloze') return card.content.text.replace(/\{\{(.+?)\}\}/g, '（ $1 ）');
  return '';
}

function getCardPreviewBack(card) {
  if (card.card_type === 'basic') return card.content.back;
  if (card.card_type === 'order') return card.content.items.join(' → ');
  if (card.card_type === 'multi_element') return card.content.answers.join(' / ');
  if (card.card_type === 'cloze') {
    return [...card.content.text.matchAll(/\{\{(.+?)\}\}/g)].map(m => m[1]).join(' / ');
  }
  return '';
}

export function initStudyOptionEvents() {
  window.handleToggleStar = async function(cardId) {
    await toggleStarCard(cardId);
  };
}
