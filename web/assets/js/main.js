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
 *  - Mis servicios: tarjetas interactivas con volteo (título ↔ detalle)
 *  - Landing carousel (#inicio): avance automático lento
 *  - FAQ: acordeón (solo un `<details>` abierto a la vez)
 *  - Analytics hooks via window.SiteAnalytics (loaded from assets/analytics/)
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

/** Interval between promo carousel slides (ms). */
const PROMO_CAROUSEL_AUTO_ADVANCE_MS = 8000;

/** Shown inline when AJAX returns non-success JSON without a usable `message` from the provider. */
const CONTACT_FORM_GENERIC_ERROR_VISIBLE_ES =
  "No se pudo enviar el mensaje. Comprueba tu conexión e inténtalo de nuevo.";

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
          window.SiteAnalytics?.trackContactFormConversion?.();
          window.SiteAnalytics?.trackEvent?.("form_submit", {
            form_name: "contact",
            form_result: "success",
          });
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

/** Matches `scroll-padding-top` on `<html>` (fixed header clearance for hash targets). */
function getNavAnchorOffsetPx() {
  const scrollPaddingTop = parseFloat(
    getComputedStyle(document.documentElement).scrollPaddingTop,
  );
  return Number.isFinite(scrollPaddingTop) && scrollPaddingTop > 0
    ? scrollPaddingTop
    : 80;
}

/**
 * Picks the last nav section whose top has crossed the anchor line (below the header).
 * At the page bottom, always selects the final section so short footers still highlight Contacto.
 *
 * @returns {string}
 */
function resolveActiveNavSectionId() {
  const anchorY = getNavAnchorOffsetPx();
  let activeSectionId = MAIN_NAV_SECTION_IDS[0];

  for (const sectionId of MAIN_NAV_SECTION_IDS) {
    const sectionElement = document.getElementById(sectionId);
    if (!sectionElement) continue;
    if (sectionElement.getBoundingClientRect().top <= anchorY + 4) {
      activeSectionId = sectionId;
    }
  }

  const scrollingRoot = document.documentElement;
  const atPageBottom =
    window.innerHeight + scrollingRoot.scrollTop >= scrollingRoot.scrollHeight - 2;
  if (atPageBottom) {
    activeSectionId = MAIN_NAV_SECTION_IDS[MAIN_NAV_SECTION_IDS.length - 1];
  }

  return activeSectionId;
}

/**
 * @param {NodeListOf<HTMLAnchorElement> | HTMLAnchorElement[]} sectionAnchorLinks
 */
function syncActiveNavigationFromScroll(sectionAnchorLinks) {
  updateActiveNavigationState(
    resolveActiveNavSectionId(),
    sectionAnchorLinks,
  );
}

/**
 * Scroll-spy + hash navigation for `[data-section-link]` anchors.
 *
 * @param {NodeListOf<HTMLAnchorElement> | HTMLAnchorElement[]} sectionAnchorLinks
 */
function initNavigationScrollSpy(sectionAnchorLinks) {
  if (sectionAnchorLinks.length === 0) return;

  let scrollSpyAnimationFrame = 0;
  const scheduleScrollSpySync = () => {
    if (scrollSpyAnimationFrame) return;
    scrollSpyAnimationFrame = window.requestAnimationFrame(() => {
      scrollSpyAnimationFrame = 0;
      syncActiveNavigationFromScroll(sectionAnchorLinks);
    });
  };

  sectionAnchorLinks.forEach((anchorLink) => {
    anchorLink.addEventListener("click", () => {
      const targetSectionId = (anchorLink.getAttribute("href") || "").replace(/^#/, "");
      if (targetSectionId) {
        updateActiveNavigationState(targetSectionId, sectionAnchorLinks);
      }
      scheduleScrollSpySync();
    });
  });

  window.addEventListener("hashchange", scheduleScrollSpySync);
  window.addEventListener("scroll", scheduleScrollSpySync, { passive: true });
  scheduleScrollSpySync();
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

/** Toggle flip cards en Mis servicios (título ↔ texto completo). */
function initServiceFlipCards() {
  document.querySelectorAll("[data-card-flip]").forEach((flipControlElement) => {
    if (!(flipControlElement instanceof HTMLButtonElement)) return;
    flipControlElement.addEventListener("click", () => {
      const expandedCurrently =
        flipControlElement.getAttribute("aria-expanded") === "true";
      flipControlElement.setAttribute(
        "aria-expanded",
        expandedCurrently ? "false" : "true",
      );
    });
  });
}

/**
 * Landing carousel (#inicio). Auto-advances slowly; pauses on hover/focus
 * and when the tab is hidden. Respects prefers-reduced-motion (manual controls only).
 */
function initPromoCarousel() {
  const carouselRoot = document.querySelector("[data-carousel]");
  if (!carouselRoot) return;

  const slideElements = [...carouselRoot.querySelectorAll(".promo-carousel__slide")];
  const dotButtons = [...carouselRoot.querySelectorAll("[data-carousel-dot]")];
  const previousButton = carouselRoot.querySelector("[data-carousel-prev]");
  const nextButton = carouselRoot.querySelector("[data-carousel-next]");
  if (slideElements.length <= 1) return;

  let activeIndex = slideElements.findIndex((slide) =>
    slide.classList.contains("is-active"),
  );
  if (activeIndex < 0) activeIndex = 0;

  let advanceTimerId = null;
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  function goToSlide(nextIndex) {
    const normalizedIndex =
      ((nextIndex % slideElements.length) + slideElements.length) %
      slideElements.length;

    slideElements.forEach((slide, slideIndex) => {
      const isActive = slideIndex === normalizedIndex;
      slide.classList.toggle("is-active", isActive);
      slide.setAttribute("aria-hidden", isActive ? "false" : "true");
      slide.setAttribute(
        "aria-label",
        `${slideIndex + 1} de ${slideElements.length}`,
      );
    });

    dotButtons.forEach((dot, dotIndex) => {
      const isActive = dotIndex === normalizedIndex;
      dot.classList.toggle("is-active", isActive);
      dot.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    activeIndex = normalizedIndex;
  }

  function advanceToNextSlide() {
    goToSlide(activeIndex + 1);
  }

  function advanceToPreviousSlide() {
    goToSlide(activeIndex - 1);
  }

  function startAutoplay() {
    if (reducedMotionQuery.matches) return;
    stopAutoplay();
    advanceTimerId = window.setInterval(
      advanceToNextSlide,
      PROMO_CAROUSEL_AUTO_ADVANCE_MS,
    );
  }

  function stopAutoplay() {
    if (advanceTimerId !== null) {
      window.clearInterval(advanceTimerId);
      advanceTimerId = null;
    }
  }

  dotButtons.forEach((dot, dotIndex) => {
    dot.addEventListener("click", () => {
      goToSlide(dotIndex);
      startAutoplay();
    });
  });

  if (previousButton instanceof HTMLButtonElement) {
    previousButton.addEventListener("click", () => {
      advanceToPreviousSlide();
      startAutoplay();
    });
  }

  if (nextButton instanceof HTMLButtonElement) {
    nextButton.addEventListener("click", () => {
      advanceToNextSlide();
      startAutoplay();
    });
  }

  carouselRoot.addEventListener("mouseenter", stopAutoplay);
  carouselRoot.addEventListener("mouseleave", startAutoplay);
  carouselRoot.addEventListener("focusin", stopAutoplay);
  carouselRoot.addEventListener("focusout", (focusEvent) => {
    if (!carouselRoot.contains(focusEvent.relatedTarget)) {
      startAutoplay();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopAutoplay();
    } else {
      startAutoplay();
    }
  });

  reducedMotionQuery.addEventListener("change", () => {
    if (reducedMotionQuery.matches) {
      stopAutoplay();
    } else {
      startAutoplay();
    }
  });

  startAutoplay();
}

/**
 * Keeps the preguntas frecuentes list compact: opening one `<details>` closes the others.
 */
function initFaqAccordion() {
  const faqRoot = document.querySelector("#preguntas-frecuentes .faq");
  if (!faqRoot) return;

  const detailElements = faqRoot.querySelectorAll("details.faq__item");
  if (detailElements.length <= 1) return;

  detailElements.forEach((detailsElement) => {
    detailsElement.addEventListener("toggle", () => {
      if (!detailsElement.open) return;
      detailElements.forEach((otherDetails) => {
        if (otherDetails !== detailsElement) otherDetails.open = false;
      });
    });
  });
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

  initNavigationScrollSpy(sectionAnchorLinks);

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

  initServiceFlipCards();
  initPromoCarousel();
  initFaqAccordion();

  createInfotipController();
}

init();
