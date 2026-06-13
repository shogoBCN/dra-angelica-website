(() => {
  const cfg = window.__firebaseConfig__;
  const placeholders =
    !cfg?.apiKey ||
    String(cfg.apiKey).includes("REPLACE") ||
    String(cfg.appId || "").includes("REPLACE");
  if (placeholders) {
    window.__blogFirebaseConfigured = false;
    return;
  }
  firebase.initializeApp(cfg);
  if (firebase.auth) {
    firebase
      .auth()
      .setPersistence(firebase.auth.Auth.Persistence.LOCAL)
      .catch(() => {});
  }
  window.__blogFirebaseConfigured = true;
})();
