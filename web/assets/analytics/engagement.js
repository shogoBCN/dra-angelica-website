/**
 * Scroll depth, section visibility time, and active engagement duration.
 *
 * Events:
 *   scroll_depth          — once per milestone (25/50/75/90/100 %)
 *   section_view          — when a section[id] leaves the viewport
 *   engagement_heartbeat  — every 30 s while tab is visible
 *   page_engagement       — on pagehide with total active visible time
 */

import {
  ACTIVE_TIME_HEARTBEAT_INTERVAL_MS,
  CONTENT_ENGAGED_MIN_SCROLL_PERCENT,
  SCROLL_DEPTH_MILESTONES_PERCENT,
  SECTION_VISIBILITY_THRESHOLD,
} from "./config.js";
import { getSessionAttributionParams } from "./attribution.js";
import { maybeTrackContentEngagedConversion } from "./conversions.js";
import { trackEvent } from "./transport.js";

export const ENGAGEMENT_EVENT_NAMES = Object.freeze({
  scrollDepth: "scroll_depth",
  sectionView: "section_view",
  heartbeat: "engagement_heartbeat",
  pageEngagement: "page_engagement",
});

/** Registers scroll, section, visibility, and exit tracking. */
export function initEngagementTracking() {
  const pageLoadTimestampMs = Date.now();
  /** @type {Set<number>} */
  const reachedScrollMilestones = new Set();
  let maxScrollPercentReached = 0;
  let totalActiveVisibleMs = 0;
  let lastVisibleTimestampMs =
    document.visibilityState === "visible" ? Date.now() : null;

  /** @type {Map<string, { sectionEnteredAtMs: number | null; totalVisibleMs: number }>} */
  const sectionVisibilityTimers = new Map();

  function accumulateVisibleTime() {
    if (lastVisibleTimestampMs === null) return;
    totalActiveVisibleMs += Date.now() - lastVisibleTimestampMs;
    lastVisibleTimestampMs =
      document.visibilityState === "visible" ? Date.now() : null;
  }

  /**
   * @param {string} exitReason
   */
  function reportPageEngagement(exitReason) {
    accumulateVisibleTime();
    trackEvent(ENGAGEMENT_EVENT_NAMES.pageEngagement, {
      ...getSessionAttributionParams(),
      engagement_reason: exitReason,
      engagement_seconds: Math.round(totalActiveVisibleMs / 1000),
      engagement_ms: totalActiveVisibleMs,
      time_on_page_seconds: Math.round((Date.now() - pageLoadTimestampMs) / 1000),
    });
  }

  function reportContentEngagementIfQualified() {
    maybeTrackContentEngagedConversion({
      scrollPercent: maxScrollPercentReached,
      activeVisibleSeconds: Math.round(totalActiveVisibleMs / 1000),
    });
  }

  function trackScrollDepthMilestones() {
    const documentElement = document.documentElement;
    const scrollOffsetPx = window.scrollY || documentElement.scrollTop;
    const scrollableHeightPx = documentElement.scrollHeight - documentElement.clientHeight;
    if (scrollableHeightPx <= 0) return;

    const scrollPercent = Math.min(
      100,
      Math.round((scrollOffsetPx / scrollableHeightPx) * 100)
    );
    maxScrollPercentReached = Math.max(maxScrollPercentReached, scrollPercent);

    for (const milestonePercent of SCROLL_DEPTH_MILESTONES_PERCENT) {
      if (scrollPercent >= milestonePercent && !reachedScrollMilestones.has(milestonePercent)) {
        reachedScrollMilestones.add(milestonePercent);
        trackEvent(ENGAGEMENT_EVENT_NAMES.scrollDepth, {
          ...getSessionAttributionParams(),
          scroll_percent: milestonePercent,
        });
        if (milestonePercent >= CONTENT_ENGAGED_MIN_SCROLL_PERCENT) {
          reportContentEngagementIfQualified();
        }
      }
    }
  }

  const pageSections = document.querySelectorAll("section[id]");
  if (pageSections.length > 0 && "IntersectionObserver" in window) {
    const sectionObserver = new IntersectionObserver(
      (intersectionEntries) => {
        for (const entry of intersectionEntries) {
          const sectionId = entry.target.id;
          if (!sectionId) continue;

          const sectionTimer = sectionVisibilityTimers.get(sectionId) || {
            sectionEnteredAtMs: null,
            totalVisibleMs: 0,
          };

          if (entry.isIntersecting) {
            sectionTimer.sectionEnteredAtMs = Date.now();
          } else if (sectionTimer.sectionEnteredAtMs !== null) {
            sectionTimer.totalVisibleMs += Date.now() - sectionTimer.sectionEnteredAtMs;
            sectionTimer.sectionEnteredAtMs = null;
            trackEvent(ENGAGEMENT_EVENT_NAMES.sectionView, {
              ...getSessionAttributionParams(),
              section_id: sectionId,
              section_visible_seconds: Math.round(sectionTimer.totalVisibleMs / 1000),
            });
          }

          sectionVisibilityTimers.set(sectionId, sectionTimer);
        }
      },
      { threshold: SECTION_VISIBILITY_THRESHOLD }
    );

    pageSections.forEach((sectionElement) => sectionObserver.observe(sectionElement));
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      lastVisibleTimestampMs = Date.now();
      return;
    }
    accumulateVisibleTime();
  });

  window.addEventListener("scroll", trackScrollDepthMilestones, { passive: true });
  trackScrollDepthMilestones();

  const heartbeatTimerId = window.setInterval(() => {
    if (document.visibilityState !== "visible") return;
    accumulateVisibleTime();
    lastVisibleTimestampMs = Date.now();
    trackEvent(ENGAGEMENT_EVENT_NAMES.heartbeat, {
      ...getSessionAttributionParams(),
      engagement_seconds: Math.round(totalActiveVisibleMs / 1000),
    });
    reportContentEngagementIfQualified();
  }, ACTIVE_TIME_HEARTBEAT_INTERVAL_MS);

  window.addEventListener("pagehide", () => {
    window.clearInterval(heartbeatTimerId);

    for (const [sectionId, sectionTimer] of sectionVisibilityTimers.entries()) {
      if (sectionTimer.sectionEnteredAtMs === null) continue;
      sectionTimer.totalVisibleMs += Date.now() - sectionTimer.sectionEnteredAtMs;
      trackEvent(ENGAGEMENT_EVENT_NAMES.sectionView, {
        ...getSessionAttributionParams(),
        section_id: sectionId,
        section_visible_seconds: Math.round(sectionTimer.totalVisibleMs / 1000),
      });
    }

    reportPageEngagement("page_exit");
  });
}
