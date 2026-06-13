/**
 * Static checks for analytics hooks (no browser required).
 * Usage: node scripts/verify-analytics-hooks.mjs
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GOOGLE_ADS_CONVERSIONS,
  readContentEngagedThresholds,
} from "../web/assets/analytics/config.js";
import {
  classifyLeadClickConversion,
  resolveClickConversion,
} from "../web/assets/analytics/conversions.js";

const root = new URL("..", import.meta.url).pathname;
const citaHtml = readFileSync(join(root, "web/cita/index.html"), "utf8");

function mockLink(attrs) {
  return {
    getAttribute(name) {
      return attrs[name] ?? null;
    },
  };
}

let failed = 0;

function ok(label, condition) {
  if (condition) {
    console.log(`OK  ${label}`);
    return;
  }
  console.error(`FAIL ${label}`);
  failed += 1;
}

// moreInfoClick label configured
ok(
  "moreInfoClick label is configured",
  /^AW-[0-9]+\/[A-Za-z0-9_-]+$/.test(GOOGLE_ADS_CONVERSIONS.moreInfoClick)
);

// resolveClickConversion prefers explicit hook over internal href
ok(
  "resolveClickConversion → moreInfoClick for data-analytics-conversion",
  resolveClickConversion(
    mockLink({ "data-analytics-conversion": "moreInfoClick" }),
    "/"
  ) === "moreInfoClick"
);

ok(
  "resolveClickConversion → null for plain internal link",
  resolveClickConversion(mockLink({}), "/") === null
);

ok(
  "classifyLeadClickConversion → whatsappClick for wa.me",
  classifyLeadClickConversion("https://wa.me/573107700625") === "whatsappClick"
);

// Cita HTML hooks
const moreInfoCount = (citaHtml.match(/data-analytics-conversion="moreInfoClick"/g) || []).length;
ok("cita page has 3 moreInfoClick links", moreInfoCount === 3);

ok(
  "cita page sets 100% scroll threshold",
  citaHtml.includes('name="analytics-content-engaged-scroll" content="100"')
);

ok(
  "cita page sets 60s active threshold",
  citaHtml.includes('name="analytics-content-engaged-seconds" content="60"')
);

// readContentEngagedThresholds with JSDOM-like document stub
globalThis.document = {
  querySelector(selector) {
    if (selector.includes("analytics-content-engaged-scroll")) {
      return { getAttribute: () => "100" };
    }
    if (selector.includes("analytics-content-engaged-seconds")) {
      return { getAttribute: () => "60" };
    }
    return null;
  },
};

const citaThresholds = readContentEngagedThresholds();
ok("readContentEngagedThresholds scroll=100", citaThresholds.scrollPercent === 100);
ok("readContentEngagedThresholds seconds=60", citaThresholds.activeSeconds === 60);

delete globalThis.document;

if (failed > 0) {
  process.exitCode = 1;
  console.error(`\n${failed} check(s) failed.`);
} else {
  console.log("\nAll analytics hook checks passed.");
}
