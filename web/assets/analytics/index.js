/**
 * Frontend analytics for medicina-familiar.co.
 *
 * Sends GA4 / Google Ads events via gtag when meta tags are present:
 *   google-analytics-measurement-id, google-ads-tag-id
 *
 * Tracks: traffic source (UTM + referrer), clicks, scroll depth, section time,
 * active engagement, and page exit duration.
 */
import { captureAttribution, getAttributionParams, reportSessionStart } from "./attribution.js";
import { initClickTracking } from "./clicks.js";
import { GOOGLE_ADS_CONTACT_CONVERSION, readConfig } from "./config.js";
import { initEngagementTracking } from "./engagement.js";
import { initGtag } from "./gtag-loader.js";
import { markGtagReady, trackEvent, trackGoogleAdsConversion } from "./transport.js";

function initSiteAnalytics() {
  const config = readConfig();
  if (!config.enabled) return;

  initGtag(config);
  markGtagReady();

  const attribution = captureAttribution();
  reportSessionStart(attribution);

  initClickTracking();
  initEngagementTracking();
}

initSiteAnalytics();

window.SiteAnalytics = {
  trackEvent,
  trackGoogleAdsConversion: () => trackGoogleAdsConversion(GOOGLE_ADS_CONTACT_CONVERSION),
  getAttribution: getAttributionParams,
};
