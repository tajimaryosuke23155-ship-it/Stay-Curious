import { supabaseClient, escapeHtml } from './config.js';
import { state } from './state.js';
import { fetchDisplayNames } from './auth.js';
import { updateUrlParams, showView } from './router.js';

export async function getUserClasses() {
  if (!state.currentUser) return [];
  const [{ data: ownedClasses }, { data: memberRows }] = await Promise.all([
    supabaseClient.from('classes').select('*').eq('owner_id', state.currentUser.id),
    supabaseClient.from('class_members').select('class_id, classes(*)').eq('user_id', state.currentUser.id)
  ]);

  const map = new Map();
  (ownedClasses || []).forEach(c => map.set(c.id, { ...c, myRole: 'owner' }));
  (memberRows || []).forEach(r => {
    if (r.classes && !map.has(r.classes.id)) {
      map.set(r.classes.id, { ...r.classes, myRole: r.role || 'member' });
    }
  });
  return [...map.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function loadMyClasses() {
  if (!state.currentUser) return;
  const listEl = document.getElementById('classes-list');
  listEl.innerHTML = '<p class="text-gray-500 text-sm">読み込み中...</p>';

  const classes = await getUserClasses();
  if (classes.length === 0) {
    listEl.innerHTML = '<p class="text-gray-500 text-sm">まだ参加中のクラスはありません。新しいクラスを作成するか、友達の招待リンクから参加しましょう！</p>';
    return;
  }

  await fetchDisplayNames(classes.map(c => c.owner_id));

  listEl.innerHTML = classes.map(cls => {
    const isOwner = cls.owner_id === state.currentUser.id;
    const ownerName = state.profileCache[cls.owner_id] || 'オーナー';
    return `
      <div onclick="window.openClassPage('${cls.id}')" class="bg-white p-5 rounded-xl shadow border border-indigo-100 hover:border-indigo-300 hover:shadow-md cursor-pointer transition">
        <div class="flex justify-between items-start gap-2">
          <div>
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-bold px-2 py-0.5 rounded ${isOwner ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}">
                ${isOwner ? '👑 オーナー' : '🏫 メンバー'}
              </span>
              <span class="text-xs text-slate-400">作成: ${escapeHtml(ownerName)}</span>
            </div>
            <h3 class="text-lg font-bold text-slate-800 mt-1.5">${escapeHtml(cls.name)}</h3>
            ${cls.description ? `<p class="text-xs text-slate-500 mt-1 line-clamp-1">${escapeHtml(cls.description)}</p>` : ''}
          </div>
          <span class="text-xs text-indigo-600 font-bold shrink-0">クラスを開く →</span>
        </div>
      </div>
    `;
  }).join('');
}

export async function joinClassWithCode(rawCode) {
  const code = (rawCode || '').trim().toUpperCase();
  if (!code) return alert('招待コードを入力してください');

  const { data: joinedClassId, error } = await supabaseClient.rpc('join_class_by_code', { code });
  if (error || !joinedClassId) {
    alert(`クラス参加エラー: ${error ? error.message : '招待コードが無効です'}`);
    updateUrlParams({}, true);
    showView('dashboard');
    return;
  }

  document.getElementById('join-class-code-input').value = '';
  updateUrlParams({ class: joinedClassId }, true);
  await openClassPage(joinedClassId, true);
}

export async function openClassPage(classId, skipPushState = false) {
  const { data: cls, error } = await supabaseClient.from('classes').select('*').eq('id', classId).single();
  if (error || !cls) {
    alert('クラスが見つからないか、参加権限がありません');
    updateUrlParams({}, true);
    showView('dashboard');
    return;
  }

  state.currentClass = cls;
  if (!skipPushState) updateUrlParams({ class: cls.id });

  showView('class');
  document.getElementById('class-detail-name').textContent = cls.name;
  document.getElementById('class-detail-desc').textContent = cls.description || '説明なし';
  document.getElementById('class-invite-code').textContent = cls.invite_code;

  const inviteUrl = new URL(window.location.href);
  inviteUrl.search = `?join_class=${cls.invite_code}`;
  document.getElementById('class-invite-url-input').value = inviteUrl.toString();

  const isOwner = state.currentUser && cls.owner_id === state.currentUser.id;
  document.getElementById('class-owner-actions').innerHTML = isOwner
    ? `<button type="button" onclick="window.deleteClass('${cls.id}')" class="text-xs bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold px-3 py-2 rounded-lg transition">クラスを削除</button>`
    : `<button type="button" onclick="window.leaveClass('${cls.id}')" class="text-xs bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 font-bold px-3 py-2 rounded-lg transition">クラスから退会</button>`;

  await Promise.all([loadClassDecksAndSelector(cls.id), loadClassMembers(cls)]);
}

async function loadClassDecksAndSelector(classId) {
  const listEl = document.getElementById('class-decks-list');
  const selectEl = document.getElementById('class-add-deck-select');
  listEl.innerHTML = '<p class="text-slate-500 text-sm">読み込み中...</p>';

  const [{ data: sharedRows }, { data: myDecks }] = await Promise.all([
    supabaseClient.from('class_decks').select('deck_id, added_by, added_at, decks(*)').eq('class_id', classId).order('added_at', { ascending: false }),
    supabaseClient.from('decks').select('id, title').eq('user_id', state.currentUser.id).order('created_at', { ascending: false })
  ]);

  const sharedDeckIds = new Set((sharedRows || []).map(r => r.deck_id));
  const availableMyDecks = (myDecks || []).filter(d => !sharedDeckIds.has(d.id));

  selectEl.innerHTML = availableMyDecks.length > 0
    ? `<option value="">追加するマイ単語帳を選択...</option>` + availableMyDecks.map(d => `<option value="${d.id}">${escapeHtml(d.title)}</option>`).join('')
    : `<option value="">追加できる未共有のマイ単語帳がありません</option>`;

  const validRows = (sharedRows || []).filter(r => r.decks);
  document.getElementById('class-decks-count').textContent = validRows.length;

  if (validRows.length === 0) {
    listEl.innerHTML = '<p class="text-slate-500 text-sm bg-white p-4 rounded-xl">まだこのクラスに共有された単語帳はありません。</p>';
    return;
  }

  await fetchDisplayNames(validRows.map(r => r.decks.user_id));

  listEl.innerHTML = validRows.map(row => {
    const deck = row.decks;
    const creatorName = state.profileCache[deck.user_id] || '作成者';
    const canRemove = state.currentUser && (row.added_by === state.currentUser.id || state.currentClass.owner_id === state.currentUser.id);
    return `
      <div onclick="window.openDeck('${deck.id}')" class="bg-white p-5 rounded-xl shadow border border-slate-100 hover:border-indigo-300 hover:shadow-md cursor-pointer transition flex justify-between items-start gap-3">
        <div>
          <span class="text-xs font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">🏫 クラス共有</span>
          <h4 class="text-lg font-bold text-slate-800 mt-1">${escapeHtml(deck.title)}</h4>
          <p class="text-xs text-indigo-600 font-semibold mt-0.5">${deck.textbook_name ? escapeHtml(deck.textbook_name) : '教科書未指定'}</p>
          <button type="button" onclick="event.stopPropagation(); window.openCreatorPage('${deck.user_id}')" class="mt-2 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-indigo-600 hover:underline font-medium">
            👤 ${escapeHtml(creatorName)}
          </button>
        </div>
        ${canRemove ? `<button type="button" onclick="event.stopPropagation(); window.removeDeckFromClass('${classId}', '${deck.id}')" class="text-xs bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 px-2.5 py-1 rounded font-medium transition shrink-0">解除</button>` : ''}
      </div>
    `;
  }).join('');
}

async function loadClassMembers(cls) {
  const { data: members } = await supabaseClient.from('class_members').select('user_id, role, joined_at').eq('class_id', cls.id).order('joined_at', { ascending: true });
  const memberIds = [...new Set([cls.owner_id, ...(members || []).map(m => m.user_id)])];
  await fetchDisplayNames(memberIds);

  document.getElementById('class-members-count').textContent = memberIds.length;
  document.getElementById('class-members-list').innerHTML = memberIds.map(uid => {
    const name = state.profileCache[uid] || 'メンバー';
    const isOwner = uid === cls.owner_id;
    return `
      <button type="button" onclick="window.openCreatorPage('${uid}')" class="inline-flex items-center gap-1.5 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 px-3 py-1.5 rounded-full text-xs font-semibold text-slate-700 hover:text-indigo-700 transition">
        <span>${isOwner ? '👑' : '👤'}</span>
        <span>${escapeHtml(name)}</span>
      </button>
    `;
  }).join('');
}

export function initClassEvents() {
  document.getElementById('create-class-btn').addEventListener('click', async () => {
    const nameEl = document.getElementById('new-class-name');
    const descEl = document.getElementById('new-class-desc');
    const name = nameEl.value.trim();
    const desc = descEl.value.trim();
    if (!name) return alert('クラス名を入力してください');
    if (!state.currentUser) return;

    const { data: newClassId, error } = await supabaseClient.rpc('create_new_class', {
      class_name: name,
      class_desc: desc || null
    });

    if (error || !newClassId) {
      alert(`クラス作成エラー: ${error ? error.message : '作成に失敗しました'}`);
      return;
    }

    nameEl.value = '';
    descEl.value = '';
    await openClassPage(newClassId);
  });

  document.getElementById('join-class-btn').addEventListener('click', () => {
    joinClassWithCode(document.getElementById('join-class-code-input').value);
  });

  document.getElementById('copy-class-invite-btn').addEventListener('click', async () => {
    const input = document.getElementById('class-invite-url-input');
    const btn = document.getElementById('copy-class-invite-btn');
    try {
      await navigator.clipboard.writeText(input.value);
      const orig = btn.textContent;
      btn.textContent = '✓ コピー完了！';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    } catch {
      input.select();
      document.execCommand('copy');
      alert('招待URLをコピーしました！');
    }
  });

  document.getElementById('class-add-deck-btn').addEventListener('click', async () => {
    if (!state.currentClass || !state.currentUser) return;
    const deckId = document.getElementById('class-add-deck-select').value;
    if (!deckId) return alert('クラスに追加する単語帳を選択してください');

    const { error } = await supabaseClient.from('class_decks').insert([
      { class_id: state.currentClass.id, deck_id: deckId, added_by: state.currentUser.id }
    ]);
    if (error) alert(`追加エラー: ${error.message}`);
    else await loadClassDecksAndSelector(state.currentClass.id);
  });

  window.openClassPage = openClassPage;

  window.deleteClass = async function(classId) {
    if (!confirm('このクラスを削除しますか？')) return;
    const { error } = await supabaseClient.from('classes').delete().eq('id', classId);
    if (error) alert(`削除エラー: ${error.message}`);
    else {
      state.currentClass = null;
      updateUrlParams({});
      showView('dashboard');
    }
  };

  window.leaveClass = async function(classId) {
    if (!confirm('このクラスから退会しますか？')) return;
    const { error } = await supabaseClient.from('class_members').delete().eq('class_id', classId).eq('user_id', state.currentUser.id);
    if (error) alert(`退会エラー: ${error.message}`);
    else {
      state.currentClass = null;
      updateUrlParams({});
      showView('dashboard');
    }
  };

  window.removeDeckFromClass = async function(classId, deckId) {
    if (!confirm('この単語帳のクラス共有を解除しますか？')) return;
    await supabaseClient.from('class_decks').delete().eq('class_id', classId).eq('deck_id', deckId);
    await loadClassDecksAndSelector(classId);
  };
}
