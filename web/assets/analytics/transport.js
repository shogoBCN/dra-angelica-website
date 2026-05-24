/**
 * Thin wrapper around window.gtag for custom events.
 *
 * Events fired before gtag is initialised are queued and flushed once
 * markGtagReady() runs (see index.js).
 */

/** @type {Array<{ eventName: string; eventParams: Record<string, unknown> }>} */
const pendingEventsQueue = [];

let isGtagReady = false;

/** Call after initGtag() so queued events are sent. */
export function markGtagReady() {
  isGtagReady = true;
  while (pendingEventsQueue.length > 0) {
    const queuedEvent = pendingEventsQueue.shift();
    if (queuedEvent) sendEventToGtag(queuedEvent.eventName, queuedEvent.eventParams);
  }
}

/**
 * @param {string} eventName GA4 event name (snake_case).
 * @param {Record<string, unknown>} eventParams
 */
function sendEventToGtag(eventName, eventParams) {
  if (typeof window.gtag !== "function") return;
  window.gtag("event", eventName, eventParams);
}

/**
 * Sends a custom event to GA4 (and Google Ads when linked).
 * Automatically attaches page_path and page_title unless overridden.
 *
 * @param {string} eventName
 * @param {Record<string, unknown>} [eventParams]
 */
export function trackEvent(eventName, eventParams = {}) {
  const payloadWithPageContext = {
    ...eventParams,
    page_path:
      eventParams.page_path ?? `${window.location.pathname}${window.location.search}`,
    page_title: eventParams.page_title ?? document.title,
  };

  if (isGtagReady && typeof window.gtag === "function") {
    sendEventToGtag(eventName, payloadWithPageContext);
  } else {
    pendingEventsQueue.push({ eventName, eventParams: payloadWithPageContext });
  }
}

/**
 * Fires a Google Ads conversion (separate from GA4 custom events).
 * @param {string} conversionSendTo Format AW-XXXXXXXX/label
 */
export function trackGoogleAdsConversion(conversionSendTo) {
  if (typeof window.gtag !== "function") return;
  window.gtag("event", "conversion", { send_to: conversionSendTo });
}
