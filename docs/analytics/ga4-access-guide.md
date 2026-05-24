# GA4 access guide

Property: **G-NET9DFP6TW** (medicina-familiar.co web stream)

Custom events appear automatically in GA4, but **parameters need custom dimensions** before you can use them as report breakdowns. Allow **24–48 hours** after creating dimensions for historical data to populate.

---

## 1. Verify tags are firing (Realtime)

1. Sign in to [Google Analytics](https://analytics.google.com/).
2. Select the property for **medicina-familiar.co**.
3. Left menu → **Reports** → **Realtime**.
4. Open your site in another tab (incognito recommended).
5. Click links and scroll.

You should see:

- **Users in last 30 minutes** increase
- Under **Event count by Event name**: `session_start`, `element_click`, `scroll_depth`, and GA4 defaults like `page_view`

If nothing appears after 2–3 minutes, check:

- Meta tag `G-NET9DFP6TW` is on the page
- Browser devtools → Network → filter `google-analytics.com` or `collect` — requests should appear on interaction
- Ad blockers disabled for testing

---

## 2. List all custom events

1. **Admin** (gear, bottom left)
2. **Data display** → **Events**
3. Search for: `session_start`, `element_click`, `scroll_depth`, `section_view`, `page_engagement`, `form_submit`

Click an event name to see parameter keys GA4 has received (may show as “(not set)” in reports until dimensions exist).

---

## 3. Register custom dimensions (one-time setup)

Required to break down reports by UTM, click labels, sections, etc.

1. **Admin** → **Data display** → **Custom definitions**
2. Click **Create custom dimension**
3. For each row below:

| Dimension name | Scope | Event parameter |
|----------------|-------|-----------------|
| Landing page | Event | `landing_page` |
| Referrer type | Event | `referrer_type` |
| Referrer host | Event | `referrer_host` |
| UTM source | Event | `utm_source` |
| UTM medium | Event | `utm_medium` |
| UTM campaign | Event | `utm_campaign` |
| UTM term | Event | `utm_term` |
| UTM content | Event | `utm_content` |
| Click label | Event | `click_label` |
| Click section | Event | `click_section` |
| Click link type | Event | `click_link_type` |
| Scroll percent | Event | `scroll_percent` |
| Section ID | Event | `section_id` |
| Section visible seconds | Event | `section_visible_seconds` |
| Engagement seconds | Event | `engagement_seconds` |
| Time on page seconds | Event | `time_on_page_seconds` |
| Form name | Event | `form_name` |

**Scope** is always **Event** for these parameters.

---

## 4. Where traffic comes from (built-in GA4 reports)

### Acquisition overview

**Reports** → **Acquisition** → **Traffic acquisition**

- **Session primary channel group** — Organic Search, Paid Search, Direct, Referral, etc.
- Works without custom dimensions (GA4 default)

### Campaign / UTM (after custom dimensions)

**Explore** → **Blank** (new exploration)

1. **Variables** → Import dimensions: `UTM source`, `UTM medium`, `UTM campaign`, `Referrer type`
2. **Tab settings** → Technique: **Free form**
3. **Rows:** `Session source / medium` or `UTM campaign`
4. **Values:** `Event count` or `Sessions`
5. **Filters:** Event name = `session_start`

Alternatively use custom event `session_start` with dimension **UTM source** to see first-touch landing attribution from our module.

---

## 5. What people click

**Explore** → **Free form**

| Setting | Value |
|---------|-------|
| Rows | `Click label` (custom dimension) |
| Columns | `Click section` (optional) |
| Values | Event count |
| Filter | Event name exactly matches `element_click` |

**Example questions this answers:**

- How often is “Agenda tu consulta” clicked?
- WhatsApp vs email link clicks (`Click link type` = `phone_or_whatsapp` vs `email`)

---

## 6. Scroll and section engagement

### Scroll depth

**Explore** → **Free form**

| Setting | Value |
|---------|-------|
| Rows | `Scroll percent` |
| Values | Event count |
| Filter | Event name = `scroll_depth` |

### Time in homepage sections

**Explore** → **Free form**

| Setting | Value |
|---------|-------|
| Rows | `Section ID` |
| Values | Average of `Section visible seconds` (or Event count) |
| Filter | Event name = `section_view` |

Homepage section IDs: `inicio`, `sobre-mi`, `medicina-familiar`, `servicios`, `preguntas-frecuentes`, `contacto`.

---

## 7. Time on site

**Explore** → **Free form**

| Setting | Value |
|---------|-------|
| Rows | `Page path and screen class` or `Landing page` |
| Values | Average of `Engagement seconds` |
| Filter | Event name = `page_engagement` |

`engagement_seconds` counts only time the tab was **visible** (not backgrounded).

Built-in alternative: **Reports** → **Engagement** → **Pages and screens** → column **Average engagement time** (GA4’s own calculation; may differ slightly from `page_engagement`).

---

## 8. Contact form conversions in GA4

**Reports** → **Engagement** → **Events** → click **`form_submit`**

Or **Explore**:

| Setting | Value |
|---------|-------|
| Filter | Event name = `form_submit` |
| Breakdown | `Form name`, `Form result` |

For Google Ads conversion counts, use [Google Ads conversions](./google-ads-conversions.md) instead.

---

## 9. Mark key events (optional)

To surface events in standard reports:

1. **Admin** → **Data display** → **Events**
2. Toggle **Mark as key event** for:
   - `form_submit`
   - `element_click` (if you want click volume in overview cards)

---

## 10. Debug with DebugView (optional)

For development only:

1. Install [Google Analytics Debugger](https://chrome.google.com/webstore/detail/google-analytics-debugger/jnkmfdileelhofjcijamephafjihkij) Chrome extension, or add `debug_mode: true` temporarily in gtag config.
2. GA4 → **Admin** → **Data display** → **DebugView**
3. Events appear with full parameter payloads in near real time.

Remove debug mode before production if you add it to code.

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Only `page_view`, no custom events | Analytics module not loaded; check `<script type="module" src="…/analytics/index.js">` |
| Events in Realtime but not Explore | Wait 24 h; or missing custom dimension registration |
| Parameters always “(not set)” | Dimension event parameter name must match exactly (snake_case) |
| No UTM data | Landing URL had no UTM params; use tagged ad URLs |
| Duplicate `session_start` | Expected on each full page navigation (home → blog → article) |
