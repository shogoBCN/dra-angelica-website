# Configuration

## Meta tags

Add these in `<head>` on each page that should be tracked.

### GA4 (Google Analytics 4)

```html
<meta name="google-analytics-measurement-id" content="G-NET9DFP6TW" />
```

Find the ID in GA4: **Admin** (gear) → **Data collection and modification** → **Data streams** → your web stream → **Measurement ID**.

Leave empty or omit to disable GA4 on that page (Google Ads alone can still enable the module if the Ads meta is present).

### Google Ads

```html
<meta name="google-ads-tag-id" content="AW-18163846421" />
```

Used for campaign conversion tracking alongside GA4.

### Disable analytics on a specific page

```html
<meta name="site-analytics" content="disabled" />
```

Accepted values: `disabled`, `off` (case-insensitive). Overrides tag IDs on that page.

## Script tags

Google tag in `<head>` (required for Google Ads verification):

```html
<!-- After meta tags -->
<script async src="https://www.googletagmanager.com/gtag/js?id=AW-18163846421"></script>
<script src="/assets/analytics/gtag-init.js"></script>
```

`gtag-init.js` reads the meta tags and calls `gtag('config', …)` for GA4 and Google Ads. Init logic is in an external file (not inline) to satisfy Content-Security-Policy.

Custom event tracking loads at the end of `<body>`:

```html
<script type="module" src="/assets/analytics/index.js"></script>
<script src="/assets/js/main.js" defer></script>
```

## Content Security Policy (CSP)

Tracked pages must allow Google Tag Manager in CSP:

| Directive | Required hosts |
|-----------|----------------|
| `script-src` | `'self'` `https://www.googletagmanager.com` |
| `connect-src` | `'self'` `https://www.google-analytics.com` `https://*.google-analytics.com` `https://www.googletagmanager.com` `https://www.google.com` `https://google.com` `https://www.googleadservices.com` |

Google Ads sends conversion data to `https://www.google.com/ccm/collect` (not `google-analytics.com`). Without `www.google.com` in `connect-src`, the browser blocks those requests and Google Ads reports the tag as missing or inactive.

These are already set on `index.html`, `blog/index.html`, and `blog/articulo.html`.

## Constants (code)

Edit in `web/assets/analytics/config.js` if needed:

| Constant | Default | Purpose |
|----------|---------|---------|
| `GOOGLE_ADS_CONTACT_FORM_CONVERSION` | `AW-18163846421/UgqsCN7-1bIcEJWamdVD` | Ads conversion label for contact form |
| `SCROLL_DEPTH_MILESTONES_PERCENT` | 25, 50, 75, 90, 100 | Scroll event thresholds |
| `ACTIVE_TIME_HEARTBEAT_INTERVAL_MS` | 30000 | Heartbeat interval (ms) |
| `SECTION_VISIBILITY_THRESHOLD` | 0.35 | Fraction of section visible before timing |

## Changing the GA4 property

1. Update `google-analytics-measurement-id` on all tracked HTML pages.
2. Register custom dimensions again in the **new** GA4 property (see [GA4 access guide](./ga4-access-guide.md)).
3. Deploy and verify in **Realtime**.

## Changing the Google Ads conversion

1. Update `google-ads-tag-id` in HTML if the account ID changes.
2. Update `GOOGLE_ADS_CONTACT_FORM_CONVERSION` in `config.js` with the new `AW-…/label` from Google Ads.
3. Verify in Google Ads → **Goals** → **Conversions** → **Tag diagnostics**.
