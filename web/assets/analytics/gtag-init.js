/**
 * Google tag bootstrap (gtag.js) — loaded synchronously from <head>.
 *
 * Pair with the async library tag in HTML:
 *   <script async src="https://www.googletagmanager.com/gtag/js?id=AW-…"></script>
 *   <script src="…/gtag-init.js"></script>
 *
 * Kept as a classic script (not a module) so Google Ads / Tag Assistant can detect
 * the tag in page source without waiting for deferred ES modules.
 */
(function bootstrapGoogleTag() {
  const enablementMeta = document.querySelector('meta[name="site-analytics"]');
  const enablementFlag = enablementMeta?.getAttribute("content")?.trim().toLowerCase();
  if (enablementFlag === "disabled" || enablementFlag === "off") return;

  const ga4MeasurementId =
    document.querySelector('meta[name="google-analytics-measurement-id"]')?.getAttribute("content")?.trim() ||
    "";
  const googleAdsTagId =
    document.querySelector('meta[name="google-ads-tag-id"]')?.getAttribute("content")?.trim() || "";

  const hasGa4 = /^G-[A-Z0-9]+$/i.test(ga4MeasurementId);
  const hasGoogleAds = /^AW-[0-9]+$/i.test(googleAdsTagId);
  if (!hasGa4 && !hasGoogleAds) return;

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;

  gtag("js", new Date());
  gtag("set", "allow_ad_personalization_signals", false);
  if (hasGoogleAds) gtag("config", googleAdsTagId);
  if (hasGa4) gtag("config", ga4MeasurementId);

  window.__siteAnalyticsGtagReady = true;
})();
