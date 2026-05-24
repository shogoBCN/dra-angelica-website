import { STORAGE_KEYS } from "./config.js";
import { trackEvent } from "./transport.js";

const UTM_PARAMS = Object.freeze([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
]);

/** @returns {Record<string, string>} */
function parseUtmFromUrl() {
  const params = new URLSearchParams(window.location.search);
  /** @type {Record<string, string>} */
  const utm = {};
  for (const key of UTM_PARAMS) {
    const value = params.get(key);
    if (value) utm[key] = value;
  }
  return utm;
}

/**
 * @param {string} referrer
 * @returns {{ type: string; host: string }}
 */
function classifyReferrer(referrer) {
  if (!referrer) return { type: "direct", host: "" };
  try {
    const url = new URL(referrer);
    if (url.hostname === window.location.hostname) {
      return { type: "internal", host: url.hostname };
    }
    const host = url.hostname.replace(/^www\./, "");
    if (/google\./.test(host)) return { type: "search", host };
    if (/facebook|instagram|twitter|x\.com|linkedin|tiktok/.test(host)) {
      return { type: "social", host };
    }
    return { type: "referral", host };
  } catch {
    return { type: "unknown", host: "" };
  }
}

/** @returns {Record<string, string>} */
export function captureAttribution() {
  const stored = sessionStorage.getItem(STORAGE_KEYS.attribution);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // Re-capture below when stored JSON is invalid.
    }
  }

  const utm = parseUtmFromUrl();
  const referrer = document.referrer || "";
  const referrerInfo = classifyReferrer(referrer);
  const landingPage = `${window.location.pathname}${window.location.search}`;

  /** @type {Record<string, string>} */
  const attribution = {
    landing_page: landingPage,
    page_referrer: referrer,
    referrer_type: referrerInfo.type,
    referrer_host: referrerInfo.host,
    utm_source: utm.utm_source || "",
    utm_medium: utm.utm_medium || "",
    utm_campaign: utm.utm_campaign || "",
    utm_term: utm.utm_term || "",
    utm_content: utm.utm_content || "",
    captured_at: new Date().toISOString(),
  };

  sessionStorage.setItem(STORAGE_KEYS.attribution, JSON.stringify(attribution));
  if (!sessionStorage.getItem(STORAGE_KEYS.sessionStart)) {
    sessionStorage.setItem(STORAGE_KEYS.sessionStart, String(Date.now()));
  }
  return attribution;
}

/** @returns {Record<string, string>} */
export function getAttributionParams() {
  const stored = sessionStorage.getItem(STORAGE_KEYS.attribution);
  if (!stored) return {};
  try {
    const attribution = JSON.parse(stored);
    return {
      landing_page: attribution.landing_page || "",
      page_referrer: attribution.page_referrer || "",
      referrer_type: attribution.referrer_type || "",
      referrer_host: attribution.referrer_host || "",
      utm_source: attribution.utm_source || "",
      utm_medium: attribution.utm_medium || "",
      utm_campaign: attribution.utm_campaign || "",
      utm_term: attribution.utm_term || "",
      utm_content: attribution.utm_content || "",
    };
  } catch {
    return {};
  }
}

/** @param {Record<string, string>} attribution */
export function reportSessionStart(attribution) {
  trackEvent("session_start", {
    ...attribution,
    page_location: window.location.href,
  });
}
