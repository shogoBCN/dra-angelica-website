(function () {
  var yearEl = document.querySelector("[data-year]");
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  /* FormSubmit AJAX: evita redirección a formsubmit.co; requiere connect-src https://formsubmit.co en CSP. */
  var contactForm = document.querySelector(".contact-form");
  if (contactForm && window.fetch) {
    contactForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var errEl = document.getElementById("contact-form-error");
      var thanksEl = document.getElementById("contact-form-thanks");
      if (errEl) {
        errEl.hidden = true;
        errEl.textContent = "";
      }
      if (thanksEl) {
        thanksEl.hidden = true;
      }
      if (!contactForm.checkValidity()) {
        contactForm.reportValidity();
        return;
      }
      var submitBtn = contactForm.querySelector(".contact-form__submit");
      var actionUrl = contactForm.getAttribute("action") || "";
      var tail = actionUrl.split("formsubmit.co/").pop();
      if (!tail) return;
      var ajaxUrl = "https://formsubmit.co/ajax/" + tail;
      var payload = {};
      new FormData(contactForm).forEach(function (value, key) {
        payload[key] = value;
      });
      if (submitBtn) {
        submitBtn.disabled = true;
      }
      fetch(ajaxUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      })
        .then(function (response) {
          return response.json().then(function (data) {
            return { ok: response.ok, data: data };
          });
        })
        .then(function (result) {
          var data = result.data || {};
          var success =
            result.ok && (data.success === true || data.success === "true");
          if (success) {
            if (thanksEl) {
              thanksEl.hidden = false;
            }
            contactForm.reset();
            var contactSection = document.getElementById("contacto");
            if (contactSection) {
              requestAnimationFrame(function () {
                contactSection.scrollIntoView({ behavior: "smooth", block: "start" });
              });
            }
            if (errEl) {
              errEl.hidden = true;
            }
            return;
          }
          var msg =
            (data && data.message) ||
            "No se pudo enviar el mensaje. Compruebe su conexión e inténtelo de nuevo.";
          if (errEl) {
            errEl.textContent = msg;
            errEl.hidden = false;
          }
        })
        .catch(function () {
          if (errEl) {
            errEl.textContent =
              "No se pudo enviar el mensaje. Compruebe su conexión e inténtelo de nuevo.";
            errEl.hidden = false;
          }
        })
        .finally(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
          }
        });
    });
  }

  var header = document.querySelector("[data-header]");
  var toggle = document.querySelector("[data-menu-toggle]");
  var nav = document.querySelector("[data-nav]");
  var sectionLinks = document.querySelectorAll("[data-section-link]");
  var progressEl = document.querySelector(".scroll-progress");
  var revealEls = document.querySelectorAll("[data-reveal]");

  var sectionIds = [
    "inicio",
    "sobre-mi",
    "medicina-familiar",
    "servicios",
    "contacto",
  ];

  function setMenuOpen(open) {
    if (!toggle || !nav) return;
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    document.body.classList.toggle("nav-open", open);
  }

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = !nav.classList.contains("is-open");
      setMenuOpen(open);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setMenuOpen(false);
    });

    nav.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        if (window.matchMedia("(max-width: 899px)").matches) setMenuOpen(false);
      });
    });
  }

  function updateScrollProgress() {
    if (!progressEl) return;
    var doc = document.documentElement;
    var scrollTop = doc.scrollTop || document.body.scrollTop;
    var height = doc.scrollHeight - doc.clientHeight;
    var pct = height > 0 ? (scrollTop / height) * 100 : 0;
    progressEl.style.width = String(Math.min(100, Math.max(0, pct))) + "%";
  }

  window.addEventListener("scroll", updateScrollProgress, { passive: true });
  updateScrollProgress();

  function setActiveSection(id) {
    sectionIds.forEach(function (sid) {
      var active = sid === id;
      document.querySelectorAll('[data-target="' + sid + '"]').forEach(function (el) {
        el.classList.toggle("is-active", active);
      });
    });
    sectionLinks.forEach(function (link) {
      var href = link.getAttribute("href") || "";
      var hash = href.replace(/^#/, "");
      link.classList.toggle("is-active", hash === id);
    });
  }

  var observersSupported = "IntersectionObserver" in window;

  if (observersSupported) {
    var sectionObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && entry.intersectionRatio > 0) {
            setActiveSection(entry.target.id);
          }
        });
      },
      {
        root: null,
        rootMargin: "-42% 0px -48% 0px",
        threshold: [0, 0.08, 0.2],
      },
    );

    sectionIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) sectionObserver.observe(el);
    });
  }

  if (observersSupported && revealEls.length) {
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) entry.target.classList.add("is-visible");
        });
      },
      { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.1 },
    );

    revealEls.forEach(function (el) {
      revealObserver.observe(el);
    });
  } else {
    revealEls.forEach(function (el) {
      el.classList.add("is-visible");
    });
  }

  if (!observersSupported && sectionIds.length) {
    setActiveSection("inicio");
  }

  var MOBILE_INFOTIP_MQ = "(max-width: 639px)";

  function clearInfotipPanelStyles(panel) {
    panel.style.removeProperty("top");
    panel.style.removeProperty("bottom");
    panel.style.removeProperty("max-height");
  }

  /* Infotip: escritorio = arriba/abajo relativo al disparador; móvil = position fixed dentro del viewport */
  function positionInfotip(wrap) {
    var panel = wrap.querySelector(".infotip__panel");
    var trigger = wrap.querySelector(".infotip__trigger");
    if (!panel || !trigger) return;

    var isMobile = window.matchMedia(MOBILE_INFOTIP_MQ).matches;

    if (!isMobile) {
      clearInfotipPanelStyles(panel);
      var gap = 7;
      var tr = trigger.getBoundingClientRect();
      var ph = panel.offsetHeight || panel.getBoundingClientRect().height;
      if (ph < 40) ph = 200;

      var vv = window.visualViewport;
      var vh = vv ? vv.height : window.innerHeight;
      var spaceBelow = vh - tr.bottom - gap;
      var spaceAbove = tr.top - gap;

      var placeAbove = false;
      if (spaceBelow < ph && spaceAbove > spaceBelow) {
        placeAbove = true;
      } else if (spaceBelow < ph && spaceAbove < ph) {
        placeAbove = spaceAbove >= spaceBelow;
      }

      panel.classList.toggle("infotip__panel--above", placeAbove);
      return;
    }

    panel.classList.remove("infotip__panel--above");
    var gap = 8;
    var tr = trigger.getBoundingClientRect();
    var vv = window.visualViewport;
    var vh = vv ? vv.height : window.innerHeight;
    var pad = 12;

    panel.style.bottom = "auto";
    var top = tr.bottom + gap;
    panel.style.top = top + "px";

    var clamp = function () {
      var pr = panel.getBoundingClientRect();
      if (pr.bottom > vh - pad) {
        var delta = pr.bottom - (vh - pad);
        top = Math.max(pad, pr.top - delta);
        panel.style.top = top + "px";
        pr = panel.getBoundingClientRect();
      }
      if (pr.top < pad) {
        panel.style.top = pad + "px";
        pr = panel.getBoundingClientRect();
      }
      var maxH = vh - pad - pr.top;
      if (pr.height > maxH - 1 && maxH > 80) {
        panel.style.maxHeight = Math.round(maxH) + "px";
      } else {
        panel.style.removeProperty("max-height");
      }
    };

    requestAnimationFrame(function () {
      clamp();
      requestAnimationFrame(clamp);
    });
  }

  function infotipIsActive(wrap) {
    if (wrap.matches(":hover")) return true;
    var ae = document.activeElement;
    return !!(ae && wrap.contains(ae));
  }

  function repositionActiveInfotips() {
    document.querySelectorAll(".infotip").forEach(function (wrap) {
      if (infotipIsActive(wrap)) positionInfotip(wrap);
    });
  }

  document.querySelectorAll(".infotip").forEach(function (wrap) {
    var trigger = wrap.querySelector(".infotip__trigger");
    wrap.addEventListener("mouseenter", function () {
      positionInfotip(wrap);
    });
    wrap.addEventListener("focusin", function () {
      requestAnimationFrame(function () {
        positionInfotip(wrap);
        requestAnimationFrame(function () {
          positionInfotip(wrap);
        });
      });
    });
    if (trigger) {
      trigger.addEventListener("click", function () {
        requestAnimationFrame(function () {
          positionInfotip(wrap);
        });
      });
    }
  });

  window.addEventListener("scroll", repositionActiveInfotips, { passive: true });
  window.addEventListener("resize", repositionActiveInfotips, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("scroll", repositionActiveInfotips, { passive: true });
    window.visualViewport.addEventListener("resize", repositionActiveInfotips, { passive: true });
  }
})();
