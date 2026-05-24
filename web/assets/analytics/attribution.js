/**
 * First-touch traffic attribution for the browser tab session.
 *
 * Captures UTM parameters, document.referrer, and landing page once per session
 * (sessionStorage). Subsequent page views in the same tab reuse the snapshot and
 * attach it to click / engagement events.
 */

import { SESSION_STORAGE_KEYS } from "./config.js";
import { trackEvent } from "./transport.js";

/** Standard UTM query parameters read from the landing URL. */
const UTM_QUERY_PARAM_NAMES = Object.freeze([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
]);

/** Values for the referrer_type event parameter. */
export const REFERRER_TYPES = Object.freeze({
  direct: "direct",
  internal: "internal",
  search: "search",
  social: "social",
  referral: "referral",
  unknown: "unknown",
});

/** @returns {Record<string, string>} */
function parseUtmParamsFromCurrentUrl() {
  const urlSearchParams = new URLSearchParams(window.location.search);
  /** @type {Record<string, string>} */
  const utmParams = {};
  for (const paramName of UTM_QUERY_PARAM_NAMES) {
    const paramValue = urlSearchParams.get(paramName);
    if (paramValue) utmParams[paramName] = paramValue;
  }
  return utmParams;
}

/**
 * Classifies document.referrer for reporting.
 * @param {string} referrerUrl
 * @returns {{ referrerType: string; referrerHost: string }}
 */
function classifyReferrerUrl(referrerUrl) {
  if (!referrerUrl) {
    return { referrerType: REFERRER_TYPES.direct, referrerHost: "" };
  }

  try {
    const parsedReferrer = new URL(referrerUrl);
    if (parsedReferrer.hostname === window.location.hostname) {
      return { referrerType: REFERRER_TYPES.internal, referrerHost: parsedReferrer.hostname };
    }

    const normalizedHost = parsedReferrer.hostname.replace(/^www\./, "");
    if (/google\./.test(normalizedHost)) {
      return { referrerType: REFERRER_TYPES.search, referrerHost: normalizedHost };
    }
    if (/facebook|instagram|twitter|x\.com|linkedin|tiktok/.test(normalizedHost)) {
      return { referrerType: REFERRER_TYPES.social, referrerHost: normalizedHost };
    }
    return { referrerType: REFERRER_TYPES.referral, referrerHost: normalizedHost };
  } catch {
    return { referrerType: REFERRER_TYPES.unknown, referrerHost: "" };
  }
}

/**
 * Captures or restores the session attribution snapshot.
 * @returns {Record<string, string>}
 */
export function captureSessionAttribution() {
  const storedSnapshotJson = sessionStorage.getItem(SESSION_STORAGE_KEYS.attributionSnapshot);
  if (storedSnapshotJson) {
    try {
      return JSON.parse(storedSnapshotJson);
    } catch {
      // Fall through and re-capture when stored JSON is corrupt.
    }
  }

  const utmParams = parseUtmParamsFromCurrentUrl();
  const referrerUrl = document.referrer || "";
  const { referrerType, referrerHost } = classifyReferrerUrl(referrerUrl);
  const landingPagePath = `${window.location.pathname}${window.location.search}`;

  /** @type {Record<string, string>} */
  const attributionSnapshot = {
    landing_page: landingPagePath,
    page_referrer: referrerUrl,
    referrer_type: referrerType,
    referrer_host: referrerHost,
    utm_source: utmParams.utm_source || "",
    utm_medium: utmParams.utm_medium || "",
    utm_campaign: utmParams.utm_campaign || "",
    utm_term: utmParams.utm_term || "",
    utm_content: utmParams.utm_content || "",
    captured_at: new Date().toISOString(),
  };

  sessionStorage.setItem(
    SESSION_STORAGE_KEYS.attributionSnapshot,
    JSON.stringify(attributionSnapshot)
  );

  if (!sessionStorage.getItem(SESSION_STORAGE_KEYS.sessionStartedAtMs)) {
    sessionStorage.setItem(SESSION_STORAGE_KEYS.sessionStartedAtMs, String(Date.now()));
  }

  return attributionSnapshot;
}

/**
 * Returns attribution fields suitable for spreading into event params.
 * Omits internal fields like captured_at.
 * @returns {Record<string, string>}
 */
export function getSessionAttributionParams() {
  const storedSnapshotJson = sessionStorage.getItem(SESSION_STORAGE_KEYS.attributionSnapshot);
  if (!storedSnapshotJson) return {};

  try {
    const snapshot = JSON.parse(storedSnapshotJson);
    return {
      landing_page: snapshot.landing_page || "",
      page_referrer: snapshot.page_referrer || "",
      referrer_type: snapshot.referrer_type || "",
      referrer_host: snapshot.referrer_host || "",
      utm_source: snapshot.utm_source || "",
      utm_medium: snapshot.utm_medium || "",
      utm_campaign: snapshot.utm_campaign || "",
      utm_term: snapshot.utm_term || "",
      utm_content: snapshot.utm_content || "",
    };
  } catch {
    return {};
  }
}

/**
 * Fires session_start with full attribution on each tracked page load.
 * @param {Record<string, string>} attributionSnapshot
 */
export function reportSessionStart(attributionSnapshot) {
  trackEvent("session_start", {
    ...attributionSnapshot,
    page_location: window.location.href,
  });
}
