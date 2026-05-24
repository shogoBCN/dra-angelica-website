/**
 * Site analytics entry point (medicina-familiar.co).
 *
 * Loaded as an ES module before main.js on public pages:
 *   <script type="module" src="/assets/analytics/index.js"></script>
 *
 * Module layout:
 *   config.js       — meta tag IDs, constants
 *   gtag-loader.js  — gtag.js bootstrap (GA4 + Google Ads)
 *   transport.js    — trackEvent / conversion helpers
 *   attribution.js  — UTM + referrer (sessionStorage)
 *   clicks.js       — element_click
 *   engagement.js   — scroll, sections, time on page
 *
 * Public API (for main.js and custom hooks):
 *   window.SiteAnalytics.trackEvent(name, params)
 *   window.SiteAnalytics.trackContactFormConversion()
 *   window.SiteAnalytics.getSessionAttribution()
 */
import {
  captureSessionAttribution,
  getSessionAttributionParams,
  reportSessionStart,
} from "./attribution.js";
import { initClickTracking } from "./clicks.js";
import {
  GOOGLE_ADS_CONTACT_FORM_CONVERSION,
  readSiteAnalyticsConfig,
} from "./config.js";
import { initEngagementTracking } from "./engagement.js";
import { initGtag } from "./gtag-loader.js";
import { markGtagReady, trackEvent, trackGoogleAdsConversion } from "./transport.js";

function bootstrapSiteAnalytics() {
  const siteConfig = readSiteAnalyticsConfig();
  if (!siteConfig.enabled) return;

  initGtag(siteConfig);
  markGtagReady();

  const attributionSnapshot = captureSessionAttribution();
  reportSessionStart(attributionSnapshot);

  initClickTracking();
  initEngagementTracking();
}

bootstrapSiteAnalytics();

/** @type {import("./index.js").SiteAnalyticsApi} */
window.SiteAnalytics = {
  trackEvent,
  trackContactFormConversion: () =>
    trackGoogleAdsConversion(GOOGLE_ADS_CONTACT_FORM_CONVERSION),
  getSessionAttribution: getSessionAttributionParams,
};

/**
 * @typedef {Object} SiteAnalyticsApi
 * @property {(eventName: string, eventParams?: Record<string, unknown>) => void} trackEvent
 * @property {() => void} trackContactFormConversion
 * @property {() => Record<string, string>} getSessionAttribution
 */
