# Architecture

## High-level flow

```
HTML meta tags (GA4 + Google Ads IDs)
        │
        ├──► <head> gtag-init.js + async gtag/js?id=AW-…  (Google tag)
        │
        ▼
index.js ──► readSiteAnalyticsConfig()
        │
        ├──► gtag-loader.js ──► fallback only if gtag-init.js missing
        │
        ├──► attribution.js ──► sessionStorage snapshot + session_start
        │
        ├──► clicks.js ──► document click listener → element_click
        │
        └──► engagement.js ──► scroll / sections / time → engagement events

main.js (contact form success)
        │
        └──► window.SiteAnalytics.trackContactFormConversion()
        └──► window.SiteAnalytics.trackEvent('form_submit', …)
```

## Why a separate module?

- **Single responsibility** — `main.js` handles UI; analytics is isolated under `web/assets/analytics/`.
- **CSP-friendly** — gtag bootstrap lives in JavaScript files, not inline `<script>` blocks.
- **Testable surface** — `window.SiteAnalytics` is the only integration point for the rest of the site.

## Module responsibilities

### `config.js`

Reads `<meta>` tags and exports constants (scroll milestones, heartbeat interval, Google Ads conversion ID).

### `gtag-init.js`

Loaded from `<head>` on every tracked page. Matches Google’s recommended placement so Google Ads Tag diagnostics detect `AW-18163846421` in page source. Configures GA4, Google Ads, and `allow_ad_personalization_signals: false`.

### `gtag-loader.js`

Fallback bootstrap if `gtag-init.js` is not present (e.g. local experiments). Skipped when `window.__siteAnalyticsGtagReady` is already set.

### `transport.js`

All custom events go through `trackEvent()`. Events fired before gtag is ready are queued and flushed when `markGtagReady()` runs.

Every `trackEvent` payload automatically includes:

- `page_path` — pathname + query string
- `page_title` — `document.title`

### `attribution.js`

On the **first page load in a browser tab**, captures:

- UTM parameters from the URL
- `document.referrer`
- Classified referrer type (direct, search, social, referral, …)
- Landing page path

Stored in `sessionStorage` under key `site_analytics_attribution`. Later events in the same tab attach these fields so you can tie clicks and engagement back to the original source.

### `clicks.js`

One capture-phase listener on `document`. Matches interactive elements (links, buttons, `<summary>`, etc.). Ignores clicks inside `[data-analytics-ignore]`.

### `engagement.js`

- **Scroll depth** — fires once per milestone (25, 50, 75, 90, 100 %).
- **Section time** — `IntersectionObserver` on `section[id]`; fires `section_view` when the section leaves the viewport (≥ 35 % visible while “in view”).
- **Active time** — counts only while the tab is `visible` (not backgrounded).
- **Heartbeat** — every 30 s while visible.
- **Exit** — `page_engagement` on `pagehide` with total active seconds.

## Integration with `main.js`

After a successful AJAX contact form submission:

```javascript
window.SiteAnalytics?.trackContactFormConversion?.();
window.SiteAnalytics?.trackEvent?.("form_submit", {
  form_name: "contact",
  form_result: "success",
});
```

Optional chaining ensures the site still works if analytics is disabled on a page.

## Performance

- gtag.js loads **async** (does not block rendering).
- Click tracking uses **event delegation** (one listener).
- Scroll listener is **passive**.
- Section timing uses **IntersectionObserver** (no scroll polling).
- Module files are small; combined size is negligible vs images and fonts.

## Privacy

- `gtag('set', 'allow_ad_personalization_signals', false)` is set before any config.
- No PII (names, emails, phone numbers) is sent in custom events.
- Blog admin (`noindex`) does not load analytics.
