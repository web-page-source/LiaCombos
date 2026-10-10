/* =========================================================
   LOS COMBOS DE LÍA — common.js
   Utilidades compartidas: loading screen, transiciones de pantalla,
   corazones, avisos emergentes y partículas mágicas.
   ========================================================= */
(function () {
  "use strict";

  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const rand = (a, b) => a + Math.random() * (b - a);

  /* ---------- ¿Llegamos desde la transición de corazón? ---------- */
  let arrival = null;
  try {
    arrival = JSON.parse(sessionStorage.getItem("lia-arrive"));
    sessionStorage.removeItem("lia-arrive");
  } catch { arrival = null; }
  if (arrival && typeof arrival.x === "number") root.classList.add("arriving-heart");
  else arrival = null;

  /* ---------- Sprite SVG (corazón) ---------- */
  const SPRITE = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="g-heart" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7A6BC6"/><stop offset="1" stop-color="#463B8C"/></linearGradient>
    <linearGradient id="g-curtain" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#D8D0F0"/><stop offset=".55" stop-color="#B9ADE2"/><stop offset="1" stop-color="#9C8ED8"/></linearGradient>
    <symbol id="i-heart" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></symbol>
  </defs>
</svg>`;

  /* ---------- Avisos emergentes (arriba al centro) ----------
     Con opts.key se reutiliza el mismo aviso: si se agrega varias veces
     seguidas, el aviso rebota y reinicia su tiempo en vez de apilarse. */
  function toast(message, type = "info", ms = 2600, opts = {}) {
    let box = document.getElementById("toasts");
    if (!box) {
      box = document.createElement("div");
      box.id = "toasts";
      box.className = "toasts";
      box.setAttribute("role", "status");
      box.setAttribute("aria-live", "polite");
      document.body.appendChild(box);
    }
    let el = opts.key ? box.querySelector(`[data-key="${opts.key}"]`) : null;
    if (!el) {
      el = document.createElement("div");
      el.className = `toast ${type}`;
      if (opts.key) el.dataset.key = opts.key;
      el.innerHTML = '<span class="toast-dot"></span><span class="toast-text"><b></b><small></small></span>';
      box.appendChild(el);
      requestAnimationFrame(() => el.classList.add("in"));
    }
    el.querySelector("b").textContent = message;
    const small = el.querySelector("small");
    small.textContent = opts.sub || "";
    small.hidden = !opts.sub;
    el.classList.remove("bounce");
    void el.offsetWidth;
    el.classList.add("bounce");
    clearTimeout(el._timer);
    el._timer = setTimeout(() => {
      el.classList.remove("in");
      setTimeout(() => el.remove(), 450);
    }, ms);
  }

  /* ---------- Corazones: explosión y transición de pantalla ---------- */
  function burstHearts(x, y, count = 12) {
    if (reduceMotion) return;
    for (let i = 0; i < count; i++) {
      const el = document.createElement("span");
      el.className = "burst-heart";
      el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-heart" fill="url(#g-heart)"/></svg>';
      const angle = (Math.PI * 2 * i) / count + rand(-.3, .3);
      const dist = rand(60, 150);
      el.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(angle) * dist}px;--dy:${Math.sin(angle) * dist - 40}px;--sc:${rand(.6, 1.2).toFixed(2)};--rot:${Math.round(rand(-40, 40))}deg`;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1100);
    }
  }

  function getCurtain() {
    let curtain = document.querySelector(".heart-curtain");
    if (!curtain) {
      curtain = document.createElement("div");
      curtain.className = "heart-curtain";
      curtain.setAttribute("aria-hidden", "true");
      curtain.innerHTML = '<svg viewBox="0 0 24 24"><use href="#i-heart" fill="url(#g-curtain)"/></svg>';
      document.body.appendChild(curtain);
    }
    return curtain;
  }

  /* Un corazón crece desde (x, y) hasta cubrir toda la pantalla */
  async function heartTransition(x, y) {
    const curtain = getCurtain();
    curtain.style.setProperty("--hx", x + "px");
    curtain.style.setProperty("--hy", y + "px");
    curtain.classList.remove("no-anim", "is-covering");
    curtain.classList.add("is-active");
    void curtain.offsetWidth;
    curtain.classList.add("is-covering");
    try { sessionStorage.setItem("lia-arrive", JSON.stringify({ x, y })); } catch { /* ignorar */ }
    await sleep(reduceMotion ? 60 : 950);
  }

  function resetCurtain() {
    const curtain = document.querySelector(".heart-curtain");
    if (curtain) curtain.classList.remove("is-active", "is-covering");
    try { sessionStorage.removeItem("lia-arrive"); } catch { /* ignorar */ }
  }

  /* En la página nueva, el corazón se encoge y revela el contenido */
  function playArrival() {
    const curtain = getCurtain();
    curtain.style.setProperty("--hx", arrival.x + "px");
    curtain.style.setProperty("--hy", arrival.y + "px");
    curtain.classList.add("is-active", "is-covering", "no-anim");
    root.classList.remove("arriving-heart");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      curtain.classList.remove("no-anim", "is-covering");
      setTimeout(() => curtain.classList.remove("is-active"), 1000);
    }));
  }

  /* ---------- Navegación con fundido entre pantallas ---------- */
  function go(href) {
    root.classList.add("page-leaving");
    setTimeout(() => { window.location.href = href; }, reduceMotion ? 0 : 320);
  }

  function bindPageLinks() {
    document.addEventListener("click", event => {
      const link = event.target.closest("a[href]");
      if (!link || link.target === "_blank" || event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      let url;
      try { url = new URL(link.href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.hash) return;
      event.preventDefault();
      go(url.href);
    });
    window.addEventListener("pageshow", event => {
      root.classList.remove("page-leaving");
      if (event.persisted) resetCurtain();
    });
  }

  /* ---------- Partículas mágicas ---------- */
  function magic(container) {
    if (!container || reduceMotion) return;
    const small = window.matchMedia("(max-width: 650px)").matches;
    const total = small ? 14 : 26;
    const colors = ["#E58AB6", "#9D8FE0", "#7FA3E6", "#6CC2AA", "#F2B3D0", "#FFF3DC", "#B7A8F0"];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < total; i++) {
      const roll = i % 10;
      const kind = roll < 4 ? "heart" : roll < 7 ? "sparkle" : "bubble";
      const el = document.createElement("span");
      el.className = "particle " + (kind === "heart" ? "" : kind);
      el.setAttribute("aria-hidden", "true");
      if (kind === "heart") el.textContent = Math.random() > .5 ? "♥\uFE0E" : "♡\uFE0E";
      if (kind === "sparkle") el.textContent = Math.random() > .5 ? "✦\uFE0E" : "✧\uFE0E";
      const size = kind === "bubble" ? rand(16, 46) : rand(14, 34);
      el.style.cssText = [
        `--x:${rand(2, 96).toFixed(1)}%`,
        `--y:${rand(6, 88).toFixed(1)}%`,
        `--s:${size.toFixed(0)}px`,
        `--d:${rand(kind === "sparkle" ? 2.4 : 9, kind === "sparkle" ? 5 : 18).toFixed(1)}s`,
        `--delay:${(-rand(0, 14)).toFixed(1)}s`,
        `--drift:${rand(-80, 80).toFixed(0)}px`,
        `--rot:${rand(-50, 50).toFixed(0)}deg`,
        `--pc:${colors[Math.floor(Math.random() * colors.length)]}`
      ].join(";");
      frag.appendChild(el);
    }
    container.appendChild(frag);
  }

  /* ---------- Animaciones suaves al hacer scroll ---------- */
  let revealObserver = null;
  function observeReveals(scope = document) {
    const items = scope.querySelectorAll(".reveal:not(.in)");
    if (!("IntersectionObserver" in window) || reduceMotion) { items.forEach(el => el.classList.add("in")); return; }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) { entry.target.classList.add("in"); revealObserver.unobserve(entry.target); }
        });
      }, { threshold: .12, rootMargin: "0px 0px -40px 0px" });
    }
    items.forEach(el => revealObserver.observe(el));
  }

  /* ---------- Loading screen ----------
     Se oculta en cuanto el HTML está listo (mínimo 750 ms para que se vea),
     sin esperar fuentes ni imágenes. */
  function setupLoader() {
    const loader = document.getElementById("page-loader");
    if (!loader) return;
    const wait = arrival ? 0 : 750;
    setTimeout(() => { loader.classList.add("is-done"); setTimeout(() => loader.remove(), 700); }, wait);
  }

  /* ---------- Utilidades ---------- */
  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  /* Precio con dos decimales y la unidad después del número:
     25 → "25.00 USD" · 25.5 → "25.50 USD" · 1250 → "1,250.00 USD" */
  function money(value) {
    const amount = Number(value) || 0;
    const text = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
    return `${text} USD`;
  }

  /* ---------- Categorías: agrupa y ordena alfabéticamente ----------
     Devuelve [{ name, items: [...] }]. Las categorías y los combos de cada
     una van en orden alfabético; "Sin categoría" siempre queda al final. */
  const NO_CATEGORY = "Sin categoría";
  const byText = (a, b) => String(a).localeCompare(String(b), "es", { sensitivity: "base" });
  function groupByCategory(list) {
    const groups = new Map();
    list.forEach(item => {
      const label = String(item.categoria || "").trim() || NO_CATEGORY;
      const key = label.toLowerCase();
      if (!groups.has(key)) groups.set(key, { name: label, items: [] });
      groups.get(key).items.push(item);
    });
    const result = [...groups.values()];
    result.forEach(group => group.items.sort((a, b) => byText(a.nombre || "", b.nombre || "")));
    result.sort((a, b) => {
      if (a.name === NO_CATEGORY) return 1;
      if (b.name === NO_CATEGORY) return -1;
      return byText(a.name, b.name);
    });
    return result;
  }

  /* ---------- Arranque ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    const step = fn => { try { fn(); } catch (error) { console.error(error); } };
    step(setupLoader);
    step(() => document.body.insertAdjacentHTML("afterbegin", SPRITE));
    if (arrival) step(playArrival);
    step(() => magic(document.getElementById("magic-field")));
    step(observeReveals);
    step(bindPageLinks);
  });

  window.Lia = { money, escapeHtml, toast, sleep, burstHearts, heartTransition, resetCurtain, observeReveals, go, groupByCategory, byText };
})();
