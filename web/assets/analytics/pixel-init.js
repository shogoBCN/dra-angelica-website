/**
 * Meta Pixel bootstrap — loaded synchronously from <head>.
 *
 * Pair with:
 *   <meta name="meta-pixel-id" content="…">
 *   <script src="…/pixel-init.js"></script>
 *
 * Stub + async fbevents.js match Meta’s snippet, kept in an external file
 * so Content-Security-Policy does not need 'unsafe-inline'.
 */
(function bootstrapMetaPixel() {
  const enablementMeta = document.querySelector('meta[name="site-analytics"]');
  const enablementFlag = enablementMeta?.getAttribute("content")?.trim().toLowerCase();
  if (enablementFlag === "disabled" || enablementFlag === "off") return;

  const pixelId =
    document.querySelector('meta[name="meta-pixel-id"]')?.getAttribute("content")?.trim() || "";
  if (!/^\d{10,}$/.test(pixelId)) return;

  if (window.fbq) {
    window.fbq("init", pixelId);
    window.fbq("track", "PageView");
    window.__siteAnalyticsPixelReady = true;
    return;
  }

  const fbq = function () {
    if (fbq.callMethod) {
      fbq.callMethod.apply(fbq, arguments);
    } else {
      fbq.queue.push(arguments);
    }
  };
  window.fbq = fbq;
  if (!window._fbq) window._fbq = fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];

  const pixelScript = document.createElement("script");
  pixelScript.async = true;
  pixelScript.src = "https://connect.facebook.net/en_US/fbevents.js";
  const firstScript = document.getElementsByTagName("script")[0];
  if (firstScript?.parentNode) {
    firstScript.parentNode.insertBefore(pixelScript, firstScript);
  } else {
    document.head.appendChild(pixelScript);
  }

  fbq("init", pixelId);
  fbq("track", "PageView");
  window.__siteAnalyticsPixelReady = true;
})();
