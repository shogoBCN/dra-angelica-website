/** @typedef {{ enabled: boolean; hasGa: boolean; hasAds: boolean; measurementId: string; adsTagId: string }} AnalyticsConfig */

export const STORAGE_KEYS = Object.freeze({
  attribution: "site_analytics_attribution",
  sessionStart: "site_analytics_session_start",
});

export const GOOGLE_ADS_CONTACT_CONVERSION = "AW-18163846421/UgqsCN7-1bIcEJWamdVD";

export const SCROLL_MILESTONES = Object.freeze([25, 50, 75, 90, 100]);
export const ENGAGEMENT_HEARTBEAT_MS = 30_000;

/** @returns {AnalyticsConfig} */
export function readConfig() {
  const gaMeta = document.querySelector('meta[name="google-analytics-measurement-id"]');
  const adsMeta = document.querySelector('meta[name="google-ads-tag-id"]');
  const enabledMeta = document.querySelector('meta[name="site-analytics"]');

  const measurementId = gaMeta?.getAttribute("content")?.trim() || "";
  const adsTagId = adsMeta?.getAttribute("content")?.trim() || "";
  const hasGa = /^G-[A-Z0-9]+$/i.test(measurementId);
  const hasAds = /^AW-[0-9]+$/i.test(adsTagId);

  const explicit = enabledMeta?.getAttribute("content")?.trim().toLowerCase();
  if (explicit === "disabled" || explicit === "off") {
    return { enabled: false, hasGa: false, hasAds: false, measurementId: "", adsTagId: "" };
  }

  return {
    enabled: hasGa || hasAds,
    hasGa,
    hasAds,
    measurementId,
    adsTagId,
  };
}
