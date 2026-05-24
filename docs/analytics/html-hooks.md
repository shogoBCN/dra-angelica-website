# HTML hooks

Optional attributes to refine click labels or exclude noisy areas. No build step required.

---

## `data-analytics-label`

Explicit name for a click in GA4 (`click_label` parameter).

```html
<a
  href="https://wa.me/573107700625"
  data-analytics-label="WhatsApp footer"
>
  WhatsApp
</a>
```

**Priority order** for `click_label`:

1. `data-analytics-label`
2. `aria-label`
3. Element `id` (prefixed with `#`)
4. Visible text content
5. `href` (for links)
6. Tag name

---

## `data-analytics-section`

When an interactive element is not inside a `section[id]`, you can assign a logical section name:

```html
<aside data-analytics-section="blog-sidebar">
  <a href="/">Volver al inicio</a>
</aside>
```

Reported as `click_section` on `element_click` events.

---

## `data-analytics-ignore`

Exclude an element and all its descendants from click tracking:

```html
<div data-analytics-ignore>
  <!-- Clicks here are not tracked -->
  <button type="button">Internal UI only</button>
</div>
```

Or on a single element:

```html
<button type="button" data-analytics-ignore>Ayuda</button>
```

---

## Disable analytics on a page

```html
<meta name="site-analytics" content="disabled" />
```

See [Configuration](./configuration.md).

---

## Programmatic events from site code

After the analytics module loads, use the global API:

```javascript
// Custom business event
window.SiteAnalytics?.trackEvent?.("newsletter_signup", {
  signup_location: "footer",
});

// Read first-touch attribution in this tab
const attribution = window.SiteAnalytics?.getSessionAttribution?.();
console.log(attribution?.utm_source);

// Google Ads contact conversion (normally called from main.js)
window.SiteAnalytics?.trackContactFormConversion?.();
```

Always use optional chaining (`?.`) so pages without analytics do not throw errors.
