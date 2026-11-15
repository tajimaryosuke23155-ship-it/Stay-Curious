let activeKeyHandler = null;

/**
 * 既存のフラッシュカードキーボードリスナーを解除
 */
export function cleanupFlashcardGestures() {
  if (activeKeyHandler) {
    window.removeEventListener('keydown', activeKeyHandler);
    activeKeyHandler = null;
  }
}

/**
 * 3Dフリップ・斜め対応の色付きスワイプ・逆再生Undo・キーボード操作を備えたフラッシュカードを描画する
 * @param {HTMLElement} container - カードを描画する親要素
 * @param {Object} options
 * @param {string} options.frontHtml - 表面のHTML
 * @param {string} options.backHtml - 裏面のHTML
 * @param {Function} options.onKnow - 「覚えた（右スワイプ / →キー）」時のコールバック
 * @param {Function} options.onDontKnow - 「まだ（左スワイプ / ←キー）」時のコールバック
 * @param {Function} [options.onUndo] - 「1つ戻る（Zキー / Backspace）」時のコールバック
 * @param {'right'|'left'|null} [options.undoFromDirection] - 逆再生で戻ってくる方向（'right'なら右外から、'left'なら左外から滑り込む）
 */
export function mountInteractiveFlashcard(container, { frontHtml, backHtml, onKnow, onDontKnow, onUndo, undoFromDirection = null }) {
  cleanupFlashcardGestures();

  let isFlipped = false;
  let isAnimatingOut = false;

  container.innerHTML = `
    <div class="fc-scene w-full max-w-xl mx-auto">
      <div id="fc-swipe-wrapper" class="fc-swipe-wrapper">
        <!-- 右スワイプ時の緑色オーバーレイ -->
        <div id="fc-tint-right" class="fc-tint-overlay fc-tint-right">
          <span class="px-3 py-1 rounded-lg bg-emerald-600 text-white font-extrabold text-sm tracking-wider shadow">
            覚えた！ ✓
          </span>
        </div>
        <!-- 左スワイプ時の赤色オーバーレイ -->
        <div id="fc-tint-left" class="fc-tint-overlay fc-tint-left">
          <span class="px-3 py-1 rounded-lg bg-rose-600 text-white font-extrabold text-sm tracking-wider shadow">
            もう一度 ↺
          </span>
        </div>

        <!-- 3D回転するカード本体 -->
        <div id="fc-card-inner" class="fc-card-inner">
          <div class="fc-face fc-face-front">
            ${frontHtml}
            <span class="absolute bottom-3 text-[11px] text-slate-400 font-medium pointer-events-none">
              タップまたは Space で答えを見る
            </span>
          </div>
          <div class="fc-face fc-face-back">
            ${backHtml}
            <span class="absolute bottom-3 text-[11px] text-slate-400 font-medium pointer-events-none">
              左右（斜めもOK）にスワイプ、または ← / → キーで判定
            </span>
          </div>
        </div>
      </div>

      <!-- 操作ヒントバー -->
      <div class="flex flex-wrap justify-center items-center gap-x-4 gap-y-1 mt-3 text-[11px] text-slate-400">
        <span><kbd class="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-600 font-mono">Space</kbd> 裏返す</span>
        <span><kbd class="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-600 font-mono">←</kbd> もう一度</span>
        <span><kbd class="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-600 font-mono">→</kbd> 覚えた</span>
        ${onUndo ? `<span><kbd class="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-600 font-mono">Z</kbd> 1つ戻る</span>` : ''}
      </div>
    </div>
  `;

  const wrapper = container.querySelector('#fc-swipe-wrapper');
  const inner = container.querySelector('#fc-card-inner');
  const tintRight = container.querySelector('#fc-tint-right');
  const tintLeft = container.querySelector('#fc-tint-left');

  // 1つ戻る（Undo）時は、前回飛んでいった方向から逆再生で中央へ滑り込ませる
  if (undoFromDirection === 'right' || undoFromDirection === 'left') {
    const isFromRight = undoFromDirection === 'right';
    wrapper.style.transition = 'none';
    wrapper.style.transform = isFromRight
      ? 'translate(115%, -18px) rotate(14deg)'
      : 'translate(-115%, -18px) rotate(-14deg)';
    wrapper.style.opacity = '0.25';

    if (isFromRight) {
      tintRight.style.opacity = '0.95';
    } else {
      tintLeft.style.opacity = '0.95';
    }

    // 次の描画フレームでアニメーションを有効化して中央へ戻す
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        wrapper.style.transition = 'transform 0.36s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.28s ease';
        tintRight.style.transition = 'opacity 0.36s ease';
        tintLeft.style.transition = 'opacity 0.36s ease';

        wrapper.style.transform = 'translate(0px, 0px) rotate(0deg)';
        wrapper.style.opacity = '1';
        tintRight.style.opacity = '0';
        tintLeft.style.opacity = '0';

        setTimeout(() => {
          wrapper.style.transition = '';
          wrapper.style.transform = '';
          wrapper.style.opacity = '';
          tintRight.style.transition = '';
          tintLeft.style.transition = '';
        }, 380);
      });
    });
  }

  function toggleFlip() {
    if (isAnimatingOut) return;
    isFlipped = !isFlipped;
    inner.classList.toggle('is-flipped', isFlipped);
  }

  function triggerSwipeResult(direction, exitDy = 0) {
    if (isAnimatingOut) return;
    isAnimatingOut = true;
    cleanupFlashcardGestures();

    // 斜めスワイプの勢いをそのまま活かして飛んでいくYオフセット
    const clampedDy = Math.max(-140, Math.min(140, exitDy * 1.4));

    if (direction === 'right') {
      tintRight.style.opacity = '1';
      tintLeft.style.opacity = '0';
      wrapper.style.transform = `translate(120%, ${clampedDy}px) rotate(14deg)`;
      wrapper.style.opacity = '0';
      setTimeout(() => onKnow(), 200);
    } else {
      tintLeft.style.opacity = '1';
      tintRight.style.opacity = '0';
      wrapper.style.transform = `translate(-120%, ${clampedDy}px) rotate(-14deg)`;
      wrapper.style.opacity = '0';
      setTimeout(() => onDontKnow(), 200);
    }
  }

  // ポインターイベント（斜め対応タッチ＆マウススワイプ + タップ判定）
  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let currentX = 0;
  let currentY = 0;
  let isPointerDown = false;
  let hasMoved = false;

  // 判定をより広く・軽快に（75px移動、または素早いフリックなら45pxで確定）
  const SWIPE_THRESHOLD = 75;
  const FLICK_MIN_DISTANCE = 45;
  const FLICK_MAX_DURATION = 260;

  wrapper.addEventListener('pointerdown', (e) => {
    if (isAnimatingOut) return;
    if (e.target.closest('[data-no-flip], button, a, input')) return;

    isPointerDown = true;
    hasMoved = false;
    startX = e.clientX;
    startY = e.clientY;
    startTime = performance.now();
    currentX = 0;
    currentY = 0;
    wrapper.classList.add('is-dragging');
    wrapper.setPointerCapture(e.pointerId);
  });

  wrapper.addEventListener('pointermove', (e) => {
    if (!isPointerDown || isAnimatingOut) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      hasMoved = true;
    }

    currentX = dx;
    currentY = dy;

    // 斜め上・斜め下にも自然に追従（Y方向は少し抑えて心地よい重みを持たせる）
    const followY = dy * 0.45;
    const rotateDeg = dx * 0.045;
    wrapper.style.transform = `translate(${dx}px, ${followY}px) rotate(${rotateDeg}deg)`;

    // 横方向の移動量に応じてリアルタイムに緑／赤の色をかける
    const ratio = Math.min(Math.abs(dx) / SWIPE_THRESHOLD, 1);
    if (dx > 6) {
      tintRight.style.opacity = String(ratio);
      tintLeft.style.opacity = '0';
    } else if (dx < -6) {
      tintLeft.style.opacity = String(ratio);
      tintRight.style.opacity = '0';
    } else {
      tintRight.style.opacity = '0';
      tintLeft.style.opacity = '0';
    }
  });

  function endPointer(e) {
    if (!isPointerDown) return;
    isPointerDown = false;
    wrapper.classList.remove('is-dragging');
    if (wrapper.hasPointerCapture(e.pointerId)) {
      wrapper.releasePointerCapture(e.pointerId);
    }

    // ほとんど動いていなければ「タップ」とみなして3Dフリップ
    if (!hasMoved && Math.abs(currentX) < 10 && Math.abs(currentY) < 10) {
      tintRight.style.opacity = '0';
      tintLeft.style.opacity = '0';
      wrapper.style.transform = '';
      toggleFlip();
      return;
    }

    const elapsed = performance.now() - startTime;
    const isQuickFlick = elapsed <= FLICK_MAX_DURATION && Math.abs(currentX) >= FLICK_MIN_DISTANCE;

    // 横移動が閾値を超えているか、素早い斜め・横フリックなら即判定確定
    if (currentX >= SWIPE_THRESHOLD || (isQuickFlick && currentX > 0)) {
      triggerSwipeResult('right', currentY * 0.45);
    } else if (currentX <= -SWIPE_THRESHOLD || (isQuickFlick && currentX < 0)) {
      triggerSwipeResult('left', currentY * 0.45);
    } else {
      wrapper.style.transform = '';
      tintRight.style.opacity = '0';
      tintLeft.style.opacity = '0';
    }
  }

  wrapper.addEventListener('pointerup', endPointer);
  wrapper.addEventListener('pointercancel', endPointer);

  // キーボード操作
  activeKeyHandler = (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (isAnimatingOut) return;

    if (e.code === 'Space' || e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      toggleFlip();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      triggerSwipeResult('right');
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      triggerSwipeResult('left');
    } else if ((e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') && onUndo) {
      e.preventDefault();
      cleanupFlashcardGestures();
      onUndo();
    }
  };

  window.addEventListener('keydown', activeKeyHandler);

  return {
    flip: toggleFlip,
    swipeRight: () => triggerSwipeResult('right'),
    swipeLeft: () => triggerSwipeResult('left')
  };
}
