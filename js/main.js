import { registerRouteHandlers, initRouterEvents } from './router.js';
import { initAuthEvents } from './auth.js';
import { refreshDashboard, openCreatorPage, initDashboardEvents } from './dashboard.js';
import { joinClassWithCode, openClassPage, initClassEvents } from './classes.js';
import { openDeck, openDeckByShareId, initDeckDetailEvents } from './deckDetail.js';
import { initStudyEvents } from './study.js';

// ルーターへ各画面の起動関数を登録
registerRouteHandlers({
  onShowDashboard: refreshDashboard,
  joinClassWithCode,
  openClassPage,
  openCreatorPage,
  openDeckByShareId,
  openDeck
});

// 各モジュールのイベントリスナーを初期化
initRouterEvents();
initAuthEvents();
initDashboardEvents();
initClassEvents();
initDeckDetailEvents();
initStudyEvents();
