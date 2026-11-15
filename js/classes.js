import { supabaseClient, escapeHtml } from './config.js';
import { state } from './state.js';
import { fetchDisplayNames } from './auth.js';
import { updateUrlParams, showView } from './router.js';

export async function getUserClasses() {
  if (!state.currentUser) return [];
  const { data: memberships } = await supabaseClient
    .from('class_members')
    .select('class_id, role, classes(*)')
    .eq('user_id', state.currentUser.id);

  if (!memberships) return [];
  return memberships
    .filter(m => m.classes)
    .map(m => ({ ...m.classes, myRole: m.role }));
}

export async function loadMyClasses() {
  if (!state.currentUser) return;
  const listEl = document.getElementById('classes-list');
  listEl.innerHTML = '<p class="text-gray-500 text-sm">読み込み中...</p>';

  const classes = await getUserClasses();
  if (classes.length === 0) {
    listEl.innerHTML = '<p class="text-gray-500 text-sm">まだ参加しているクラスはありません。上のフォームから新しいクラスを作成するか、招待コードで参加しましょう。</p>';
    return;
  }

  listEl.innerHTML = classes.map(cls => `
    <div onclick="window.openClassPage('${cls.id}')" class="bg-white p-5 rounded-xl shadow hover:shadow-md cursor-pointer transition border border-indigo-100 hover:border-indigo-400">
      <div class="flex justify-between items-start gap-2">
        <span class="text-xs font-bold px-2 py-0.5 rounded ${cls.myRole === 'owner' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}">
          ${cls.myRole === 'owner' ? '👑 管理者' : '🎓 メンバー'}
        </span>
        <span class="text-xs font-mono text-slate-400">ID: ${escapeHtml(cls.invite_code)}</span>
      </div>
      <h3 class="text-lg font-bold text-slate-800 mt-2">${escapeHtml(cls.name)}</h3>
      <p class="text-xs text-slate-500 mt-1 line-clamp-1">${cls.description ? escapeHtml(cls.description) : '説明なし'}</p>
    </div>
  `).join('');
}

export async function openClassPage(classId, skipPushState = false) {
  const { data: cls, error } = await supabaseClient.from('classes').select('*').eq('id', classId).single();
  if (error || !cls) {
    alert('クラスが見つからないか、参加メンバーではありません');
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
  inviteUrl.search = `?join=${cls.invite_code}`;
  document.getElementById('class-invite-url-input').value = inviteUrl.toString();

  const isOwner = state.currentUser && cls.owner_id === state.currentUser.id;
  const actionsEl = document.getElementById('class-owner-actions');
  if (isOwner) {
    actionsEl.innerHTML = `<button type="button" onclick="window.deleteCurrentClass()" class="text-xs bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold px-3 py-2 rounded-lg transition">クラスを削除</button>`;
  } else {
    actionsEl.innerHTML = `<button type="button" onclick="window.leaveCurrentClass()" class="text-xs bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 font-bold px-3 py-2 rounded-lg transition">クラスを退会</button>`;
  }

  await loadClassDecksAndMembers(cls.id);
}

async function loadClassDecksAndMembers(classId) {
  const decksListEl = document.getElementById('class-decks-list');
  const membersListEl = document.getElementById('class-members-list');
  const selectEl = document.getElementById('class-add-deck-select');

  decksListEl.innerHTML = '<p class="text-slate-500 text-sm">読み込み中...</p>';

  const [
    { data: classDeckRows },
    { data: memberRows },
    { data: myDecks }
  ] = await Promise.all([
    supabaseClient.from('class_decks').select('deck_id, added_by, added_at, decks(*)').eq('class_id', classId).order('added_at', { ascending: false }),
    supabaseClient.from('class_members').select('user_id, role').eq('class_id', classId),
    supabaseClient.from('decks').select('id, title').eq('user_id', state.currentUser.id).order('created_at', { ascending: false })
  ]);

  const sharedDeckIds = new Set((classDeckRows || []).map(r => r.deck_id));
  const availableMyDecks = (myDecks || []).filter(d => !sharedDeckIds.has(d.id));
  selectEl.innerHTML = availableMyDecks.length > 0
    ? `<option value="">追加するマイ単語帳を選択...</option>` + availableMyDecks.map(d => `<option value="${d.id}">${escapeHtml(d.title)}</option>`).join('')
    : `<option value="">追加できるマイ単語帳がありません（すべて共有済み）</option>`;

  const allUserIds = [
    ...(memberRows || []).map(m => m.user_id),
    ...(classDeckRows || []).filter(r => r.decks).map(r => r.decks.user_id)
  ];
  await fetchDisplayNames(allUserIds);

  const members = memberRows || [];
  document.getElementById('class-members-count').textContent = members.length;
  membersListEl.innerHTML = members.map(m => {
    const name = state.profileCache[m.user_id] || 'メンバー';
    return `
      <button type="button" onclick="window.openCreatorPage('${m.user_id}')" class="inline-flex items-center gap-1.5 text-xs bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 px-3 py-1.5 rounded-full font-medium transition">
        <span>${m.role === 'owner' ? '👑' : '👤'}</span>
        <span>${escapeHtml(name)}</span>
      </button>
    `;
  }).join('');

  const validDeckRows = (classDeckRows || []).filter(r => r.decks);
  document.getElementById('class-decks-count').textContent = validDeckRows.length;

  if (validDeckRows.length === 0) {
    decksListEl.innerHTML = '<p class="text-slate-500 text-sm bg-white p-4 rounded-xl">このクラスにはまだ単語帳が共有されていません。上のプルダウンからマイ単語帳を追加しましょう！</p>';
    return;
  }

  decksListEl.innerHTML = validDeckRows.map(row => {
    const deck = row.decks;
    const creatorName = state.profileCache[deck.user_id] || '作成者';
    const canRemove = state.currentUser && (deck.user_id === state.currentUser.id || row.added_by === state.currentUser.id || state.currentClass.owner_id === state.currentUser.id);
    return `
      <div onclick="window.openDeck('${deck.id}')" class="bg-white p-5 rounded-xl shadow hover:shadow-md cursor-pointer transition border border-slate-100 hover:border-indigo-300 flex justify-between items-start gap-3">
        <div>
          <h4 class="text-lg font-bold text-slate-800">${escapeHtml(deck.title)}</h4>
          <p class="text-xs text-indigo-600 font-semibold mt-0.5">${deck.textbook_name ? escapeHtml(deck.textbook_name) : '教科書未指定'}</p>
          <button type="button" onclick="event.stopPropagation(); window.openCreatorPage('${deck.user_id}')" class="mt-2 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-indigo-600 hover:underline font-medium">
            👤 ${escapeHtml(creatorName)}
          </button>
        </div>
        ${canRemove ? `<button type="button" onclick="event.stopPropagation(); window.removeDeckFromClass('${classId}', '${deck.id}')" class="text-xs text-rose-500 hover:bg-rose-50 px-2 py-1 rounded font-medium shrink-0">共有解除</button>` : ''}
      </div>
    `;
  }).join('');
}

export async function joinClassByCode(rawCode, skipPushState = false) {
  const code = (rawCode || '').trim().toUpperCase();
  if (!code) return alert('招待コードを入力してください');
  if (!state.currentUser) return;

  const { data: targetClass, error: findErr } = await supabaseClient
    .from('classes')
    .select('*')
    .eq('invite_code', code)
    .maybeSingle();

  if (findErr || !targetClass) {
    alert('招待コードが見つかりません。コードが正しいか確認してください。');
    updateUrlParams({}, true);
    showView('dashboard');
    return;
  }

  const { error: joinErr } = await supabaseClient
    .from('class_members')
    .insert([{ class_id: targetClass.id, user_id: state.currentUser.id, role: 'member' }]);

  if (joinErr && joinErr.code !== '23505') {
    alert(`クラスへの参加に失敗しました: ${joinErr.message}`);
    return;
  }

  await openClassPage(targetClass.id, skipPushState);
}

export function initClassEvents() {
  document.getElementById('create-class-btn').addEventListener('click', async () => {
    const nameEl = document.getElementById('new-class-name');
    const descEl = document.getElementById('new-class-desc');
    const name = nameEl.value.trim();
    const desc = descEl.value.trim();
    if (!name) return alert('クラス名を入力してください');
    if (!state.currentUser) return;

    const { data: created, error } = await supabaseClient
      .from('classes')
      .insert([{ name, description: desc || null, owner_id: state.currentUser.id }])
      .select()
      .single();

    if (error || !created) {
      alert(`クラス作成エラー: ${error ? error.message : '作成に失敗しました'}`);
      return;
    }

    await supabaseClient.from('class_members').insert([{ class_id: created.id, user_id: state.currentUser.id, role: 'owner' }]);
    nameEl.value = '';
    descEl.value = '';
    await openClassPage(created.id);
  });

  document.getElementById('join-class-btn').addEventListener('click', async () => {
    const input = document.getElementById('join-class-code-input');
    await joinClassByCode(input.value);
    input.value = '';
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
    if (!deckId) return alert('追加するマイ単語帳を選択してください');

    const { error } = await supabaseClient
      .from('class_decks')
      .insert([{ class_id: state.currentClass.id, deck_id: deckId, added_by: state.currentUser.id }]);

    if (error) alert(`共有エラー: ${error.message}`);
    else await loadClassDecksAndMembers(state.currentClass.id);
  });

  window.openClassPage = openClassPage;

  window.removeDeckFromClass = async function(classId, deckId) {
    if (!confirm('この単語帳のクラス共有を解除しますか？')) return;
    await supabaseClient.from('class_decks').delete().eq('class_id', classId).eq('deck_id', deckId);
    await loadClassDecksAndMembers(classId);
  };

  window.deleteCurrentClass = async function() {
    if (!state.currentClass) return;
    if (!confirm('このクラスを完全に削除しますか？（単語帳自体は削除されません）')) return;
    const { error } = await supabaseClient.from('classes').delete().eq('id', state.currentClass.id);
    if (error) alert(`削除エラー: ${error.message}`);
    else {
      state.currentClass = null;
      updateUrlParams({});
      showView('dashboard');
    }
  };

  window.leaveCurrentClass = async function() {
    if (!state.currentClass || !state.currentUser) return;
    if (!confirm('このクラスから退会しますか？')) return;
    await supabaseClient.from('class_members').delete().eq('class_id', state.currentClass.id).eq('user_id', state.currentUser.id);
    state.currentClass = null;
    updateUrlParams({});
    showView('dashboard');
  };
}
