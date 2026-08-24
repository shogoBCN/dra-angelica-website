const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SITE_ORIGIN = "https://medicina-familiar.co";

/**
 * Legacy `/blog/articulo?slug=…` links cannot be redirected via firebase.json
 * (Hosting strips query strings before redirect rules). Redirect to the static
 * per-slug page that carries correct Open Graph meta tags.
 *
 * @param {import("firebase-functions/v2/https").Request} req
 * @param {import("firebase-functions/v2/https").Response} res
 */
export function handleBlogArticleRedirect(req, res) {
  const slug = String(req.query.slug || "")
    .trim()
    .toLowerCase();

  if (slug && slug.length <= 96 && SLUG_RE.test(slug)) {
    res.redirect(
      301,
      `${SITE_ORIGIN}/blog/articulo/${encodeURIComponent(slug)}/`,
    );
    return;
  }

  res.redirect(301, `${SITE_ORIGIN}/blog/`);
}
