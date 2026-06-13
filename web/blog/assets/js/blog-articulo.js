(() => {
  const params = new URLSearchParams(window.location.search);
  const slugParam = params.get("slug");

  const stateEl = document.getElementById("blog-articulo-state");
  const wrap = document.getElementById("blog-article-shell");

  function normalizeAssetUrl(url) {
    let src = String(url || "").trim();
    if (!src) return src;
    src = src.replace(/^https:\/\/medicina-familiar\.co(?=\/)/i, "");
    if (src === "/assets/images/blog-medico-familiar-consulta.jpg") {
      return "/assets/images/blog/blog-medico-familiar-consulta.jpg";
    }
    return src;
  }

  function normalizeBodyHtml(html) {
    return String(html || "").replace(
      /\bsrc=(["'])([^"']+)\1/gi,
      (_m, quote, src) => `src=${quote}${normalizeAssetUrl(src)}${quote}`,
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

  firebase
    .firestore()
    .collection("posts")
    .doc(slug)
    .get()
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

      const desc = document.querySelector('meta[name="description"]');
      if (desc && d.excerpt) desc.content = String(d.excerpt).slice(0, 155);
      const canon = document.querySelector('link[rel="canonical"]');
      if (canon) canon.href = `https://medicina-familiar.co/blog/articulo?slug=${encodeURIComponent(slug)}`;
      const ot = document.getElementById("og-title");
      if (ot && d.title) ot.content = d.title;
      const od = document.getElementById("og-description");
      if (od && d.excerpt) od.content = d.excerpt;
    })
    .catch(() => {
      wrap.hidden = true;
      stateEl.hidden = false;
      stateEl.className = "blog-muted blog-state";
      stateEl.textContent =
        "No encontramos este artículo o aún no está publicado.";
    });
})();
