/**
 * @param {import("./config.js").AnalyticsConfig} config
 */
export function initGtag(config) {
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("set", "allow_ad_personalization_signals", false);
  if (config.hasGa) gtag("config", config.measurementId);
  if (config.hasAds) gtag("config", config.adsTagId);

  const script = document.createElement("script");
  script.async = true;
  const tagId = config.hasGa ? config.measurementId : config.adsTagId;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tagId)}`;
  document.head.appendChild(script);
}
