/**
 * Loads gtag.js and configures GA4 and/or Google Ads from meta tag IDs.
 *
 * Privacy: allow_ad_personalization_signals is set to false before any config.
 * CSP: pages must allow script-src and connect-src for googletagmanager.com.
 */

/**
 * @param {import("./config.js").SiteAnalyticsConfig} siteConfig
 */
export function initGtag(siteConfig) {
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;

  gtag("js", new Date());
  gtag("set", "allow_ad_personalization_signals", false);

  if (siteConfig.hasGa4) gtag("config", siteConfig.ga4MeasurementId);
  if (siteConfig.hasGoogleAds) gtag("config", siteConfig.googleAdsTagId);

  const gtagScript = document.createElement("script");
  gtagScript.async = true;
  const primaryTagId = siteConfig.hasGa4
    ? siteConfig.ga4MeasurementId
    : siteConfig.googleAdsTagId;
  gtagScript.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(primaryTagId)}`;
  document.head.appendChild(gtagScript);
}
