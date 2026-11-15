export const state = {
  currentUser: null,
  currentDeck: null,
  isDeckOwner: false,
  isCurrentDeckSaved: false,
  selectedCardType: 'basic',
  currentCards: [],
  weakCards: [],
  starredCardIds: new Set(),
  studyOptions: {
    shuffle: false,
    reverse: false
  },
  studyContext: 'deck', // 'deck' または 'folder'
  studyQueue: [],
  currentStudyIndex: 0,
  isWeakReviewMode: false,
  studyModeLabel: '全問学習',
  studySessionStats: {
    correctCount: 0,
    wrongCards: []
  },
  profileCache: {},
  currentClass: null,
  currentFolder: null,
  folderAllCards: [],
  folderWeakCards: []
};
