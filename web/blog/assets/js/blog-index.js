(() => {
  const listRoot = document.getElementById("blog-list-root");
  const stateEl = document.getElementById("blog-state");
  const filterRoot = document.getElementById("blog-filter");
  const loadMoreEl = document.getElementById("blog-load-more");
  const scrollSentinel = document.getElementById("blog-scroll-sentinel");
  const MANIFEST_PATH = "/assets/data/blog-posts.json";
  const CATEGORY_REGISTRY_PATH = "/assets/data/blog-post-categories.json";
  const PAGE_SIZE = 20;

  const assets = window.__blogAssets;
  const cats = window.__blogCategories;

  /** @type {Array<Record<string, unknown>>} */
  let allPosts = [];
  let activeCategory = readCategoryFromUrl();
  let visibleCount = PAGE_SIZE;
  /** @type {IntersectionObserver | null} */
  let scrollObserver = null;

  function assetCacheQuery() {
    return assets.assetCacheQuery();
  }

  function readCategoryFromUrl() {
    const value = new URLSearchParams(window.location.search).get("categoria")?.trim();
    if (!value || !cats.LABELS[value]) return "";
    return value;
  }

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
        src: assets.bustAssetUrl(d.coverImageUrl),
        alt: d.coverImageAlt || d.title || "",
      };
    }
    const html = d.bodyHtml || "";
    const srcMatch = html.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
    if (!srcMatch) return null;
    const altMatch = html.match(/<img\b[^>]*\balt=["']([^"']*)["']/i);
    return {
      src: assets.bustAssetUrl(srcMatch[1]),
      alt: altMatch?.[1] || d.title || "",
    };
  }

  function mergeCategories(posts, registry) {
    return posts.map((post) => {
      const fromPost = cats.normalize(post.categories);
      if (fromPost.length) return { ...post, categories: fromPost };
      const fromRegistry = cats.normalize(registry?.[post.slug]);
      return { ...post, categories: fromRegistry };
    });
  }

  function filteredPosts() {
    if (!activeCategory) return allPosts;
    return allPosts.filter((post) => cats.normalize(post.categories).includes(activeCategory));
  }

  function createPostCard(d) {
    const slug = d.slug;
    const cover = coverFromPost(d);
    const media = cover
      ? `<div class="blog-card__media"><img class="blog-card__thumb" src="${esc(cover.src)}" alt="${esc(cover.alt)}" width="280" height="187" loading="lazy" decoding="async"></div>`
      : "";
    const tags = cats.tagsHtml(d.categories);

    const a = document.createElement("a");
    a.href = `/blog/articulo/${encodeURIComponent(slug)}/`;
    a.className = "blog-card";
    a.innerHTML =
      `${media}<div class="blog-card__body">` +
      `<p class="blog-card__date">${esc(fmtDate(d.publishedAt))}</p>` +
      (tags ? `<p class="blog-card__tags">${tags}</p>` : "") +
      `<h2 class="blog-card__title">${esc(d.title || "Sin título")}</h2>` +
      `<p class="blog-card__excerpt">${esc(d.excerpt || "")}</p>` +
      `</div>`;
    return a;
  }

  function updateLoadMoreUi(posts) {
    if (!loadMoreEl) return;
    const total = posts.length;
    const shown = Math.min(visibleCount, total);

    if (total <= PAGE_SIZE) {
      loadMoreEl.hidden = true;
      loadMoreEl.textContent = "";
      return;
    }

    loadMoreEl.hidden = false;
    if (shown >= total) {
      loadMoreEl.textContent = `Mostrando los ${total} artículos.`;
      return;
    }

    loadMoreEl.textContent = `Mostrando ${shown} de ${total} artículos. Desplácese para ver más.`;
  }

  function syncList() {
    const posts = filteredPosts();

    if (!posts.length) {
      listRoot.replaceChildren();
      showState(
        "blog-muted blog-state",
        activeCategory
          ? "No hay artículos en esta categoría por ahora."
          : "Aún no hay artículos publicados. Vuelva pronto.",
      );
      updateLoadMoreUi(posts);
      return;
    }

    hideState();
    const toShow = posts.slice(0, visibleCount);
    const frag = document.createDocumentFragment();
    toShow.forEach((post) => {
      if (!post.slug) return;
      frag.appendChild(createPostCard(post));
    });
    listRoot.replaceChildren();
    listRoot.appendChild(frag);
    updateLoadMoreUi(posts);
  }

  function loadMoreIfNeeded() {
    const posts = filteredPosts();
    if (visibleCount >= posts.length) return;
    visibleCount = Math.min(visibleCount + PAGE_SIZE, posts.length);
    syncList();
  }

  function setupInfiniteScroll() {
    if (!scrollSentinel || scrollObserver) return;
    scrollObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMoreIfNeeded();
        }
      },
      { root: null, rootMargin: "240px 0px", threshold: 0 },
    );
    scrollObserver.observe(scrollSentinel);
  }

  function renderFilters(posts) {
    if (!filterRoot) return;
    const available = cats.collectFromPosts(posts);
    if (!available.length) {
      filterRoot.hidden = true;
      filterRoot.replaceChildren();
      return;
    }

    filterRoot.hidden = false;
    filterRoot.replaceChildren();

    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "blog-filter__btn";
    allBtn.dataset.category = "";
    allBtn.textContent = "Todos";
    filterRoot.appendChild(allBtn);

    available.forEach((slug) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "blog-filter__btn";
      btn.dataset.category = slug;
      btn.textContent = cats.label(slug);
      filterRoot.appendChild(btn);
    });

    updateFilterButtons();
  }

  function updateFilterButtons() {
    if (!filterRoot) return;
    filterRoot.querySelectorAll(".blog-filter__btn").forEach((btn) => {
      const match = (btn.dataset.category || "") === activeCategory;
      btn.classList.toggle("is-active", match);
      btn.setAttribute("aria-pressed", match ? "true" : "false");
    });
  }

  function syncCategoryUrl() {
    const url = new URL(window.location.href);
    if (activeCategory) url.searchParams.set("categoria", activeCategory);
    else url.searchParams.delete("categoria");
    window.history.replaceState(null, "", url);
  }

  function setActiveCategory(category) {
    const next = category && cats.LABELS[category] ? category : "";
    if (next === activeCategory) return;
    activeCategory = next;
    visibleCount = PAGE_SIZE;
    syncCategoryUrl();
    updateFilterButtons();
    syncList();
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
    const res = await fetch(`${MANIFEST_PATH}${assetCacheQuery()}`);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.posts) ? data.posts : null;
  }

  async function loadCategoryRegistry() {
    try {
      const res = await fetch(`${CATEGORY_REGISTRY_PATH}${assetCacheQuery()}`);
      if (!res.ok) return {};
      return await res.json();
    } catch {
      return {};
    }
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

  function bindFilterClicks() {
    if (!filterRoot) return;
    filterRoot.addEventListener("click", (event) => {
      const btn = event.target.closest(".blog-filter__btn");
      if (!btn || !filterRoot.contains(btn)) return;
      setActiveCategory(btn.dataset.category || "");
    });
  }

  function finishInit() {
    renderFilters(allPosts);
    syncList();
    setupInfiniteScroll();
  }

  async function init() {
    showState("blog-muted blog-state", "Cargando artículos…");
    bindFilterClicks();

    const registry = await loadCategoryRegistry();

    try {
      const manifestPosts = await loadManifest();
      if (manifestPosts?.length) {
        allPosts = mergeCategories(manifestPosts, registry);
        finishInit();
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
      allPosts = mergeCategories(posts, registry);
      if (!allPosts.length) {
        showState("blog-muted blog-state", "Aún no hay artículos publicados. Vuelva pronto.");
        return;
      }
      finishInit();
    } catch {
      showState(
        "blog-error blog-state",
        "No se pudieron cargar los artículos. Inténtelo de nuevo más tarde.",
      );
    }
  }

  init();
})();
