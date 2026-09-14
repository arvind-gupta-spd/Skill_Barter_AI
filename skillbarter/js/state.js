export const state = {
  currentUser: null,
  allSkills: [],
  allWorkshops: [],
  notifications: [],
  currentView: 'home',
  isMenuOpen: false,
  unsubSkills: () => {},
  unsubWorkshops: () => {},
  unsubNotifications: () => {},
  navClickHandler: null,
  activeCallCleanup: null,
  ratingCache: {}
};
