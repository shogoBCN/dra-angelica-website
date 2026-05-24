# Frontend analytics (medicina-familiar.co)

This folder documents the site’s **frontend analytics module**: how it is wired, what it tracks, and how to view the data in Google Analytics 4 (GA4) and Google Ads.

## Documentation index

| Document | Contents |
|----------|----------|
| [Architecture](./architecture.md) | Module layout, page wiring, data flow |
| [Configuration](./configuration.md) | Meta tags, enable/disable, CSP requirements |
| [Events & parameters](./events-and-parameters.md) | Every custom event and its fields |
| [GA4 access guide](./ga4-access-guide.md) | Exact steps to find and report on data in GA4 |
| [HTML hooks](./html-hooks.md) | Optional `data-analytics-*` attributes |
| [Google Ads conversions](./google-ads-conversions.md) | Contact form conversion tracking |

## Source code

Implementation lives in:

```
web/assets/analytics/
  index.js           Entry point; exposes window.SiteAnalytics
  config.js          Meta tag IDs and constants
  gtag-loader.js     gtag.js bootstrap
  transport.js       trackEvent / conversion dispatch
  attribution.js     UTM + referrer (sessionStorage)
  clicks.js          element_click
  engagement.js      scroll, sections, time on page
```

## Pages that load analytics

| Page | Analytics | GA4 meta | Google Ads meta |
|------|-----------|----------|-----------------|
| `/` (index.html) | Yes | G-NET9DFP6TW | AW-18163846421 |
| `/blog/` | Yes | G-NET9DFP6TW | AW-18163846421 |
| `/blog/articulo` | Yes | G-NET9DFP6TW | AW-18163846421 |
| `/blog/admin/` | No | — | — |

Each tracked page includes:

```html
<script type="module" src="/assets/analytics/index.js"></script>
<script src="/assets/js/main.js" defer></script>
```

The analytics module runs as an ES module (deferred). `main.js` calls `window.SiteAnalytics` after the contact form succeeds.

## Quick verification after deploy

1. Open https://medicina-familiar.co in an incognito window.
2. Open GA4 → **Reports** → **Realtime**.
3. Click a nav link and scroll the page.
4. Within ~30 seconds you should see events such as `session_start`, `element_click`, `scroll_depth`.

See [GA4 access guide](./ga4-access-guide.md) for full reporting setup.
