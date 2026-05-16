(() => {
  let quill;

  function slugify(s) {
    const raw = String(s || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
    const cleaned = raw.replace(/^-|-$/g, "");
    return cleaned || "articulo";
  }

  function validSlug(sl) {
    return (
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sl) &&
      sl.length >= 2 &&
      sl.length <= 96
    );
  }

  const elLogin = document.getElementById("blog-admin-login");
  const elApp = document.getElementById("blog-admin-app");
  const elAuthError = document.getElementById("blog-admin-auth-error");
  const elFormError = document.getElementById("blog-admin-form-error");
  const elFormOk = document.getElementById("blog-admin-form-ok");
  const elPostList = document.getElementById("blog-admin-post-list");
  const fldTitle = document.getElementById("fld-title");
  const fldSlug = document.getElementById("fld-slug");
  const fldExcerpt = document.getElementById("fld-excerpt");
  const fldPublished = document.getElementById("fld-published");
  const btnNew = document.getElementById("btn-new");
  const btnSave = document.getElementById("btn-save");
  const btnDelete = document.getElementById("btn-delete");
  const fldSlugLocked = document.getElementById("fld-slug-locked-msg");

  let currentSlug = null;
  /** @type {{ published?: boolean }} | null */
  let originalData = null;
  let slugManual = false;

  function flashFormError(msg) {
    elFormOk.hidden = true;
    elFormError.textContent = msg || "";
    elFormError.hidden = !msg;
  }

  function flashFormOk(msg) {
    elFormError.hidden = true;
    elFormOk.textContent = msg;
    elFormOk.hidden = false;
  }

  function clearFeedback() {
    elFormOk.hidden = true;
    elFormError.hidden = true;
  }

  function clearForm() {
    currentSlug = null;
    originalData = null;
    slugManual = false;
    fldSlug.removeAttribute("readonly");
    fldSlugLocked.hidden = true;
    fldTitle.value = "";
    fldSlug.value = "";
    fldExcerpt.value = "";
    fldPublished.checked = false;
    btnDelete.hidden = true;
    if (quill) quill.setContents([]);
    clearFeedback();
    fldTitle.focus();
  }

  function loadIntoForm(slug, data) {
    currentSlug = slug;
    originalData = { published: !!data.published };
    slugManual = true;
    fldTitle.value = data.title || "";
    fldSlug.value = slug;
    fldSlug.readOnly = true;
    fldSlugLocked.hidden = false;
    fldExcerpt.value = data.excerpt || "";
    fldPublished.checked = !!data.published;
    if (quill) {
      quill.clipboard.dangerouslyPasteHTML(data.bodyHtml || "");
    }
    btnDelete.hidden = false;
    clearFeedback();
  }

  function renderPostList(snap, activeSlug) {
    elPostList.textContent = "";
    if (!snap || snap.empty) {
      elPostList.innerHTML =
        '<p class="blog-admin-empty">Ningún artículo guardado.</p>';
      return;
    }
    const frag = document.createDocumentFragment();
    snap.forEach((doc) => {
      const d = doc.data();
      const slug = doc.id;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `blog-admin-list-item${slug === activeSlug ? " is-active" : ""}`;
      const st = d.published ? "" : " <span class='draft-tag'>borrador</span>";
      btn.innerHTML = `${d.title || "Sin título"}${st} <span class='slug-label'>(${slug})</span>`;
      btn.addEventListener("click", async () => {
        const ds = await firebase.firestore().collection("posts").doc(slug).get();
        if (ds.exists) loadIntoForm(slug, ds.data());
      });
      frag.appendChild(btn);
    });
    elPostList.appendChild(frag);
  }

  async function refreshList() {
    const user = firebase.auth().currentUser;
    if (!user) return null;
    const snap = await firebase
      .firestore()
      .collection("posts")
      .orderBy("updatedAt", "desc")
      .get()
      .catch(() => null);
    if (!snap) return null;
    renderPostList(snap, currentSlug);
    return snap;
  }

  if (!window.__blogFirebaseConfigured) {
    elLogin.hidden = true;
    elApp.hidden = true;
    document.getElementById("blog-admin-config-warning").hidden = false;
    return;
  }

  quill = new Quill("#editor", {
    theme: "snow",
    modules: {
      toolbar: [
        [{ header: [1, 2, 3, false] }],
        ["bold", "italic", "underline", "strike"],
        ["blockquote"],
        [{ list: "ordered" }, { list: "bullet" }],
        ["link"],
        ["clean"],
      ],
    },
    placeholder: "Escriba el artículo…",
  });

  firebase.auth().onAuthStateChanged((user) => {
    if (user) {
      elLogin.hidden = true;
      elApp.hidden = false;
      elAuthError.hidden = true;
      clearForm();
      refreshList().catch(() => {});
    } else {
      elLogin.hidden = false;
      elApp.hidden = true;
    }
  });

  document.getElementById("form-login").addEventListener("submit", (e) => {
    e.preventDefault();
    elAuthError.hidden = true;
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    firebase
      .auth()
      .signInWithEmailAndPassword(email, password)
      .catch(() => {
        elAuthError.hidden = false;
        elAuthError.textContent = "Usuario o contraseña incorrectos.";
      });
  });

  document.getElementById("btn-logout").addEventListener("click", () => {
    firebase.auth().signOut();
  });

  btnNew.addEventListener("click", () => {
    clearForm();
    refreshList().catch(() => {});
  });

  fldTitle.addEventListener("input", () => {
    if (currentSlug && fldSlug.readOnly) return;
    if (!slugManual) fldSlug.value = slugify(fldTitle.value);
  });

  fldSlug.addEventListener("input", () => {
    slugManual = true;
    fldSlug.value = slugify(fldSlug.value.replace(/\s+/g, "-"));
  });

  fldSlug.addEventListener("focus", () => {
    slugManual = true;
  });

  btnSave.addEventListener("click", async () => {
    clearFeedback();
    const title = fldTitle.value.trim();
    const excerpt = fldExcerpt.value.trim();
    const published = fldPublished.checked;
    let docSlug =
      currentSlug || slugify((fldSlug.value.trim() || title).replace(/\s+/g, "-"));

    if (!title) {
      flashFormError("Falta el título.");
      return;
    }
    const bodyHtml = quill ? quill.root.innerHTML.trim() : "";
    if (!bodyHtml || bodyHtml === "<p><br></p>") {
      flashFormError("Escriba el texto del artículo.");
      return;
    }

    if (!currentSlug && fldSlug.value.trim()) {
      docSlug = slugify(fldSlug.value.trim());
    }

    if (!validSlug(docSlug)) {
      flashFormError(
        "Use un identificador (slug) tipo «mi-articulo» (solo letras minúsculas, números y guiones)."
      );
      return;
    }

    const ref = firebase.firestore().collection("posts").doc(docSlug);
    const prevSnap = await ref.get();

    let prevPublished = originalData?.published;
    if (prevSnap.exists) {
      const pd = prevSnap.data();
      prevPublished = !!pd?.published;
    }

    if (!currentSlug && prevSnap.exists) {
      flashFormError("Ya existe un artículo con ese slug; cambie el identificador.");
      return;
    }

    /** @type {Record<string, unknown>} */
    const patch = {
      title,
      excerpt,
      slug: docSlug,
      bodyHtml,
      published,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    if (!prevSnap.exists) {
      patch.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    }

    if (published && prevPublished !== true) {
      patch.publishedAt = firebase.firestore.FieldValue.serverTimestamp();
    }

    try {
      await ref.set(patch, { merge: true });
      originalData = { published };
      currentSlug = docSlug;
      fldSlug.value = docSlug;
      fldSlug.readOnly = true;
      fldSlugLocked.hidden = false;
      btnDelete.hidden = false;
      await refreshList();
      flashFormOk("Guardado correctamente.");
    } catch (_e) {
      flashFormError(
        "No se pudo guardar. Compruebe que este usuario aparece como editor en firebase/firestore.rules."
      );
    }
  });

  btnDelete.addEventListener("click", async () => {
    if (!currentSlug) return;
    if (!confirm(`¿Eliminar definitivamente «${currentSlug}»?`)) return;
    clearFeedback();
    try {
      await firebase.firestore().collection("posts").doc(currentSlug).delete();
      clearForm();
      await refreshList();
      flashFormOk("Artículo eliminado.");
    } catch (_e) {
      flashFormError("No se pudo borrar este artículo.");
    }
  });
})();
