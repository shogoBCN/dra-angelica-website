# Google Ads conversions

Six conversion actions map to real user intent on medicina-familiar.co. Each needs its **own label** in Google Ads — do not reuse the auto-created “Page view” label (`UgqsCN7-1bIcEJWamdVD`); set that action to **Secondary** or remove it from campaign goals.

## Conversion goals

| Goal | When it fires | GA4 event | Code key (`config.js`) | Suggested Ads setting |
|------|---------------|-----------|------------------------|------------------------|
| **Contact form** | `/api/contact` success (Resend) | `form_submit` | `contactForm` | Primary, Count: One |
| **WhatsApp click** | Click `wa.me` or `tel:` link | `element_click` | `whatsappClick` | Primary, Count: Every |
| **Email click** | Click `mailto:` link | `element_click` | `emailClick` | Primary, Count: Every |
| **Maps open** | Click Google Maps link | `element_click` | `mapsOpen` | Primary, Count: Every |
| **Content engaged** | Scroll ≥ 90 % **and** ≥ 90 s active reading | `content_engaged` | `contentEngaged` | Primary, Count: One, higher value |
| **Más información** | Click to main site from `/cita/` (`data-analytics-conversion="moreInfoClick"`) | `element_click` | `moreInfoClick` | Primary, Count: Every |

**Content engaged** means the visitor scrolled through most of the page and kept the tab in the foreground for at least 90 seconds — a signal they read the educational content, not just landed and left.

Adjust thresholds in `config.js`:

- `CONTENT_ENGAGED_MIN_SCROLL_PERCENT` (default `90`)
- `CONTENT_ENGAGED_MIN_ACTIVE_SECONDS` (default `90`)

## Setup in Google Ads

1. [Google Ads](https://ads.google.com/) → **Goals** → **Conversions** → **New conversion action**
2. Category: **Submit lead form** (form, WhatsApp, email, maps) or **Other** (content engaged)
3. Source: **Website**
4. Goal: event snippet — you only need the **Conversion label** (`AW-18163846421/xxxxxxxx`)
5. Create **six separate actions** (one per row in the table above)
6. Paste each label into `web/assets/analytics/config.js`:

```javascript
export const GOOGLE_ADS_CONVERSIONS = Object.freeze({
  contactForm: "AW-18163846421/YOUR_CONTACT_LABEL",
  whatsappClick: "AW-18163846421/YOUR_WHATSAPP_LABEL",
  emailClick: "AW-18163846421/YOUR_EMAIL_LABEL",
  mapsOpen: "AW-18163846421/YOUR_MAPS_LABEL",
  contentEngaged: "AW-18163846421/YOUR_CONTENT_LABEL",
  moreInfoClick: "AW-18163846421/YOUR_MORE_INFO_LABEL",
});
```

7. Deploy, then verify each action with [Tag Assistant](https://tagassistant.google.com/) from **Goals → Conversions → Tag diagnostics**
8. Set **Page view** (old misconfigured action) to **Secondary** — it is not used by this site

## Campaign bidding suggestions

| Conversion | Role in PMax / Search |
|------------|------------------------|
| Contact form, WhatsApp, email, maps | **Primary** — direct lead intent |
| Content engaged | **Primary** with **higher conversion value** (code sends `value: 2.0`) — rewards education funnels |
| Page view | **Secondary** or excluded |

In Google Ads you can assign different values per conversion action (e.g. form = 5, content engaged = 2, click = 1) to reflect business priority.

## Verify

| Action | How to test |
|--------|-------------|
| Contact form | Submit test message on homepage |
| WhatsApp | Click footer or contact WhatsApp link |
| Email | Click `doc.angelica@…` mailto link |
| Maps | Click “Abrir en Google Maps” |
| Content engaged | Scroll to bottom, stay on page ≥ 90 s with tab visible |
| Más información | On `/cita/`, click “Más información” or “Ver más información” |

Status should move from **Unverified** to **Recording conversions** within a few hours ([Google help](https://support.google.com/google-ads/answer/10029065)).

## GA4 vs Google Ads

| | GA4 | Google Ads |
|---|-----|------------|
| Lead clicks | `element_click` + parameters | `conversion` (gtag) |
| Form | `form_submit` | `conversion` |
| Deep read | `content_engaged` | `conversion` |
| Where to view | GA4 → Events / Explore | Ads → Conversions |

Both use the same gtag snippet in `<head>`; they do not conflict.

## Privacy

`allow_ad_personalization_signals` is set to `false` in `gtag-init.js` / `gtag-loader.js`.
