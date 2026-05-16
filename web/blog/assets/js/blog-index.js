(() => {
  const listRoot = document.getElementById("blog-list-root");
  const stateEl = document.getElementById("blog-state");

  function fmtDate(ts) {
    if (!ts || typeof ts.toDate !== "function") return "";
    const d = ts.toDate();
    return new Intl.DateTimeFormat("es-CO", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  }

  function esc(s) {
    const span = document.createElement("span");
    span.textContent = s ?? "";
    return span.innerHTML;
  }

  if (!window.__blogFirebaseConfigured) {
    stateEl.hidden = false;
    stateEl.className = "blog-error blog-state";
    stateEl.textContent =
      "El blog necesita configuración técnica: complete web/blog/assets/js/firebase-config.js con los datos de Firebase (Consola → Ajustes del proyecto).";
    return;
  }

  const db = firebase.firestore();
  db.collection("posts")
    .where("published", "==", true)
    .orderBy("publishedAt", "desc")
    .get()
    .then((snap) => {
      stateEl.hidden = true;
      if (snap.empty) {
        stateEl.hidden = false;
        stateEl.className = "blog-muted blog-state";
        stateEl.textContent = "Aún no hay artículos publicados. Vuelva pronto.";
        return;
      }
      const frag = document.createDocumentFragment();
      snap.forEach((doc) => {
        const d = doc.data();
        const slug = doc.id;
        const a = document.createElement("a");
        a.href = `./articulo?slug=${encodeURIComponent(slug)}`;
        a.className = "blog-card";
        a.innerHTML =
          `<p class="blog-card__date">${esc(fmtDate(d.publishedAt))}</p>` +
          `<h2 class="blog-card__title">${esc(d.title || "Sin título")}</h2>` +
          `<p class="blog-card__excerpt">${esc(d.excerpt || "")}</p>`;
        frag.appendChild(a);
      });
      listRoot.appendChild(frag);
    })
    .catch(() => {
      stateEl.hidden = false;
      stateEl.className = "blog-error blog-state";
      stateEl.textContent = "No se pudieron cargar los artículos. Inténtelo de nuevo más tarde.";
    });
})();
