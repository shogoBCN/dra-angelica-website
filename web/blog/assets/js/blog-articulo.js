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

  loadPost()
    .then((doc) => {
      if (!doc.exists) throw new Error("missing");
      const d = doc.data();
      if (!d.published) throw new Error("hidden");

      document.title = `${d.title || "Artículo"} | Blog — Dra. Angélica Granados Silva`;

      wrap.hidden = false;
      stateEl.hidden = true;

      document.getElementById("blog-article-meta").textContent = fmtDate(d.publishedAt);
      const h = document.getElementById("blog-article-title");
      h.textContent = d.title || "Sin título";

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
