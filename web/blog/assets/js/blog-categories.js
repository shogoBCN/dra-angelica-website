(() => {
  /** @type {Record<string, string>} */
  const LABELS = {
    hipertension: "Hipertensión",
    diabetes: "Diabetes",
    prevencion: "Prevención",
    "medicina-familiar": "Medicina familiar",
  };

  const ORDER = ["hipertension", "diabetes", "prevencion", "medicina-familiar"];
  /** Broad filter tags — not used to suggest "Ver también" links. */
  const RELATED_TOPIC_SLUGS = ["hipertension", "diabetes", "medicina-familiar"];

  function normalize(categories) {
    if (!Array.isArray(categories)) return [];
    return categories.filter((c) => typeof c === "string" && LABELS[c]);
  }

  function label(slug) {
    return LABELS[slug] || slug;
  }

  function sortedUnique(categories) {
    const set = new Set(normalize(categories));
    return ORDER.filter((slug) => set.has(slug));
  }

  function collectFromPosts(posts) {
    const set = new Set();
    posts.forEach((post) => {
      normalize(post.categories).forEach((slug) => set.add(slug));
    });
    return ORDER.filter((slug) => set.has(slug));
  }

  function relatedTopics(categories) {
    return normalize(categories).filter((slug) => RELATED_TOPIC_SLUGS.includes(slug));
  }

  function tagsHtml(categories, { link = false } = {}) {
    const slugs = sortedUnique(categories);
    if (!slugs.length) return "";
    return slugs
      .map((slug) => {
        const text = label(slug);
        if (link) {
          return `<a class="blog-tag" href="/blog/?categoria=${encodeURIComponent(slug)}">${text}</a>`;
        }
        return `<span class="blog-tag">${text}</span>`;
      })
      .join("");
  }

  window.__blogCategories = {
    LABELS,
    ORDER,
    normalize,
    label,
    sortedUnique,
    relatedTopics,
    collectFromPosts,
    tagsHtml,
  };
})();
