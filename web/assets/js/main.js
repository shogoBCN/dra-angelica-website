/**
 * Site behaviour for medicina-familiar.co (single-page brochure).
 *
 * Responsibilities:
 *  - Footer year stamp
 *  - Contact form: progressive enhancement via FormSubmit JSON API when possible;
 *    falls back to a classic POST navigation when fetch or parsing fails
 *  - Mobile navigation (ARIA / body scroll lock)
 *  - Scroll progress indicator
 *  - Scroll-spy highlighting for primary nav anchors
 *  - Gentle “reveal on scroll” for section blocks (respects reduced-motion via CSS)
 *  - Inline “infotip” panels beside long-form copy (positioning on mobile/desktop)
 */

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

/** Section `#id`s that appear in the main nav and hero CTAs - order matches visual flow. */
const MAIN_NAV_SECTION_IDS = Object.freeze([
  "inicio",
  "sobre-mi",
  "medicina-familiar",
  "servicios",
  "preguntas-frecuentes",
  "contacto",
]);

/** Breakpoint reused for collapsing the horizontal nav behind the menu toggle. */
const COLLAPSED_NAV_MEDIA_QUERY = "(max-width: 1099px)";

/** Below this width infotips use fixed positioning and viewport clamping. */
const INFOTIP_MOBILE_MEDIA_QUERY = "(max-width: 639px)";

/** Shown inline when AJAX returns non-success JSON without a usable `message` from the provider. */
const CONTACT_FORM_GENERIC_ERROR_VISIBLE_ES =
  "No se pudo enviar el mensaje. Compruebe su conexión e inténtelo de nuevo.";

/** FormSubmit AJAX path segment after the domain (email id or token string). */
function formsubmitAjaxPathFromAction(formActionAttribute) {
  if (!formActionAttribute) return "";
  const slug = formActionAttribute.split("formsubmit.co/").pop();
  return slug && slug !== formActionAttribute ? slug.trim() : "";
}

function setFooterYearCurrent() {
  const yearTarget = document.querySelector("[data-year]");
  if (yearTarget) {
    yearTarget.textContent = String(new Date().getFullYear());
  }
}

/**
 * @param {HTMLFormElement} formElement
 */
function navigateWithNativeFormPost(formElement) {
  HTMLFormElement.prototype.submit.call(formElement);
}

/**
 * Submits via FormSubmit’s JSON endpoint to avoid redirecting visitors to formsubmit.co.
 * CSP must include `connect-src https://formsubmit.co` (already set in index.html).
 *
 * Falls back to a normal navigational POST when the environment cannot reliably use fetch.
 *
 * @param {HTMLFormElement} contactForm
 */
function attachContactFormHandler(contactForm) {
  const errorMessageParagraph = document.getElementById("contact-form-error");
  const confirmationParagraph = document.getElementById("contact-form-thanks");
  const submitButton = contactForm.querySelector(".contact-form__submit");

  contactForm.addEventListener("submit", (submitEvent) => {
    submitEvent.preventDefault();

    if (errorMessageParagraph) {
      errorMessageParagraph.hidden = true;
      errorMessageParagraph.textContent = "";
    }
    if (confirmationParagraph) {
      confirmationParagraph.hidden = true;
    }

    if (!contactForm.checkValidity()) {
      contactForm.reportValidity();
      return;
    }

    const formAttributesAction = contactForm.getAttribute("action") || "";

    /** JSON payload keys mirror POST field names exactly for FormSubmit. */
    const formFieldPayload = {};
    new FormData(contactForm).forEach((value, key) => {
      formFieldPayload[key] = value;
    });

    if (!globalThis.fetch) {
      navigateWithNativeFormPost(contactForm);
      return;
    }

    const ajaxPathSegment = formsubmitAjaxPathFromAction(formAttributesAction);
    if (!ajaxPathSegment) {
      navigateWithNativeFormPost(contactForm);
      return;
    }

    const formSubmitAjaxUrl = `https://formsubmit.co/ajax/${ajaxPathSegment}`;

    const setSubmitBusy = (isBusy) => {
      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = isBusy;
      }
    };

    setSubmitBusy(true);

    fetch(formSubmitAjaxUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(formFieldPayload),
    })
      .then(async (fetchResponse) => {
        /** FormSubmit replies with JSON bodies; malformed responses degrade gracefully. */
        let parsedJson = {};
        try {
          parsedJson = await fetchResponse.json();
        } catch {
          parsedJson = {};
        }
        return { okHttp: fetchResponse.ok, parsedJson };
      })
      .then(({ okHttp, parsedJson }) => {
        const serverSaysSuccess =
          parsedJson.success === true || parsedJson.success === "true";

        if (okHttp && serverSaysSuccess) {
          if (errorMessageParagraph) {
            errorMessageParagraph.hidden = true;
            errorMessageParagraph.textContent = "";
          }
          if (confirmationParagraph) {
            confirmationParagraph.hidden = false;
          }
          contactForm.reset();
          const contactSection = document.getElementById("contacto");
          if (contactSection) {
            requestAnimationFrame(() => {
              contactSection.scrollIntoView({ behavior: "smooth", block: "start" });
            });
          }
          return;
        }

        const messageFromServer =
          typeof parsedJson.message === "string" && parsedJson.message.trim().length > 0
            ? parsedJson.message
            : CONTACT_FORM_GENERIC_ERROR_VISIBLE_ES;

        if (errorMessageParagraph) {
          errorMessageParagraph.textContent = messageFromServer;
          errorMessageParagraph.hidden = false;
        }
      })
      .catch(() => {
        navigateWithNativeFormPost(contactForm);
      })
      .finally(() => {
        setSubmitBusy(false);
      });
  });
}

/**
 * Mirrors the collapsible navigation drawer into ARIA + body scroll-lock state.
 *
 * @param {boolean} isMenuExpanded
 * @param {Element | null} toggleButton `[data-menu-toggle]`
 * @param {Element | null} navPanel `[data-nav]` (styled as drawer on narrow viewports only)
 */
function setMobileMenuExpanded(isMenuExpanded, toggleButton, navPanel) {
  if (!toggleButton || !navPanel) return;
  navPanel.classList.toggle("is-open", isMenuExpanded);
  toggleButton.setAttribute("aria-expanded", isMenuExpanded ? "true" : "false");
  document.body.classList.toggle("nav-open", isMenuExpanded);
}

/**
 * Highlights the anchor that matches the nearest section scrolled into view.
 *
 * @param {string} sectionId DOM id without leading `#`.
 * @param {NodeListOf<HTMLAnchorElement> | HTMLAnchorElement[]} sectionAnchorLinks
 */
function updateActiveNavigationState(sectionId, sectionAnchorLinks) {
  sectionAnchorLinks.forEach((anchorLink) => {
    const hrefValue = anchorLink.getAttribute("href") || "";
    const hashWithoutPound = hrefValue.replace(/^#/, "");
    anchorLink.classList.toggle("is-active", hashWithoutPound === sectionId);
  });
}

/**
 * Tracks reading progress across the entire document (`html` scroll height minus viewport).
 *
 * @param {HTMLElement | null} progressBarTrack
 */
function createScrollProgressUpdater(progressBarTrack) {
  return () => {
    if (!progressBarTrack) return;
    const scrollingRoot = document.documentElement;
    const scrollDistanceFromTop =
      scrollingRoot.scrollTop || document.body.scrollTop;
    const totalScrollableHeight =
      scrollingRoot.scrollHeight - scrollingRoot.clientHeight;
    const scrollCompletenessApproximatePercent =
      totalScrollableHeight > 0
        ? (scrollDistanceFromTop / totalScrollableHeight) * 100
        : 0;
    const clampedPercentage = Math.min(
      100,
      Math.max(0, scrollCompletenessApproximatePercent),
    );
    progressBarTrack.style.width = `${clampedPercentage}%`;
  };
}

/**
 * Wires positioning for inline “infotip” footnotes (Hospital Clínic, CAP Casanova, …).
 *
 * CSS renders the panel invisible until hover/focus; this module only nudges geometry:
 *  - **Wide screens**: panel is `position: absolute` beside the trigger; we pick “open
 *    above” vs “below” from available viewport space and toggle `.infotip__panel--above`.
 *  - **Narrow screens**: panel is `position: fixed` full-width; JS sets `top` /
 *    `max-height` so it stays inside the (possibly zoomed) viewport.
 */
function createInfotipController() {
  /** Drops inline styles from a previous mobile layout so desktop CSS can own placement again. */
  function clearForcedPanelGeometry(panelElement) {
    panelElement.style.removeProperty("top");
    panelElement.style.removeProperty("bottom");
    panelElement.style.removeProperty("max-height");
  }

  function positionInfotipPanel(wrapElement) {
    const panelElement = wrapElement.querySelector(".infotip__panel");
    const triggerElement = wrapElement.querySelector(".infotip__trigger");
    if (!(panelElement instanceof HTMLElement) || !triggerElement) return;

    const isNarrowViewport = window.matchMedia(INFOTIP_MOBILE_MEDIA_QUERY).matches;

    if (!isNarrowViewport) {
      clearForcedPanelGeometry(panelElement);
      const spacerBetweenTriggerAndPanel = 7;
      const triggerBox = triggerElement.getBoundingClientRect();
      let panelHeightPx =
        panelElement.offsetHeight || panelElement.getBoundingClientRect().height;
      // While the panel is hidden, height can read ~0; assume a reasonable box so we still pick above/below.
      if (panelHeightPx < 40) {
        panelHeightPx = 200;
      }

      // Prefer visualViewport when the mobile browser chrome resizes the visible area.
      const visualViewportMaybe = window.visualViewport;
      const viewportHeightPx = visualViewportMaybe
        ? visualViewportMaybe.height
        : window.innerHeight;
      const spaceBelowTrigger =
        viewportHeightPx - triggerBox.bottom - spacerBetweenTriggerAndPanel;
      const spaceAboveTrigger = triggerBox.top - spacerBetweenTriggerAndPanel;

      let openAboveTrigger = false;
      if (
        spaceBelowTrigger < panelHeightPx &&
        spaceAboveTrigger > spaceBelowTrigger
      ) {
        openAboveTrigger = true;
      } else if (
        spaceBelowTrigger < panelHeightPx &&
        spaceAboveTrigger < panelHeightPx
      ) {
        // Neither side fully fits: choose the side that offers more usable space.
        openAboveTrigger = spaceAboveTrigger >= spaceBelowTrigger;
      }

      panelElement.classList.toggle("infotip__panel--above", openAboveTrigger);
      return;
    }

    /* --- Mobile fixed panel: anchor under the trigger, then clamp vertically --- */
    panelElement.classList.remove("infotip__panel--above");
    const mobileGapPx = 8;
    const triggerAfterLayout = triggerElement.getBoundingClientRect();
    const visualViewportMaybe = window.visualViewport;
    const viewportHeightPx = visualViewportMaybe
      ? visualViewportMaybe.height
      : window.innerHeight;
    const sidePaddingPx = 12;

    panelElement.style.bottom = "auto";
    let topCoordinatePx = triggerAfterLayout.bottom + mobileGapPx;
    panelElement.style.top = `${topCoordinatePx}px`;

    function clampInsideViewportVertically() {
      let boundingRect = panelElement.getBoundingClientRect();
      if (boundingRect.bottom > viewportHeightPx - sidePaddingPx) {
        const overflowPx =
          boundingRect.bottom - (viewportHeightPx - sidePaddingPx);
        topCoordinatePx = Math.max(sidePaddingPx, boundingRect.top - overflowPx);
        panelElement.style.top = `${topCoordinatePx}px`;
        boundingRect = panelElement.getBoundingClientRect();
      }
      if (boundingRect.top < sidePaddingPx) {
        panelElement.style.top = `${sidePaddingPx}px`;
        boundingRect = panelElement.getBoundingClientRect();
      }
      const usableMaxHeight = viewportHeightPx - sidePaddingPx - boundingRect.top;
      if (
        boundingRect.height > usableMaxHeight - 1 &&
        usableMaxHeight > 80
      ) {
        panelElement.style.maxHeight = `${Math.round(usableMaxHeight)}px`;
      } else {
        panelElement.style.removeProperty("max-height");
      }
    }

    // First frame: DOM may still be settling after the panel becomes visible; second frame: final measure.
    requestAnimationFrame(() => {
      clampInsideViewportVertically();
      requestAnimationFrame(clampInsideViewportVertically);
    });
  }

  /** True while the user is likely “inside” this infotip (mouse over wrap, or focus inside trigger/panel links). */
  function infotipHasPointerOrKeyboardFocus(wrapElement) {
    if (wrapElement.matches(":hover")) return true;
    const active = document.activeElement;
    return Boolean(active && wrapElement.contains(active));
  }

  /** Keep an open infotip aligned when the page or virtual keyboard moves the viewport. */
  function repositionOpenInfotips() {
    document.querySelectorAll(".infotip").forEach((wrap) => {
      if (infotipHasPointerOrKeyboardFocus(wrap)) {
        positionInfotipPanel(wrap);
      }
    });
  }

  document.querySelectorAll(".infotip").forEach((wrap) => {
    const triggerInside = wrap.querySelector(".infotip__trigger");
    wrap.addEventListener("mouseenter", () => {
      positionInfotipPanel(wrap);
    });
    wrap.addEventListener("focusin", () => {
      // Keyboard / tab focus: wait until focus and layout have settled before measuring.
      requestAnimationFrame(() => {
        positionInfotipPanel(wrap);
        requestAnimationFrame(() => {
          positionInfotipPanel(wrap);
        });
      });
    });
    if (triggerInside) {
      triggerInside.addEventListener("click", () => {
        requestAnimationFrame(() => {
          positionInfotipPanel(wrap);
        });
      });
    }
  });

  window.addEventListener("scroll", repositionOpenInfotips, { passive: true });
  window.addEventListener("resize", repositionOpenInfotips, { passive: true });
  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener("scroll", repositionOpenInfotips, { passive: true });
    vv.addEventListener("resize", repositionOpenInfotips, { passive: true });
  }
}

/**
 * Boots every interactive behaviour needed after the markup exists.
 * Loads with `defer`, so DOM querySelector calls are safe immediately.
 */
function init() {
  setFooterYearCurrent();

  const contactForm = document.querySelector(".contact-form");
  if (contactForm instanceof HTMLFormElement) {
    attachContactFormHandler(contactForm);
  }

  const headerMenuToggleButton = document.querySelector("[data-menu-toggle]");
  const headerNavigationPanel = document.querySelector("[data-nav]");
  const sectionAnchorLinks = document.querySelectorAll("[data-section-link]");
  const scrollProgressTrack = document.querySelector(".scroll-progress");
  const revealTargets = document.querySelectorAll("[data-reveal]");
  const supportsIntersectionObserver = "IntersectionObserver" in window;

  // Top-of-page gradient bar reflecting overall scroll depth.
  const updateProgressBarWidth = createScrollProgressUpdater(scrollProgressTrack);
  window.addEventListener("scroll", updateProgressBarWidth, { passive: true });
  updateProgressBarWidth();

  if (headerMenuToggleButton && headerNavigationPanel) {
    headerMenuToggleButton.addEventListener("click", () => {
      const willOpen = !headerNavigationPanel.classList.contains("is-open");
      setMobileMenuExpanded(
        willOpen,
        headerMenuToggleButton,
        headerNavigationPanel,
      );
    });

    document.addEventListener("keydown", (keyboardEvent) => {
      if (keyboardEvent.key === "Escape") {
        setMobileMenuExpanded(false, headerMenuToggleButton, headerNavigationPanel);
      }
    });

    // Collapse the drawer after in-page navigation on phone-sized layouts only.
    headerNavigationPanel.querySelectorAll("a").forEach((navigationLink) => {
      navigationLink.addEventListener("click", () => {
        const collapsedDrawerQuery = window.matchMedia(COLLAPSED_NAV_MEDIA_QUERY);
        if (collapsedDrawerQuery.matches) {
          setMobileMenuExpanded(false, headerMenuToggleButton, headerNavigationPanel);
        }
      });
    });
  }

  if (supportsIntersectionObserver) {
    const sectionIntersectionObserver = new IntersectionObserver(
      (observerEntries) => {
        observerEntries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0) {
            updateActiveNavigationState(entry.target.id, sectionAnchorLinks);
          }
        });
      },
      {
        root: null,
        /** Biases spy state toward whichever block crosses the geometric “reading line”. */
        rootMargin: "-42% 0px -48% 0px",
        threshold: [0, 0.08, 0.2],
      },
    );

    MAIN_NAV_SECTION_IDS.forEach((sectionDomId) => {
      const sectionElement = document.getElementById(sectionDomId);
      if (sectionElement) {
        sectionIntersectionObserver.observe(sectionElement);
      }
    });
  }

  if (supportsIntersectionObserver && revealTargets.length > 0) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
          }
        });
      },
      { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.1 },
    );

    revealTargets.forEach((revealEl) => {
      revealObserver.observe(revealEl);
    });
  } else {
    // No observer API (very old browsers): show content immediately instead of leaving it invisible.
    revealTargets.forEach((revealEl) => {
      revealEl.classList.add("is-visible");
    });
  }

  if (!supportsIntersectionObserver && MAIN_NAV_SECTION_IDS.length > 0) {
    updateActiveNavigationState("inicio", sectionAnchorLinks);
  }

  createInfotipController();
}

init();
