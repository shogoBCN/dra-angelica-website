import { ENGAGEMENT_HEARTBEAT_MS, SCROLL_MILESTONES } from "./config.js";
import { getAttributionParams } from "./attribution.js";
import { trackEvent } from "./transport.js";

export function initEngagementTracking() {
  const pageLoadMs = Date.now();
  const reachedScroll = new Set();
  let visibleMs = 0;
  let lastVisibleAt = document.visibilityState === "visible" ? Date.now() : null;

  /** @type {Map<string, { enteredAt: number | null; totalMs: number }>} */
  const sectionTimers = new Map();

  function flushVisibility() {
    if (lastVisibleAt === null) return;
    visibleMs += Date.now() - lastVisibleAt;
    lastVisibleAt = document.visibilityState === "visible" ? Date.now() : null;
  }

  /**
   * @param {string} reason
   */
  function sendEngagement(reason) {
    flushVisibility();
    trackEvent("page_engagement", {
      ...getAttributionParams(),
      engagement_reason: reason,
      engagement_seconds: Math.round(visibleMs / 1000),
      engagement_ms: visibleMs,
      time_on_page_seconds: Math.round((Date.now() - pageLoadMs) / 1000),
    });
  }

  function onScroll() {
    const doc = document.documentElement;
    const scrollTop = window.scrollY || doc.scrollTop;
    const scrollHeight = doc.scrollHeight - doc.clientHeight;
    if (scrollHeight <= 0) return;

    const percent = Math.min(100, Math.round((scrollTop / scrollHeight) * 100));
    for (const milestone of SCROLL_MILESTONES) {
      if (percent >= milestone && !reachedScroll.has(milestone)) {
        reachedScroll.add(milestone);
        trackEvent("scroll_depth", {
          ...getAttributionParams(),
          scroll_percent: milestone,
        });
      }
    }
  }

  const sections = document.querySelectorAll("section[id]");
  if (sections.length > 0 && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const sectionId = entry.target.id;
          if (!sectionId) continue;

          const timer = sectionTimers.get(sectionId) || { enteredAt: null, totalMs: 0 };

          if (entry.isIntersecting) {
            timer.enteredAt = Date.now();
          } else if (timer.enteredAt !== null) {
            timer.totalMs += Date.now() - timer.enteredAt;
            timer.enteredAt = null;
            trackEvent("section_view", {
              ...getAttributionParams(),
              section_id: sectionId,
              section_visible_seconds: Math.round(timer.totalMs / 1000),
            });
          }

          sectionTimers.set(sectionId, timer);
        }
      },
      { threshold: 0.35 }
    );

    sections.forEach((section) => observer.observe(section));
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      lastVisibleAt = Date.now();
      return;
    }
    flushVisibility();
  });

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const heartbeatId = window.setInterval(() => {
    if (document.visibilityState !== "visible") return;
    flushVisibility();
    lastVisibleAt = Date.now();
    trackEvent("engagement_heartbeat", {
      ...getAttributionParams(),
      engagement_seconds: Math.round(visibleMs / 1000),
    });
  }, ENGAGEMENT_HEARTBEAT_MS);

  window.addEventListener("pagehide", () => {
    window.clearInterval(heartbeatId);

    for (const [sectionId, timer] of sectionTimers.entries()) {
      if (timer.enteredAt === null) continue;
      timer.totalMs += Date.now() - timer.enteredAt;
      trackEvent("section_view", {
        ...getAttributionParams(),
        section_id: sectionId,
        section_visible_seconds: Math.round(timer.totalMs / 1000),
      });
    }

    sendEngagement("page_exit");
  });
}
