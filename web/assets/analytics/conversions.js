/**
 * Google Ads conversion dispatch.
 *
 * Each send_to value must match a conversion action created in Google Ads
 * (Goals → Conversions → New conversion action → Website → Event snippet).
 * Leave a label empty in config.js until the action exists in Ads.
 */

import {
  CONTENT_ENGAGED_MIN_ACTIVE_SECONDS,
  CONTENT_ENGAGED_MIN_SCROLL_PERCENT,
  GOOGLE_ADS_CONVERSIONS,
  SESSION_STORAGE_KEYS,
} from "./config.js";
import { trackEvent, trackGoogleAdsConversion } from "./transport.js";

/** @typedef {keyof typeof GOOGLE_ADS_CONVERSIONS} GoogleAdsConversionKey */

const CONVERSION_SEND_TO_PATTERN = /^AW-[0-9]+\/[A-Za-z0-9_-]+$/;

/** @type {GoogleAdsConversionKey[]} */
const ONCE_PER_SESSION_KEYS = ["contentEngaged"];

/**
 * @param {string} sendTo
 * @returns {boolean}
 */
function isConfiguredConversionSendTo(sendTo) {
  return CONVERSION_SEND_TO_PATTERN.test(sendTo.trim());
}

/**
 * @param {GoogleAdsConversionKey} conversionKey
 * @returns {boolean}
 */
function hasConversionFiredThisSession(conversionKey) {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEYS.adsConversionsFired);
    if (!raw) return false;
    const firedKeys = JSON.parse(raw);
    return Array.isArray(firedKeys) && firedKeys.includes(conversionKey);
  } catch {
    return false;
  }
}

/**
 * @param {GoogleAdsConversionKey} conversionKey
 */
function markConversionFiredThisSession(conversionKey) {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEYS.adsConversionsFired);
    const firedKeys = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(firedKeys)) return;
    if (!firedKeys.includes(conversionKey)) firedKeys.push(conversionKey);
    sessionStorage.setItem(
      SESSION_STORAGE_KEYS.adsConversionsFired,
      JSON.stringify(firedKeys)
    );
  } catch {
    // sessionStorage unavailable — still fire the conversion
  }
}

/**
 * @param {GoogleAdsConversionKey} conversionKey
 * @param {{ value?: number; currency?: string }} [options]
 * @returns {boolean} true when a conversion hit was sent
 */
export function fireGoogleAdsConversion(conversionKey, options = {}) {
  const sendTo = GOOGLE_ADS_CONVERSIONS[conversionKey];
  if (!isConfiguredConversionSendTo(sendTo)) return false;

  if (
    ONCE_PER_SESSION_KEYS.includes(conversionKey) &&
    hasConversionFiredThisSession(conversionKey)
  ) {
    return false;
  }

  trackGoogleAdsConversion(sendTo, options);
  if (ONCE_PER_SESSION_KEYS.includes(conversionKey)) {
    markConversionFiredThisSession(conversionKey);
  }
  return true;
}

/** @returns {boolean} */
export function trackContactFormConversion() {
  return fireGoogleAdsConversion("contactForm");
}

/**
 * @param {string} href
 * @returns {GoogleAdsConversionKey | null}
 */
export function classifyLeadClickConversion(href) {
  if (!href) return null;
  if (href.startsWith("mailto:")) return "emailClick";
  if (href.startsWith("tel:") || href.includes("wa.me")) return "whatsappClick";
  if (isGoogleMapsLink(href)) return "mapsOpen";
  return null;
}

/**
 * @param {string} href
 * @returns {boolean}
 */
export function isGoogleMapsLink(href) {
  try {
    const resolvedUrl = new URL(href, window.location.origin);
    const hostname = resolvedUrl.hostname.replace(/^www\./, "");
    if (hostname === "maps.google.com") return true;
    return hostname.endsWith("google.com") && resolvedUrl.pathname.startsWith("/maps");
  } catch {
    return href.includes("google.com/maps") || href.includes("maps.google.com");
  }
}

/**
 * Fires the content-engaged Ads conversion (once per session) plus a GA4 event.
 * Criteria: scroll ≥ CONTENT_ENGAGED_MIN_SCROLL_PERCENT and active visible time
 * ≥ CONTENT_ENGAGED_MIN_ACTIVE_SECONDS.
 *
 * @param {{ scrollPercent: number; activeVisibleSeconds: number }} engagementState
 * @returns {boolean}
 */
export function maybeTrackContentEngagedConversion(engagementState) {
  const { scrollPercent, activeVisibleSeconds } = engagementState;
  if (scrollPercent < CONTENT_ENGAGED_MIN_SCROLL_PERCENT) return false;
  if (activeVisibleSeconds < CONTENT_ENGAGED_MIN_ACTIVE_SECONDS) return false;
  if (hasConversionFiredThisSession("contentEngaged")) return false;

  trackEvent("content_engaged", {
    scroll_percent: scrollPercent,
    engagement_seconds: activeVisibleSeconds,
  });

  return fireGoogleAdsConversion("contentEngaged", { value: 2.0, currency: "COP" });
}
