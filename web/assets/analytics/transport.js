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
 * Meta Pixel standard event (PageView is fired from pixel-init.js).
 * @param {string} eventName
 * @param {Record<string, unknown>} [eventParams]
 */
export function trackMetaPixelEvent(eventName, eventParams) {
  if (typeof window.fbq !== "function") return;
  if (eventParams && Object.keys(eventParams).length > 0) {
    window.fbq("track", eventName, eventParams);
    return;
  }
  window.fbq("track", eventName);
}

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
 * @param {{ value?: number; currency?: string }} [options]
 */
export function trackGoogleAdsConversion(conversionSendTo, options = {}) {
  if (typeof window.gtag !== "function") return;
  const payload = {
    send_to: conversionSendTo,
    transport_type: "beacon",
  };
  if (typeof options.value === "number") payload.value = options.value;
  if (options.currency) payload.currency = options.currency;
  window.gtag("event", "conversion", payload);
}
