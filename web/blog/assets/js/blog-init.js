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

/** Shared asset URL helpers for blog list + article (Firestore HTML has no build-time ?v=). */
(() => {
  function assetCacheVersion() {
    return (
      document.body?.dataset?.assetVersion ||
      document.querySelector('meta[name="site-version"]')?.getAttribute("content") ||
      ""
    );
  }

  function normalizeAssetUrl(url) {
    let src = String(url || "").trim();
    if (!src) return src;
    src = src.replace(/^https:\/\/medicina-familiar\.co(?=\/)/i, "");
    if (src === "/assets/images/blog-medico-familiar-consulta.jpg") {
      return "/assets/images/blog/blog-medico-familiar-consulta.jpg";
    }
    return src.split("?")[0];
  }

  function bustAssetUrl(url) {
    const src = normalizeAssetUrl(url);
    if (!src || !src.startsWith("/assets/")) return src;
    const version = assetCacheVersion();
    if (!version) return src;
    return `${src}?v=${encodeURIComponent(version)}`;
  }

  window.__blogAssets = {
    assetCacheVersion,
    normalizeAssetUrl,
    bustAssetUrl,
    assetCacheQuery() {
      const version = assetCacheVersion();
      return version ? `?v=${encodeURIComponent(version)}` : "";
    },
  };
})();
