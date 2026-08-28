(() => {
  const SITE_ORIGIN = "https://medicina-familiar.co";

  function readSlug() {
    const fromQuery = new URLSearchParams(window.location.search).get("slug");
    if (fromQuery?.trim()) return fromQuery.trim().toLowerCase();
    const match = window.location.pathname.replace(/\/+$/, "").match(
      /\/blog\/articulo\/([a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*)$/,
    );
    return match ? match[1].toLowerCase() : "";
  }

  function setMetaContent(id, value) {
    if (!value) return;
    const el = document.getElementById(id);
    if (el) el.content = value;
  }

  function articleUrl(slug) {
    return `${SITE_ORIGIN}/blog/articulo/${encodeURIComponent(slug)}/`;
  }

  const MANIFEST_PATH = "/assets/data/blog-posts.json";
  const RELATED_PATH = "/assets/data/blog-post-related.json";

  function resolveCategories(slug, fromDoc, manifestPosts) {
    const cats = window.__blogCategories;
    const normalized = cats?.normalize(fromDoc) || [];
    if (normalized.length) return normalized;
    const fromManifest = manifestPosts.find((post) => post.slug === slug)?.categories;
    return cats?.normalize(fromManifest) || [];
  }

  function resolveRelatedArticles(currentSlug, relatedMap, manifestPosts) {
    const relatedSlugs = relatedMap?.[currentSlug];
    if (!Array.isArray(relatedSlugs) || !relatedSlugs.length) return [];

    const titleBySlug = new Map(
      manifestPosts.filter((post) => post.slug).map((post) => [post.slug, post.title || ""]),
    );

    return relatedSlugs
      .map((slug) => String(slug || "").trim())
      .filter((slug) => slug && slug !== currentSlug && titleBySlug.has(slug))
      .map((slug) => ({ slug, title: titleBySlug.get(slug) || slug }));
  }

  async function loadManifest() {
    const res = await fetch(`${MANIFEST_PATH}${assets.assetCacheQuery()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.posts) ? data.posts : [];
  }

  async function loadRelatedMap() {
    try {
      const res = await fetch(`${RELATED_PATH}${assets.assetCacheQuery()}`);
      if (!res.ok) return {};
      const data = await res.json();
      return data && typeof data === "object" && !Array.isArray(data) ? data : {};
    } catch {
      return {};
    }
  }

  function renderCategoryTags(categories) {
    const el = document.getElementById("blog-article-categories");
    const cats = window.__blogCategories;
    if (!el || !cats) return;
    const html = cats.tagsHtml(categories, { link: true });
    if (!html) return;
    el.innerHTML = html;
    el.hidden = false;
  }

  function renderRelatedArticles(related) {
    const el = document.getElementById("blog-article-related");
    if (!related?.length || !el) return;

    const links = related
      .map(
        (post) =>
          `<a href="/blog/articulo/${encodeURIComponent(post.slug)}/">${post.title}</a>`,
      )
      .join(", ");

    el.innerHTML = `Ver también: ${links}`;
    el.hidden = false;
  }

  function coverFromPost(d, assets) {
    const html = d.bodyHtml || "";
    const match = html.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
    if (!match) return "";
    const imgPath = assets.normalizeAssetUrl(match[1]);
    return imgPath ? `${SITE_ORIGIN}${imgPath}` : "";
  }

  function coverAltFromPost(d) {
    const html = d.bodyHtml || "";
    const match = html.match(/<img\b[^>]*\balt=["']([^"']*)["']/i);
    return match?.[1] || d.coverImageAlt || d.title || "";
  }

  const slugParam = readSlug();

  const stateEl = document.getElementById("blog-articulo-state");
  const wrap = document.getElementById("blog-article-shell");
  const assets = window.__blogAssets;

  function normalizeBodyHtml(html) {
    return String(html || "").replace(
      /\bsrc=(["'])([^"']+)\1/gi,
      (_m, quote, src) => `src=${quote}${assets.bustAssetUrl(src)}${quote}`,
    );
  }

  function fmtDate(ts) {
    if (!ts || typeof ts.toDate !== "function") return "";
    const d = ts.toDate();
    return new Intl.DateTimeFormat("es-CO", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  }

  const slugRaw = (slugParam || "").trim();

  if (
    !slugRaw ||
    slugRaw.length > 96 ||
    !/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/.test(slugRaw)
  ) {
    wrap.hidden = true;
    stateEl.hidden = false;
    stateEl.className = "blog-error blog-state";
    stateEl.textContent = "Enlace inválido. Vuelva al blog.";
    return;
  }

  if (!window.__blogFirebaseConfigured) {
    wrap.hidden = true;
    stateEl.hidden = false;
    stateEl.className = "blog-error blog-state";
    stateEl.textContent =
      "Falta la configuración de Firebase (consulte web/blog/assets/js/firebase-config.js).";
    return;
  }

  const slug = slugRaw.toLowerCase();

  async function loadPost() {
    const ref = firebase.firestore().collection("posts").doc(slug);
    try {
      const fresh = await ref.get({ source: "server" });
      if (fresh.exists) return fresh;
    } catch {
      /* offline or server unavailable — use local cache */
    }
    return ref.get();
  }

  Promise.all([loadPost(), loadManifest(), loadRelatedMap()])
    .then(([doc, manifestPosts, relatedMap]) => {
      if (!doc.exists) throw new Error("missing");
      const d = doc.data();
      if (!d.published) throw new Error("hidden");

      document.title = `${d.title || "Artículo"} | Blog — Dra. Angélica Granados Silva`;

      wrap.hidden = false;
      stateEl.hidden = true;

      document.getElementById("blog-article-meta").textContent = fmtDate(d.publishedAt);
      const h = document.getElementById("blog-article-title");
      h.textContent = d.title || "Sin título";

      const categories = resolveCategories(slug, d.categories, manifestPosts);
      const related = resolveRelatedArticles(slug, relatedMap, manifestPosts);
      renderRelatedArticles(related);
      renderCategoryTags(categories);

      const body = document.getElementById("blog-article-body");
      body.innerHTML = normalizeBodyHtml(d.bodyHtml || "");

      const excerpt = d.excerpt ? String(d.excerpt).slice(0, 155) : "";
      const desc = document.querySelector('meta[name="description"]');
      if (desc && excerpt) desc.content = excerpt;
      const canon = document.querySelector('link[rel="canonical"]');
      if (canon) canon.href = articleUrl(slug);
      if (d.title) {
        setMetaContent("og-title", d.title);
        setMetaContent("twitter-title", d.title);
      }
      if (excerpt) {
        setMetaContent("og-description", excerpt);
        setMetaContent("twitter-description", excerpt);
      }
      setMetaContent("og-url", articleUrl(slug));
      const coverAbs = coverFromPost(d, assets);
      if (coverAbs) {
        setMetaContent("og-image", coverAbs);
        setMetaContent("twitter-image", coverAbs);
        setMetaContent("og-image-alt", coverAltFromPost(d));
      }
    })
    .catch(() => {
      wrap.hidden = true;
      stateEl.hidden = false;
      stateEl.className = "blog-muted blog-state";
      stateEl.textContent =
        "No encontramos este artículo o aún no está publicado.";
    });
})();
