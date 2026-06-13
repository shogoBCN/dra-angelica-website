(() => {
  const listRoot = document.getElementById("blog-list-root");
  const stateEl = document.getElementById("blog-state");
  const MANIFEST_URL = "/assets/data/blog-posts.json";

  function fmtDate(value) {
    if (!value) return "";
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "";
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

  function coverFromPost(d) {
    if (d.coverImageUrl) {
      return {
        src: d.coverImageUrl,
        alt: d.coverImageAlt || d.title || "",
      };
    }
    const html = d.bodyHtml || "";
    const srcMatch = html.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
    if (!srcMatch) return null;
    const altMatch = html.match(/<img\b[^>]*\balt=["']([^"']*)["']/i);
    return {
      src: srcMatch[1],
      alt: altMatch?.[1] || d.title || "",
    };
  }

  function renderPosts(posts) {
    listRoot.replaceChildren();
    const frag = document.createDocumentFragment();
    posts.forEach((d) => {
      const slug = d.slug;
      if (!slug) return;
      const cover = coverFromPost(d);
      const media = cover
        ? `<div class="blog-card__media"><img class="blog-card__thumb" src="${esc(cover.src)}" alt="${esc(cover.alt)}" width="280" height="187" loading="lazy" decoding="async"></div>`
        : "";

      const a = document.createElement("a");
      a.href = `/blog/articulo?slug=${encodeURIComponent(slug)}`;
      a.className = "blog-card";
      a.innerHTML =
        `${media}<div class="blog-card__body">` +
        `<p class="blog-card__date">${esc(fmtDate(d.publishedAt))}</p>` +
        `<h2 class="blog-card__title">${esc(d.title || "Sin título")}</h2>` +
        `<p class="blog-card__excerpt">${esc(d.excerpt || "")}</p>` +
        `</div>`;
      frag.appendChild(a);
    });
    listRoot.appendChild(frag);
  }

  function showState(className, message) {
    stateEl.hidden = false;
    stateEl.className = className;
    stateEl.textContent = message;
  }

  function hideState() {
    stateEl.hidden = true;
    stateEl.textContent = "";
  }

  async function loadManifest() {
    const res = await fetch(MANIFEST_URL);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.posts) ? data.posts : null;
  }

  function loadFromFirestore() {
    const db = firebase.firestore();
    return db
      .collection("posts")
      .where("published", "==", true)
      .orderBy("publishedAt", "desc")
      .get()
      .then((snap) => {
        const posts = [];
        snap.forEach((doc) => {
          posts.push({ slug: doc.id, ...doc.data() });
        });
        return posts;
      });
  }

  async function init() {
    showState("blog-muted blog-state", "Cargando artículos…");

    try {
      const manifestPosts = await loadManifest();
      if (manifestPosts?.length) {
        renderPosts(manifestPosts);
        hideState();
        return;
      }
    } catch {
      /* fall through to Firestore */
    }

    if (!window.__blogFirebaseConfigured) {
      showState(
        "blog-error blog-state",
        "El blog necesita configuración técnica: complete web/blog/assets/js/firebase-config.js con los datos de Firebase (Consola → Ajustes del proyecto).",
      );
      return;
    }

    try {
      const posts = await loadFromFirestore();
      if (!posts.length) {
        showState("blog-muted blog-state", "Aún no hay artículos publicados. Vuelva pronto.");
        return;
      }
      renderPosts(posts);
      hideState();
    } catch {
      showState(
        "blog-error blog-state",
        "No se pudieron cargar los artículos. Inténtelo de nuevo más tarde.",
      );
    }
  }

  init();
})();
