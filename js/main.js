import { registerRouteHandlers, initRouterEvents } from './router.js';
import { initAuthEvents, initAuthSession } from './auth.js';
import { initDashboardEvents } from './dashboard.js';
import { openDeck, openDeckByShareId, initDeckDetailEvents } from './deckDetail.js';
import { initStudyEvents } from './study.js';
import { openCreatorPage, initCreatorEvents } from './creator.js';
import { openClassPage, joinClassByCode, initClassEvents } from './classes.js';
import { openFolderPage, initFolderEvents } from './folders.js';
import { initStudyOptionEvents } from './studyOptions.js';

registerRouteHandlers({
  openDeck,
  openDeckByShareId,
  openCreatorPage,
  openClassPage,
  joinClassByCode,
  openFolderPage
});

initRouterEvents();
initAuthEvents();
initDashboardEvents();
initDeckDetailEvents();
initStudyEvents();
initCreatorEvents();
initClassEvents();
initFolderEvents();
initStudyOptionEvents();

initAuthSession();
