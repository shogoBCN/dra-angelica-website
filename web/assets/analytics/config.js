/**
 * Analytics configuration read from HTML meta tags.
 *
 * Enablement requires at least one valid tag ID meta:
 *   - google-analytics-measurement-id  (GA4, format G-XXXXXXXX)
 *   - google-ads-tag-id                (Google Ads, format AW-XXXXXXXX)
 *
 * Optional kill switch per page:
 *   <meta name="site-analytics" content="disabled">
 */

/** @typedef {{ enabled: boolean; hasGa4: boolean; hasGoogleAds: boolean; ga4MeasurementId: string; googleAdsTagId: string }} SiteAnalyticsConfig */

/** sessionStorage keys (first-touch attribution for the browser tab session). */
export const SESSION_STORAGE_KEYS = Object.freeze({
  attributionSnapshot: "site_analytics_attribution",
  sessionStartedAtMs: "site_analytics_session_start",
  adsConversionsFired: "site_analytics_ads_conversions_fired",
});

/**
 * Google Ads conversion labels (AW-ACCOUNT_ID/LABEL).
 * Create each action in Google Ads → Goals → Conversions, then paste the label here.
 * Leave empty until configured — empty labels are skipped safely.
 */
export const GOOGLE_ADS_CONVERSIONS = Object.freeze({
  contactForm: "AW-18163846421/uMjmCIX_kLUcEJWamdVD",
  whatsappClick: "AW-18163846421/MbyaCIj_kLUcEJWamdVD",
  emailClick: "AW-18163846421/V50SCIv_kLUcEJWamdVD",
  mapsOpen: "AW-18163846421/HdyJCI7_kLUcEJWamdVD",
  contentEngaged: "AW-18163846421/BJ2PCImAkbUcEJWamdVD",
  moreInfoClick: "AW-18163846421/r_jbCJy7or4cEJWamdVD"
});

/** @deprecated Use GOOGLE_ADS_CONVERSIONS.contactForm */
export const GOOGLE_ADS_CONTACT_FORM_CONVERSION = GOOGLE_ADS_CONVERSIONS.contactForm;

/** Default content-engaged thresholds (main site and pages without overrides). */
export const CONTENT_ENGAGED_DEFAULTS = Object.freeze({
  scrollPercent: 50,
  activeSeconds: 50,
});

/** @deprecated Use readContentEngagedThresholds() */
export const CONTENT_ENGAGED_MIN_SCROLL_PERCENT = CONTENT_ENGAGED_DEFAULTS.scrollPercent;

/** @deprecated Use readContentEngagedThresholds() */
export const CONTENT_ENGAGED_MIN_ACTIVE_SECONDS = CONTENT_ENGAGED_DEFAULTS.activeSeconds;

/**
 * Per-page content-engaged thresholds from optional meta tags:
 *   analytics-content-engaged-scroll  (1–100)
 *   analytics-content-engaged-seconds (positive integer)
 * @returns {{ scrollPercent: number; activeSeconds: number }}
 */
export function readContentEngagedThresholds() {
  const scrollMeta = document.querySelector('meta[name="analytics-content-engaged-scroll"]');
  const secondsMeta = document.querySelector('meta[name="analytics-content-engaged-seconds"]');

  const scrollRaw = Number.parseInt(scrollMeta?.getAttribute("content")?.trim() || "", 10);
  const secondsRaw = Number.parseInt(secondsMeta?.getAttribute("content")?.trim() || "", 10);

  return {
    scrollPercent:
      Number.isFinite(scrollRaw) && scrollRaw > 0 && scrollRaw <= 100
        ? scrollRaw
        : CONTENT_ENGAGED_DEFAULTS.scrollPercent,
    activeSeconds:
      Number.isFinite(secondsRaw) && secondsRaw > 0
        ? secondsRaw
        : CONTENT_ENGAGED_DEFAULTS.activeSeconds,
  };
}

/** Scroll-depth milestones (percent of page height) fired once per page view. */
export const SCROLL_DEPTH_MILESTONES_PERCENT = Object.freeze([25, 50, 75, 90, 100]);

/** Interval for active-time heartbeat events while the tab is visible. */
export const ACTIVE_TIME_HEARTBEAT_INTERVAL_MS = 30_000;

/** Fraction of a section that must be visible before timing starts (0–1). */
export const SECTION_VISIBILITY_THRESHOLD = 0.35;

const GA4_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/i;
const GOOGLE_ADS_TAG_ID_PATTERN = /^AW-[0-9]+$/i;

/**
 * Reads analytics IDs and enablement from document meta tags.
 * @returns {SiteAnalyticsConfig}
 */
export function readSiteAnalyticsConfig() {
  const ga4Meta = document.querySelector('meta[name="google-analytics-measurement-id"]');
  const googleAdsMeta = document.querySelector('meta[name="google-ads-tag-id"]');
  const enablementMeta = document.querySelector('meta[name="site-analytics"]');

  const ga4MeasurementId = ga4Meta?.getAttribute("content")?.trim() || "";
  const googleAdsTagId = googleAdsMeta?.getAttribute("content")?.trim() || "";
  const hasGa4 = GA4_MEASUREMENT_ID_PATTERN.test(ga4MeasurementId);
  const hasGoogleAds = GOOGLE_ADS_TAG_ID_PATTERN.test(googleAdsTagId);

  const enablementFlag = enablementMeta?.getAttribute("content")?.trim().toLowerCase();
  if (enablementFlag === "disabled" || enablementFlag === "off") {
    return {
      enabled: false,
      hasGa4: false,
      hasGoogleAds: false,
      ga4MeasurementId: "",
      googleAdsTagId: "",
    };
  }

  return {
    enabled: hasGa4 || hasGoogleAds,
    hasGa4,
    hasGoogleAds,
    ga4MeasurementId,
    googleAdsTagId,
  };
}
