# Google Ads conversions

Contact form submissions are tracked as a **Google Ads conversion** in addition to the GA4 `form_submit` event.

## Configuration

| Setting | Value |
|---------|-------|
| Google Ads tag ID | `AW-18163846421` (meta: `google-ads-tag-id`) |
| Conversion action | `AW-18163846421/UgqsCN7-1bIcEJWamdVD` |
| Code constant | `GOOGLE_ADS_CONTACT_FORM_CONVERSION` in `web/assets/analytics/config.js` |

## When it fires

After the contact form AJAX call to FormSubmit returns success (`main.js`):

1. `SiteAnalytics.trackContactFormConversion()` — Google Ads conversion
2. `SiteAnalytics.trackEvent('form_submit', …)` — GA4 custom event

There is no separate “thank you” page; the inline confirmation message triggers the conversion.

## Verify in Google Ads

1. Sign in to [Google Ads](https://ads.google.com/).
2. **Goals** → **Conversions** → **Summary**
3. Open the contact / lead conversion action
4. **Tag setup** → **Tag diagnostics**

After deploy, submit a test form (use a real-looking but test message). Status should move to “Recording conversions” within a few hours.

## GA4 vs Google Ads

| | GA4 | Google Ads |
|---|-----|------------|
| Event | `form_submit` | `conversion` (gtag) |
| Where to view | GA4 → Events / Explore | Ads → Conversions |
| Used for | Site behaviour analysis | Campaign bidding & ROI |

Both tags load from the same gtag snippet; they run in parallel and do not conflict.

## Privacy

Same as GA4 setup: `allow_ad_personalization_signals` is set to `false` in `gtag-loader.js`.
