/**
 * Loads gtag.js when the <head> bootstrap (gtag-init.js) is not present.
 * Normal pages include gtag-init.js + async gtag/js in <head> for Google Ads verification.
 *
 * Privacy: allow_ad_personalization_signals is set to false before any config.
 * CSP: pages must allow script-src and connect-src for googletagmanager.com.
 */

/**
 * @param {import("./config.js").SiteAnalyticsConfig} siteConfig
 */
export function initGtag(siteConfig) {
  if (window.__siteAnalyticsGtagReady) return;

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;

  gtag("js", new Date());
  gtag("set", "allow_ad_personalization_signals", false);

  if (siteConfig.hasGoogleAds) gtag("config", siteConfig.googleAdsTagId);
  if (siteConfig.hasGa4) gtag("config", siteConfig.ga4MeasurementId);

  const gtagLibraryScript = document.createElement("script");
  gtagLibraryScript.async = true;
  const loaderTagId = siteConfig.hasGoogleAds
    ? siteConfig.googleAdsTagId
    : siteConfig.ga4MeasurementId;
  gtagLibraryScript.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(loaderTagId)}`;
  document.head.appendChild(gtagLibraryScript);

  window.__siteAnalyticsGtagReady = true;
}
