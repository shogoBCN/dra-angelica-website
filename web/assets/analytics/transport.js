/** @type {Array<{ name: string; params: Record<string, unknown> }>} */
const eventQueue = [];

let gtagReady = false;

export function markGtagReady() {
  gtagReady = true;
  while (eventQueue.length > 0) {
    const queued = eventQueue.shift();
    if (queued) dispatchEvent(queued.name, queued.params);
  }
}

/**
 * @param {string} name
 * @param {Record<string, unknown>} [params]
 */
function dispatchEvent(name, params) {
  if (typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}

/**
 * @param {string} name
 * @param {Record<string, unknown>} [params]
 */
export function trackEvent(name, params = {}) {
  const payload = {
    ...params,
    page_path: params.page_path ?? `${window.location.pathname}${window.location.search}`,
    page_title: params.page_title ?? document.title,
  };

  if (gtagReady && typeof window.gtag === "function") {
    dispatchEvent(name, payload);
  } else {
    eventQueue.push({ name, params: payload });
  }
}

/** @param {string} sendTo */
export function trackGoogleAdsConversion(sendTo) {
  if (typeof window.gtag !== "function") return;
  window.gtag("event", "conversion", { send_to: sendTo });
}
