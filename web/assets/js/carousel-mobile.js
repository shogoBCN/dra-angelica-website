/**
 * Swap landing carousel images to mobile assets at ≤719px.
 * Loaded synchronously right after the carousel markup so src is set before fetch.
 */
(function applyMobileCarouselSources() {
  const MOBILE_CAROUSEL_MEDIA_QUERY = "(max-width: 719px)";
  const mediaQuery = window.matchMedia(MOBILE_CAROUSEL_MEDIA_QUERY);

  function swapSources(useMobile) {
    document.querySelectorAll(".promo-carousel__track img[data-mobile-src]").forEach((img) => {
      const desktopSrc = img.dataset.desktopSrc || img.getAttribute("src");
      const mobileSrc = img.dataset.mobileSrc;
      const nextSrc = useMobile ? mobileSrc : desktopSrc;
      if (nextSrc && img.getAttribute("src") !== nextSrc) {
        img.setAttribute("src", nextSrc);
      }
    });
  }

  swapSources(mediaQuery.matches);

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", (event) => swapSources(event.matches));
  } else if (typeof mediaQuery.addListener === "function") {
    mediaQuery.addListener((event) => swapSources(event.matches));
  }
})();
