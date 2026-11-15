import { supabaseClient, escapeHtml } from './config.js';
import { state } from './state.js';
import { fetchDisplayNames } from './auth.js';
import { updateUrlParams, showView } from './router.js';

export async function openCreatorPage(creatorId, skipPushState = false) {
  if (!skipPushState) updateUrlParams({ creator: creatorId });
  showView('creator');

  const nameEl = document.getElementById('creator-page-name');
  const summaryEl = document.getElementById('creator-page-summary');
  const listEl = document.getElementById('creator-decks-list');

  nameEl.textContent = '読み込み中...';
  summaryEl.textContent = '';
  listEl.innerHTML = '<p class="text-slate-500 text-sm">単語帳一覧を取得中...</p>';

  await fetchDisplayNames([creatorId]);
  const creatorName = state.profileCache[creatorId] || 'ユーザー';
  const isMe = state.currentUser && creatorId === state.currentUser.id;
  nameEl.textContent = isMe ? `${creatorName}（あなた）` : creatorName;

  let query = supabaseClient.from('decks').select('*').eq('user_id', creatorId).order('created_at', { ascending: false });
  if (!isMe) query = query.eq('visibility', 'public');

  const { data: decks, error } = await query;
  if (error) {
    listEl.innerHTML = `<p class="text-rose-500 text-sm">読み込みエラー: ${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!decks || decks.length === 0) {
    summaryEl.textContent = '公開されている単語帳はまだありません';
    listEl.innerHTML = '<p class="text-slate-500 text-sm bg-white p-4 rounded-xl">このユーザーが公開している単語帳はまだありません。</p>';
    return;
  }

  summaryEl.textContent = `${decks.length}個の単語帳セット`;
  listEl.innerHTML = decks.map(deck => `
    <div onclick="window.openDeck('${deck.id}')" class="bg-white p-5 rounded-xl shadow hover:shadow-md cursor-pointer transition border border-slate-100 hover:border-indigo-300">
      <div class="flex justify-between items-start gap-2">
        <h3 class="text-lg font-bold text-slate-800">${escapeHtml(deck.title)}</h3>
        ${isMe ? `<span class="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">${deck.visibility === 'public' ? '🌐 公開' : deck.visibility === 'link' ? '🔗 限定' : '🔒 非公開'}</span>` : ''}
      </div>
      <p class="text-xs text-indigo-600 font-semibold mt-1">${deck.textbook_name ? escapeHtml(deck.textbook_name) : '教科書未指定'}</p>
      <p class="text-xs text-slate-400 mt-3">作成日: ${new Date(deck.created_at).toLocaleDateString('ja-JP')}</p>
    </div>
  `).join('');
}

export function initCreatorEvents() {
  window.openCreatorPage = openCreatorPage;
}
