import { supabaseClient, escapeHtml } from './config.js';
import { state } from './state.js';

/**
 * RFC4180準拠のCSV/TSVパーサー（セル内の改行・カンマ・ダブルクォーテーションに完全対応）
 */
function parseDelimitedText(rawText, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const text = rawText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(field.trim());
        field = '';
      } else if (ch === '\n') {
        row.push(field.trim());
        if (row.some(cell => cell !== '')) rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  row.push(field.trim());
  if (row.some(cell => cell !== '')) rows.push(row);
  return rows;
}

/**
 * スプレッドシート / Excel / Googleドキュメントのテキストを解析してカード配列に変換
 */
export function parseImportedCards(rawText) {
  const trimmed = (rawText || '').trim();
  if (!trimmed) return { cards: [], errors: [] };

  // タブが含まれていればスプレッドシート/Excelのコピペ(TSV)として優先解析
  const hasTabs = trimmed.includes('\t');
  const rows = hasTabs ? parseDelimitedText(trimmed, '\t') : parseDelimitedText(trimmed, ',');

  const cards = [];
  const errors = [];

  rows.forEach((rawCells, idx) => {
    const lineNum = idx + 1;
    let cells = [...rawCells];

    // タブもカンマもない1列行の場合、ドキュメント記法（:: / -> / ＝ / ：）で分割を試みる
    if (!hasTabs && cells.length === 1) {
      const single = cells[0].replace(/^[-*・•]\s+/, '').replace(/^\d+[.)．]\s+/, '');
      const sepMatch = single.match(/^(.+?)\s*(?:::|->|→|＝)\s*(.+)$/);
      if (sepMatch) {
        cells = [sepMatch[1].trim(), sepMatch[2].trim()];
      } else {
        cells = [single];
      }
    }

    // ヘッダー行の自動スキップ
    if (
      lineNum === 1 &&
      /^(問題|表面|形式|type|front|question)/i.test(cells[0]) &&
      (!cells[1] || /^(答え|裏面|解答|要素|back|answer)/i.test(cells[1]))
    ) {
      return;
    }

    let col1 = (cells[0] || '').replace(/^[-*・•]\s+/, '').trim();
    const col2 = (cells[1] || '').trim();
    const col3 = (cells[2] || '').trim();
    const col4 = (cells[3] || '').trim();

    if (!col1) return;

    // ページ番号と問題番号の解析
    let pageNumber = null;
    if (col3 !== '') {
      const numMatch = col3.match(/\d+/);
      if (numMatch) pageNumber = parseInt(numMatch[0], 10);
    }
    const questionNumber = col4 || null;

    // 先頭タグ（[並べ替え] / [複数] / [穴埋め] / [一問一答] 等）の判定
    let explicitType = null;
    const tagMatch = col1.match(/^[\[【(（](一問一答|basic|並べ替え|並び替え|order|複数要素|複数|multi|multi_element|穴埋め|cloze)[\]】)）]\s*(.*)$/i);
    if (tagMatch) {
      const tag = tagMatch[1].toLowerCase();
      col1 = tagMatch[2].trim();
      if (tag === '一問一答' || tag === 'basic') explicitType = 'basic';
      else if (tag === '並べ替え' || tag === '並び替え' || tag === 'order') explicitType = 'order';
      else if (tag === '複数要素' || tag === '複数' || tag === 'multi' || tag === 'multi_element') explicitType = 'multi_element';
      else if (tag === '穴埋め' || tag === 'cloze') explicitType = 'cloze';
    }

    // タグ未指定時は {{...}} の有無で穴埋めか一問一答かを自動判定
    const cardType = explicitType || (/\{\{.+?\}\}/.test(col1) ? 'cloze' : 'basic');

    if (cardType === 'basic') {
      if (!col1 || !col2) {
        errors.push(`${lineNum}行目（一問一答）: 問題文と答えの両方が必要です`);
        return;
      }
      cards.push({
        card_type: 'basic',
        page_number: pageNumber,
        question_number: questionNumber,
        content: { front: col1, back: col2 }
      });
    } else if (cardType === 'order') {
      const items = col2.split(/\s*[|｜／/]\s*|\n/).map(s => s.trim()).filter(Boolean);
      if (!col1 || items.length < 2) {
        errors.push(`${lineNum}行目（並べ替え）: 問題文と、「|」区切りで2つ以上の要素が必要です`);
        return;
      }
      cards.push({
        card_type: 'order',
        page_number: pageNumber,
        question_number: questionNumber,
        content: { prompt: col1, items }
      });
    } else if (cardType === 'multi_element') {
      const answers = col2.split(/\s*[|｜／/]\s*|\n/).map(s => s.trim()).filter(Boolean);
      if (!col1 || answers.length < 2) {
        errors.push(`${lineNum}行目（複数要素）: 問題文と、「|」区切りで2つ以上の正解要素が必要です`);
        return;
      }
      cards.push({
        card_type: 'multi_element',
        page_number: pageNumber,
        question_number: questionNumber,
        content: { prompt: col1, answers }
      });
    } else if (cardType === 'cloze') {
      const blanks = [...col1.matchAll(/\{\{(.+?)\}\}/g)];
      if (!col1 || blanks.length === 0) {
        errors.push(`${lineNum}行目（穴埋め）: 空欄にしたい語句を {{答え}} のように囲んでください`);
        return;
      }
      cards.push({
        card_type: 'cloze',
        page_number: pageNumber,
        question_number: questionNumber,
        content: { text: col1 }
      });
    }
  });

  return { cards, errors };
}

/**
 * カード配列をスプレッドシート貼付用TSVまたはCSV文字列に変換する
 */
export function serializeCards(cards, delimiter = '\t') {
  const escapeCell = (val) => {
    const str = val === null || val === undefined ? '' : String(val);
    if (str.includes(delimiter) || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    ['問題・形式', '答え・要素（|区切り）', 'ページ', '問題番号'].map(escapeCell).join(delimiter)
  ];

  (cards || []).forEach(card => {
    let col1 = '';
    let col2 = '';

    if (card.card_type === 'basic') {
      col1 = card.content.front;
      col2 = card.content.back;
    } else if (card.card_type === 'order') {
      col1 = `[並べ替え] ${card.content.prompt}`;
      col2 = (card.content.items || []).join(' | ');
    } else if (card.card_type === 'multi_element') {
      col1 = `[複数] ${card.content.prompt}`;
      col2 = (card.content.answers || []).join(' | ');
    } else if (card.card_type === 'cloze') {
      col1 = `[穴埋め] ${card.content.text}`;
      col2 = '';
    }

    const col3 = card.page_number !== null && card.page_number !== undefined ? card.page_number : '';
    const col4 = card.question_number || '';
    lines.push([col1, col2, col3, col4].map(escapeCell).join(delimiter));
  });

  return lines.join('\n');
}

/**
 * スプレッドシート用の全4形式見本データ（TSV）
 */
function getTemplateTsv() {
  return [
    '問題・形式\t答え・要素（|区切り）\tページ\t問題番号',
    'achieve\t〜を達成する\t12\tNo.1',
    '[並べ替え] 以下の出来事を古い順に並べ替えよ\t大化の改新 | 平城京遷都 | 平安京遷都\t45\t問3',
    '[複数] 日本国憲法の三大原理を3つ挙げよ\t国民主権 | 基本的人権の尊重 | 平和主義\t88\t4',
    '[穴埋め] 光合成は植物の{{葉緑体}}で行われ、{{デンプン}}と酸素をつくる。\t\t50\t2'
  ].join('\n');
}

/**
 * 単語帳詳細画面のインポート・エクスポートUIイベントを初期化する
 */
export function initImportExportEvents(onCardsImported) {
  const toggleBtn = document.getElementById('toggle-import-export-btn');
  const panel = document.getElementById('import-export-panel');
  if (!toggleBtn || !panel) return;

  let parsedPreviewCards = [];

  toggleBtn.addEventListener('click', () => {
    panel.classList.toggle('hidden');
  });

  // 1. スプレッドシート貼付用コピー（エクスポート）
  document.getElementById('export-tsv-copy-btn').addEventListener('click', async () => {
    if (!state.currentCards || state.currentCards.length === 0) {
      return alert('書き出すカードがまだありません');
    }
    const tsv = serializeCards(state.currentCards, '\t');
    try {
      await navigator.clipboard.writeText(tsv);
      const btn = document.getElementById('export-tsv-copy-btn');
      const orig = btn.textContent;
      btn.textContent = '✓ コピー完了！スプレッドシートに貼付できます';
      setTimeout(() => { btn.textContent = orig; }, 2500);
    } catch {
      alert('クリップボードへのコピーに失敗しました');
    }
  });

  // 2. CSVダウンロード（Excel / スプレッドシート対応 BOM付きUTF-8）
  document.getElementById('export-csv-download-btn').addEventListener('click', () => {
    if (!state.currentCards || state.currentCards.length === 0) {
      return alert('書き出すカードがまだありません');
    }
    const csv = '\uFEFF' + serializeCards(state.currentCards, ',');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeTitle = (state.currentDeck?.title || 'flashcards').replace(/[\\/:*?"<>|]/g, '_');
    a.href = url;
    a.download = `${safeTitle}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // 3. 見本テンプレートをクリップボードにコピー
  document.getElementById('copy-import-template-btn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(getTemplateTsv());
      alert('全4形式の見本テンプレートをコピーしました！\nGoogleスプレッドシートやExcelのA1セルにそのまま貼り付けて使えます。');
    } catch {
      document.getElementById('import-paste-textarea').value = getTemplateTsv();
      updatePreview();
    }
  });

  // 4. CSV / TSV / TXT ファイル読み込み
  document.getElementById('import-file-input').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      document.getElementById('import-paste-textarea').value = String(reader.result || '');
      updatePreview();
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  });

  // 5. リアルタイムプレビュー更新
  const textarea = document.getElementById('import-paste-textarea');
  const previewArea = document.getElementById('import-preview-area');
  const executeBtn = document.getElementById('execute-bulk-import-btn');

  function updatePreview() {
    const { cards, errors } = parseImportedCards(textarea.value);
    parsedPreviewCards = cards;

    if (cards.length === 0 && errors.length === 0) {
      previewArea.innerHTML = '';
      executeBtn.disabled = true;
      executeBtn.textContent = 'プレビューを確認して一括登録する';
      return;
    }

    const typeLabels = {
      basic: '<span class="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold text-[10px]">一問一答</span>',
      order: '<span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-bold text-[10px]">並べ替え</span>',
      multi_element: '<span class="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-bold text-[10px]">複数要素</span>',
      cloze: '<span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-[10px]">穴埋め</span>'
    };

    const errorHtml = errors.length > 0
      ? `<div class="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs space-y-0.5 mb-2">
          <p class="font-bold">⚠️ 読み込めない行があります（${errors.length}件）:</p>
          ${errors.slice(0, 5).map(err => `<p>・${escapeHtml(err)}</p>`).join('')}
        </div>`
      : '';

    const rowsHtml = cards.slice(0, 8).map(c => {
      let qText = '';
      let aText = '';
      if (c.card_type === 'basic') { qText = c.content.front; aText = c.content.back; }
      else if (c.card_type === 'order') { qText = c.content.prompt; aText = c.content.items.join(' → '); }
      else if (c.card_type === 'multi_element') { qText = c.content.prompt; aText = c.content.answers.join(' / '); }
      else if (c.card_type === 'cloze') { qText = c.content.text; aText = '(空欄自動判定)'; }

      const meta = [c.page_number !== null ? `P.${c.page_number}` : '', c.question_number || ''].filter(Boolean).join(' ');
      return `
        <tr class="border-b border-slate-100">
          <td class="py-1.5 px-2 whitespace-nowrap">${typeLabels[c.card_type]}</td>
          <td class="py-1.5 px-2 font-medium text-slate-800 max-w-[200px] truncate">${escapeHtml(qText)}</td>
          <td class="py-1.5 px-2 text-slate-600 max-w-[200px] truncate">${escapeHtml(aText)}</td>
          <td class="py-1.5 px-2 text-slate-400 text-[11px] whitespace-nowrap">${escapeHtml(meta)}</td>
        </tr>
      `;
    }).join('');

    previewArea.innerHTML = `
      ${errorHtml}
      ${cards.length > 0 ? `
        <div class="bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
          <div class="px-3 py-1.5 bg-slate-100 text-xs font-bold text-slate-700 flex justify-between">
            <span>解析プレビュー（登録対象: ${cards.length}枚）</span>
            ${cards.length > 8 ? `<span class="text-slate-500 font-normal">先頭8件を表示中</span>` : ''}
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        </div>
      ` : ''}
    `;

    executeBtn.disabled = cards.length === 0;
    executeBtn.textContent = cards.length > 0
      ? `✅ ${cards.length}枚のカードを一括登録する`
      : 'プレビューを確認して一括登録する';
  }

  textarea.addEventListener('input', updatePreview);

  // 6. Supabaseへ一括インサート実行
  executeBtn.addEventListener('click', async () => {
    if (!state.currentDeck || !state.isDeckOwner || parsedPreviewCards.length === 0) return;

    executeBtn.disabled = true;
    executeBtn.textContent = '登録中...';

    const records = parsedPreviewCards.map(c => ({
      deck_id: state.currentDeck.id,
      card_type: c.card_type,
      page_number: c.page_number,
      question_number: c.question_number,
      content: c.content
    }));

    const { error } = await supabaseClient.from('cards').insert(records);
    if (error) {
      alert(`一括登録エラー: ${error.message}`);
      executeBtn.disabled = false;
      executeBtn.textContent = `✅ ${parsedPreviewCards.length}枚のカードを一括登録する`;
      return;
    }

    const count = records.length;
    textarea.value = '';
    parsedPreviewCards = [];
    previewArea.innerHTML = '';
    executeBtn.textContent = 'プレビューを確認して一括登録する';
    alert(`${count}枚のカードを一括登録しました！`);

    if (onCardsImported) {
      await onCardsImported(state.currentDeck.id);
    }
  });
}
