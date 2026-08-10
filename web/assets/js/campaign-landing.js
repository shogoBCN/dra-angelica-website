/**
 * Google Ads campaign landing pages — shared business data + minimal UI.
 */

const BUSINESS_JSON_URL = "/assets/data/business.json";

function assetCacheQuery() {
  const version =
    document.body?.dataset?.assetVersion ||
    document.querySelector('meta[name="site-version"]')?.getAttribute("content");
  return version ? `?v=${encodeURIComponent(version)}` : "";
}

function businessJsonUrl() {
  return `${BUSINESS_JSON_URL}${assetCacheQuery()}`;
}

function setFooterYearCurrent() {
  const yearTarget = document.querySelector("[data-year]");
  if (yearTarget) yearTarget.textContent = String(new Date().getFullYear());
}

function attachScrollProgress() {
  const bar = document.querySelector(".scroll-progress");
  if (!bar) return;
  const update = () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? Math.min(100, (scrollTop / docHeight) * 100) : 0;
    bar.style.width = `${pct}%`;
  };
  update();
  window.addEventListener("scroll", update, { passive: true });
}

function attachRevealOnScroll(root) {
  const scope = root instanceof Element ? root : document;
  const blocks = scope.querySelectorAll("[data-reveal]:not(.is-visible)");
  if (!blocks.length) return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    },
    { rootMargin: "0px 0px -6% 0px", threshold: 0.06 }
  );
  blocks.forEach((el) => observer.observe(el));
}

/** @param {Record<string, unknown>} business */
function renderBusinessData(business) {
  const hoursList = document.querySelector("[data-hours-list]");
  const hoursNote = document.querySelector("[data-hours-note]");

  if (hoursList && business.openingHours?.display?.length) {
    hoursList.innerHTML = business.openingHours.display
      .filter((row) => !/^domingo$/i.test(String(row.days || "").trim()))
      .map(
        (row) =>
          `<li class="cita-hours__row"><span class="cita-hours__days">${row.days}</span><span class="cita-hours__time">${row.hours}</span></li>`
      )
      .join("");
  }

  if (hoursNote && business.openingHours?.note) {
    hoursNote.textContent = business.openingHours.note;
  }
}

async function loadBusinessData() {
  try {
    const res = await fetch(businessJsonUrl());
    if (!res.ok) return;
    const business = await res.json();
    renderBusinessData(business);
  } catch {
    /* static HTML fallback remains visible */
  }
}

setFooterYearCurrent();
attachScrollProgress();
attachRevealOnScroll();
loadBusinessData();
