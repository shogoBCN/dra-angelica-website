/**
 * Delegated click tracking for interactive elements.
 *
 * One capture-phase listener on document; ignores elements inside
 * [data-analytics-ignore]. Emits GA4 event: element_click.
 */

import { getSessionAttributionParams } from "./attribution.js";
import {
  fireGoogleAdsConversion,
  resolveClickConversion,
} from "./conversions.js";
import { trackEvent } from "./transport.js";

/** GA4 event name for link/button clicks. */
export const CLICK_EVENT_NAME = "element_click";

/** CSS selector for elements that receive click tracking. */
const INTERACTIVE_ELEMENT_SELECTOR =
  "a[href], button, [role='button'], input[type='submit'], input[type='button'], summary";

/** Values for click_link_type parameter. */
const LINK_TYPES = Object.freeze({
  none: "none",
  anchor: "anchor",
  email: "email",
  phoneOrWhatsapp: "phone_or_whatsapp",
  internal: "internal",
  external: "external",
  unknown: "unknown",
});

const MAX_LABEL_LENGTH = 100;
const MAX_HREF_LENGTH = 500;
const MAX_CLASSES_LENGTH = 120;

/**
 * Nearest section or landmark id for click context.
 * @param {Element} clickedElement
 * @returns {string}
 */
function findNearestSectionId(clickedElement) {
  const sectionContainer = clickedElement.closest(
    "section[id], header[id], footer[id], main[id], [data-analytics-section]"
  );
  if (!sectionContainer) return "";
  if (sectionContainer.id) return sectionContainer.id;
  return sectionContainer.getAttribute("data-analytics-section") || "";
}

/**
 * Human-readable label: data-analytics-label > aria-label > id > text > href.
 * @param {Element} clickedElement
 * @returns {string}
 */
function buildClickLabel(clickedElement) {
  const explicitLabel =
    clickedElement.getAttribute("data-analytics-label") ||
    clickedElement.getAttribute("aria-label");
  if (explicitLabel?.trim()) return explicitLabel.trim().slice(0, MAX_LABEL_LENGTH);

  if (clickedElement.id) return `#${clickedElement.id}`;

  const visibleText = (clickedElement.textContent || "").replace(/\s+/g, " ").trim();
  if (visibleText) return visibleText.slice(0, MAX_LABEL_LENGTH);

  if (clickedElement instanceof HTMLAnchorElement && clickedElement.href) {
    return clickedElement.href;
  }

  return clickedElement.tagName.toLowerCase();
}

/**
 * @param {string} href
 * @returns {string}
 */
function classifyClickLinkType(href) {
  if (!href) return LINK_TYPES.none;
  if (href.startsWith("#")) return LINK_TYPES.anchor;
  if (href.startsWith("mailto:")) return LINK_TYPES.email;
  if (href.startsWith("tel:") || href.includes("wa.me")) return LINK_TYPES.phoneOrWhatsapp;

  try {
    const resolvedUrl = new URL(href, window.location.origin);
    if (resolvedUrl.origin === window.location.origin) return LINK_TYPES.internal;
    return LINK_TYPES.external;
  } catch {
    return LINK_TYPES.unknown;
  }
}

/** Registers document-level click tracking. Safe to call once per page. */
export function initClickTracking() {
  document.addEventListener(
    "click",
    (clickEvent) => {
      if (!(clickEvent.target instanceof Element)) return;

      const clickedInteractive = clickEvent.target.closest(INTERACTIVE_ELEMENT_SELECTOR);
      if (!clickedInteractive) return;
      if (clickedInteractive.closest("[data-analytics-ignore]")) return;
      if (clickedInteractive.hasAttribute("data-analytics-ignore")) return;

      const linkHref =
        clickedInteractive instanceof HTMLAnchorElement
          ? clickedInteractive.getAttribute("href") || ""
          : "";

      trackEvent(CLICK_EVENT_NAME, {
        ...getSessionAttributionParams(),
        click_element: clickedInteractive.tagName.toLowerCase(),
        click_label: buildClickLabel(clickedInteractive),
        click_href: linkHref.slice(0, MAX_HREF_LENGTH),
        click_link_type: classifyClickLinkType(linkHref),
        click_section: findNearestSectionId(clickedInteractive),
        click_classes: String(clickedInteractive.className || "").slice(0, MAX_CLASSES_LENGTH),
      });

      const conversionKey = resolveClickConversion(clickedInteractive, linkHref);
      if (conversionKey) {
        fireGoogleAdsConversion(conversionKey, { value: 1.0, currency: "COP" });
      }
    },
    { capture: true }
  );
}
