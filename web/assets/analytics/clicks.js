import { getAttributionParams } from "./attribution.js";
import { trackEvent } from "./transport.js";

const INTERACTIVE_SELECTOR =
  "a[href], button, [role='button'], input[type='submit'], input[type='button'], summary";

/**
 * @param {Element} element
 * @returns {string}
 */
function nearestSectionId(element) {
  const container = element.closest(
    "section[id], header[id], footer[id], main[id], [data-analytics-section]"
  );
  if (!container) return "";
  if (container.id) return container.id;
  return container.getAttribute("data-analytics-section") || "";
}

/**
 * @param {Element} element
 * @returns {string}
 */
function elementLabel(element) {
  const explicit =
    element.getAttribute("data-analytics-label") || element.getAttribute("aria-label");
  if (explicit?.trim()) return explicit.trim().slice(0, 100);
  if (element.id) return `#${element.id}`;
  const text = (element.textContent || "").replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 100);
  if (element instanceof HTMLAnchorElement && element.href) return element.href;
  return element.tagName.toLowerCase();
}

/**
 * @param {string} href
 * @returns {string}
 */
function linkType(href) {
  if (!href) return "none";
  if (href.startsWith("#")) return "anchor";
  if (href.startsWith("mailto:")) return "email";
  if (href.startsWith("tel:") || href.includes("wa.me")) return "phone_or_whatsapp";
  try {
    const url = new URL(href, window.location.origin);
    if (url.origin === window.location.origin) return "internal";
    return "external";
  } catch {
    return "unknown";
  }
}

export function initClickTracking() {
  document.addEventListener(
    "click",
    (event) => {
      if (!(event.target instanceof Element)) return;

      const interactive = event.target.closest(INTERACTIVE_SELECTOR);
      if (!interactive) return;
      if (interactive.closest("[data-analytics-ignore]")) return;
      if (interactive.hasAttribute("data-analytics-ignore")) return;

      const href =
        interactive instanceof HTMLAnchorElement ? interactive.getAttribute("href") || "" : "";

      trackEvent("element_click", {
        ...getAttributionParams(),
        click_element: interactive.tagName.toLowerCase(),
        click_label: elementLabel(interactive),
        click_href: href.slice(0, 500),
        click_link_type: linkType(href),
        click_section: nearestSectionId(interactive),
        click_classes: String(interactive.className || "").slice(0, 120),
      });
    },
    { capture: true }
  );
}
