# Events and parameters

All custom events are sent via `gtag('event', …)` to the configured GA4 property (`G-NET9DFP6TW`). GA4 also records built-in events (`page_view`, `session_start` from gtag, etc.) automatically.

Unless noted, every custom event includes:

| Parameter | Description |
|-----------|-------------|
| `page_path` | Current path + query, e.g. `/blog/articulo?slug=…` |
| `page_title` | `document.title` |

Events from `clicks.js` and `engagement.js` also attach **session attribution** fields when available (see below).

---

## Session attribution fields

Captured once per browser tab session and attached to most events:

| Parameter | Example | Description |
|-----------|---------|-------------|
| `landing_page` | `/` | First path (+ query) in this tab |
| `page_referrer` | `https://google.com/` | Raw `document.referrer` on landing |
| `referrer_type` | `search` | `direct`, `internal`, `search`, `social`, `referral`, `unknown` |
| `referrer_host` | `google.com` | Hostname without `www.` |
| `utm_source` | `google` | From landing URL |
| `utm_medium` | `cpc` | From landing URL |
| `utm_campaign` | `spring_2026` | From landing URL |
| `utm_term` | | From landing URL |
| `utm_content` | | From landing URL |

---

## Custom events

### `session_start`

**When:** Once per page load (each tracked HTML page).  
**Module:** `attribution.js`

| Parameter | Description |
|-----------|-------------|
| All attribution fields | Full snapshot including `captured_at` |
| `page_location` | Full URL (`window.location.href`) |

**Use for:** Traffic source reporting, campaign landing analysis.

---

### `element_click`

**When:** User clicks a link, button, submit control, or `<summary>`.  
**Module:** `clicks.js`

| Parameter | Example | Description |
|-----------|---------|-------------|
| `click_element` | `a` | Tag name (lowercase) |
| `click_label` | `Agenda tu consulta` | Label from `data-analytics-label`, text, or href |
| `click_href` | `#contacto` | `href` if anchor (max 500 chars) |
| `click_link_type` | `anchor` | `none`, `anchor`, `email`, `phone_or_whatsapp`, `internal`, `external`, `unknown` |
| `click_section` | `contacto` | Nearest `section[id]` or `data-analytics-section` |
| `click_classes` | `btn btn--primary` | CSS classes (max 120 chars) |
| + attribution fields | | Session source context |

**Use for:** Which CTAs, WhatsApp links, and nav items get clicked.

---

### `scroll_depth`

**When:** First time scroll reaches each milestone (25, 50, 75, 90, 100 %).  
**Module:** `engagement.js`

| Parameter | Description |
|-----------|-------------|
| `scroll_percent` | Milestone reached (number) |
| + attribution fields | |

**Use for:** Content engagement / how far visitors read.

---

### `section_view`

**When:** A `section[id]` leaves the viewport after being ≥ 35 % visible. Also flushed on page exit if still in view.  
**Module:** `engagement.js`

| Parameter | Description |
|-----------|-------------|
| `section_id` | HTML `id`, e.g. `servicios`, `contacto` |
| `section_visible_seconds` | Cumulative visible time (seconds) |
| + attribution fields | |

**Use for:** Time spent in homepage sections (`inicio`, `sobre-mi`, `medicina-familiar`, etc.).

---

### `engagement_heartbeat`

**When:** Every 30 seconds while the tab is visible.  
**Module:** `engagement.js`

| Parameter | Description |
|-----------|-------------|
| `engagement_seconds` | Active visible time so far (seconds) |
| + attribution fields | |

**Use for:** Long-session monitoring; optional funnel analysis.

---

### `page_engagement`

**When:** On `pagehide` (tab close, navigation away, mobile background).  
**Module:** `engagement.js`

| Parameter | Description |
|-----------|-------------|
| `engagement_reason` | `page_exit` |
| `engagement_seconds` | Total **active** visible time (tab not hidden) |
| `engagement_ms` | Same in milliseconds |
| `time_on_page_seconds` | Wall-clock time since load (includes hidden time) |
| + attribution fields | |

**Use for:** “How long do people stay?” — prefer `engagement_seconds` over wall-clock time.

---

### `form_submit`

**When:** Contact form AJAX submission succeeds.  
**Module:** `main.js` via `SiteAnalytics.trackEvent`

| Parameter | Value |
|-----------|-------|
| `form_name` | `contact` |
| `form_result` | `success` |
| + `page_path`, `page_title` | Auto |

**Use for:** Form completion rate in GA4 (pair with click events on submit button).

---

## Google Ads conversion (not a GA4 custom event name)

**When:** Contact form succeeds.  
**Module:** `main.js` → `SiteAnalytics.trackContactFormConversion()`

Sends:

```javascript
gtag('event', 'conversion', { send_to: 'AW-18163846421/UgqsCN7-1bIcEJWamdVD' });
```

Reported in **Google Ads**, not as a named row in GA4 Events (unless GA4 is linked to Ads).

See [Google Ads conversions](./google-ads-conversions.md).

---

## Events not tracked

- Blog admin area (`/blog/admin/`)
- Clicks inside `[data-analytics-ignore]` containers
- Form field values or message body (no PII)
- Failed form submissions (only success today)
