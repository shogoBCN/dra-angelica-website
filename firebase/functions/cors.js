/** Production site and common local static-server origins (direct function URL testing). */
export const ALLOWED_ORIGINS = new Set([
  "https://medicina-familiar.co",
  "https://www.medicina-familiar.co",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
]);

/**
 * @param {import("firebase-functions/v2/https").Request} req
 * @returns {boolean}
 */
export function isAllowedOrigin(req) {
  const origin = req.get("Origin");
  if (!origin) {
    return true;
  }
  return ALLOWED_ORIGINS.has(origin);
}

/**
 * @param {import("firebase-functions/v2/https").Request} req
 * @returns {Record<string, string>}
 */
export function corsHeaders(req) {
  const origin = req.get("Origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return {};
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    Vary: "Origin",
  };
}
