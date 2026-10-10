
(() => {
  "use strict";

  /* Si common.js no cargó (o es una versión vieja), se avisa en pantalla */
  if (!window.Lia || typeof window.Lia.groupByCategory !== "function") {
    document.addEventListener("DOMContentLoaded", () => {
      document.getElementById("page-loader")?.remove();
      document.body.insertAdjacentHTML("afterbegin", '<p style="margin:24px;padding:18px;border-radius:18px;background:#EDE8F1;color:#A3446A;font:700 16px sans-serif">Falta el archivo <b>common.js</b> actualizado en la misma carpeta. Copia la versión más reciente de todos los archivos y recarga con Ctrl+F5.</p>');
    });
    return;
  }

  const { money, escapeHtml: esc, toast, sleep, burstHearts, heartTransition, resetCurtain, observeReveals, go, groupByCategory, byText } = window.Lia;

  const ENV = window.ENV || {};
  const SUPABASE_URL = ENV.SUPABASE_URL || "";
  const SUPABASE_KEY = ENV.SUPABASE_KEY || ENV.SUPABASE_ANON_KEY || "";
  const ADMIN_WHATSAPP = String(ENV.ADMIN_WHATSAPP || "");
  const configured = SUPABASE_URL && SUPABASE_KEY && !SUPABASE_URL.includes("TU-PROYECTO") && !SUPABASE_KEY.includes("TU_ANON_KEY");
  const sb = configured && window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

  const $ = id => document.getElementById(id);
  const MAX_QTY = 99;
  const DEFAULT_DESC = "Opción disponible para solicitar y entregada con seguridad.";

  /* ---------- Carrito ----------
     Vive solo en memoria: cada vez que se entra a la página empieza vacío.
     Al presionar Ordenar se pasa (ids y cantidades) al formulario mediante
     sessionStorage, y el catálogo lo borra al volver a abrirse. */
  const ORDER_KEY = "lia-order";
  let cart = {};
  function readOrder() {
    try {
      const raw = JSON.parse(sessionStorage.getItem(ORDER_KEY) || "{}");
      const clean = {};
      for (const [id, qty] of Object.entries(raw || {})) {
        const n = Math.floor(Number(qty));
        if (n > 0) clean[id] = Math.min(n, MAX_QTY);
      }
      return clean;
    } catch { return {}; }
  }
  function saveOrder() { try { sessionStorage.setItem(ORDER_KEY, JSON.stringify(cart)); } catch { /* sin almacenamiento */ } }
  function resetCart() {
    cart = {};
    try { sessionStorage.removeItem(ORDER_KEY); localStorage.removeItem("lia-cart"); } catch { /* ignorar */ }
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("year")?.replaceChildren(String(new Date().getFullYear()));
    if ($("combo-grid")) initCatalog();
    if ($("order-form")) initOrder();
  });

  /* =====================================================
     CATÁLOGO + CARRITO
     ===================================================== */
  let combos = [];
  let ordering = false;
  let lastFocus = null;

  const findCombo = id => combos.find(c => String(c.id) === String(id));
  const totalQty = () => Object.values(cart).reduce((sum, q) => sum + q, 0);
  function cartLines() {
    return combos
      .filter(c => cart[String(c.id)] > 0)
      .map(c => ({ combo: c, qty: cart[String(c.id)] }))
      .sort((a, b) => byText(a.combo.nombre || "", b.combo.nombre || ""));
  }
  const cartTotal = () => cartLines().reduce((sum, l) => sum + (Number(l.combo.precio) || 0) * l.qty, 0);

  /* Evita que la consulta se quede esperando para siempre */
  const withTimeout = (promise, ms = 25000) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("La base de datos tardó demasiado en responder.")), ms))
  ]);

  async function fetchCombos() {
    const base = "id,nombre,foto,precio,descripcion,activo";
    let res = await withTimeout(sb.from("combos").select(`${base},categoria`).eq("activo", true));
    // Si todavía no se ejecutó supabase.sql (columna "categoria"), carga igual sin categorías
    if (res.error && /categoria/i.test(res.error.message || "")) {
      res = await withTimeout(sb.from("combos").select(base).eq("activo", true));
    }
    return res;
  }

  function setState(state) {
    const map = { loading: "loading", ready: "combo-grid", empty: "empty-state", error: "error-state", config: "config-state" };
    Object.values(map).forEach(id => $(id)?.classList.add("is-hidden"));
    $(map[state])?.classList.remove("is-hidden");
  }

  function initCatalog() {
    resetCart();
    $("retry-btn").addEventListener("click", loadCombos);

    const grid = $("combo-grid");
    grid.addEventListener("click", event => {
      const card = event.target.closest(".combo-card");
      if (card) addToCart(card.dataset.id, card, event.clientX, event.clientY);
    });
    grid.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const card = event.target.closest(".combo-card");
      if (!card) return;
      event.preventDefault();
      addToCart(card.dataset.id, card);
    });

    $("cart-btn").addEventListener("click", openCart);
    $("order-btn").addEventListener("click", () => goToOrder($("order-btn")));
    $("cart-order").addEventListener("click", () => goToOrder($("cart-order")));
    $("cart-continue").addEventListener("click", closeCart);
    $("cart-close").addEventListener("click", closeCart);
    $("cart-clear").addEventListener("click", () => { cart = {}; updateUI(); });
    $("cart-modal").addEventListener("click", event => { if (event.target.id === "cart-modal") closeCart(); });
    document.addEventListener("keydown", event => { if (event.key === "Escape") closeCart(); });
    $("cart-items").addEventListener("click", event => {
      const inc = event.target.closest("[data-inc]");
      const dec = event.target.closest("[data-dec]");
      if (inc) changeQty(inc.dataset.inc, +1);
      else if (dec) changeQty(dec.dataset.dec, -1);
    });

    window.addEventListener("pageshow", event => {
      if (event.persisted) { ordering = false; $("order-btn").disabled = false; resetCurtain(); resetCart(); updateUI(); }
    });

    updateUI();
    loadCombos();
  }

  async function loadCombos() {
    setState("loading");
    if (!sb) { setState(configured ? "error" : "config"); return; }
    try {
      const { data, error } = await fetchCombos();
      if (error) throw error;
      combos = data || [];
      // Quita del carrito lo que ya no existe o ya no está visible
      Object.keys(cart).forEach(id => { if (!findCombo(id)) delete cart[id]; });
      if (!combos.length) { setState("empty"); updateUI(); return; }
      renderCatalog();
      setState("ready");
      updateUI();
    } catch (error) {
      console.error(error);
      setState("error");
      toast("No pudimos cargar los combos", "error", 4000, { key: "load" });
    }
  }

  function cardHtml(combo, index) {
    const name = combo.nombre || `Combo ${index + 1}`;
    const description = (combo.descripcion || "").trim() || DEFAULT_DESC;
    const qty = cart[String(combo.id)] || 0;
    const photo = combo.foto
      ? `<img src="${esc(combo.foto)}" alt="Foto del combo ${esc(name)}" loading="lazy" decoding="async" width="640" height="480">`
      : `<div class="photo-placeholder" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="#i-heart" fill="url(#g-heart)"/></svg></div>`;
    return `<div class="combo-slot reveal" style="--i:${index % 6}">
      <article class="combo-card${qty ? " in-cart" : ""}" data-id="${esc(combo.id)}" tabindex="0" role="button" aria-label="Agregar ${esc(name)} al carrito">
        <span class="heart-badge" role="img" aria-label="${qty} en el carrito">
          <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-heart" fill="url(#g-heart)"/></svg>
          <b class="heart-count">${qty}</b>
        </span>
        <div class="combo-photo">${photo}</div>
        <div class="combo-content">
          <h3>${esc(name)}</h3>
          <p class="combo-description">${esc(description)}</p>
          <span class="price">${money(combo.precio)}</span>
        </div>
      </article>
    </div>`;
  }

  /* Categorías como subtítulo, con sus combos debajo (todo alfabético) */
  function renderCatalog() {
    const grid = $("combo-grid");
    grid.innerHTML = groupByCategory(combos).map(group => `
      <section class="category" aria-label="${esc(group.name)}">
        <h3 class="category-title">${esc(group.name)}</h3>
        <div class="combo-grid">${group.items.map(cardHtml).join("")}</div>
      </section>`).join("");
    observeReveals(grid);
  }

  /* Cada toque en una card suma 1: dos toques = dos unidades */
  function addToCart(id, card, x, y) {
    const combo = findCombo(id);
    if (!combo) return;
    const key = String(id);
    if ((cart[key] || 0) >= MAX_QTY) return;
    cart[key] = (cart[key] || 0) + 1;
    updateUI(id);

    if (card) {
      card.classList.remove("added"); void card.offsetWidth; card.classList.add("added");
      const rect = card.getBoundingClientRect();
      burstHearts(x || rect.left + rect.width / 2, y || rect.top + rect.height / 2, 6);
    }
    pulseCart();
  }

  function pulseCart() {
    const btn = $("cart-btn");
    btn.classList.remove("pulse"); void btn.offsetWidth; btn.classList.add("pulse");
    setTimeout(() => btn.classList.remove("pulse"), 800);
  }

  function changeQty(id, delta) {
    const key = String(id);
    const next = (cart[key] || 0) + delta;
    if (next <= 0) delete cart[key]; else cart[key] = Math.min(next, MAX_QTY);
    updateUI();
  }

  /* Sincroniza tarjetas, ícono del carrito, barra Ordenar y modal */
  function updateUI(bumpId = null) {
    document.querySelectorAll(".combo-card").forEach(card => {
      const qty = cart[card.dataset.id] || 0;
      card.classList.toggle("in-cart", qty > 0);
      const badge = card.querySelector(".heart-badge");
      badge.querySelector(".heart-count").textContent = qty;
      badge.setAttribute("aria-label", `${qty} en el carrito`);
      if (bumpId !== null && card.dataset.id === String(bumpId)) {
        badge.classList.remove("bump"); void badge.offsetWidth; badge.classList.add("bump");
      }
    });

    const qty = totalQty();
    const count = $("cart-count");
    count.textContent = qty > MAX_QTY ? `${MAX_QTY}+` : qty;
    count.hidden = qty === 0;
    $("cart-btn").classList.toggle("has-items", qty > 0);
    $("cart-btn").setAttribute("aria-label", qty ? `Abrir carrito, ${qty} ${qty === 1 ? "producto" : "productos"}` : "Abrir carrito");

    const orderBtn = $("order-btn");
    orderBtn.classList.toggle("show", qty > 0);
    orderBtn.inert = qty === 0;

    if ($("cart-modal").classList.contains("open")) renderCartModal();
  }

  /* ---------- Modal del carrito ---------- */
  function renderCartModal() {
    const lines = cartLines();
    const list = $("cart-items");
    const scroll = list.scrollTop;
    list.innerHTML = lines.map(({ combo, qty }) => {
      const name = combo.nombre || "Combo";
      const thumb = combo.foto ? `<img src="${esc(combo.foto)}" alt="" width="64" height="64">` : "";
      return `<li class="cart-item">
        <div class="cart-thumb">${thumb}</div>
        <div class="cart-info"><strong>${esc(name)}</strong><span>${money(combo.precio)} c/u</span></div>
        <div class="cart-side">
          <div class="qty">
            <button type="button" data-dec="${esc(combo.id)}" aria-label="Quitar una unidad de ${esc(name)}">−</button>
            <b aria-live="polite">${qty}</b>
            <button type="button" data-inc="${esc(combo.id)}" aria-label="Agregar una unidad de ${esc(name)}">+</button>
          </div>
          <span class="cart-line-total">${money((Number(combo.precio) || 0) * qty)}</span>
        </div>
      </li>`;
    }).join("");
    list.scrollTop = scroll;

    const empty = lines.length === 0;
    $("cart-empty").classList.toggle("is-hidden", !empty);
    list.classList.toggle("is-hidden", empty);
    $("cart-clear-row").classList.toggle("is-hidden", empty);
    $("cart-total").textContent = money(cartTotal());
    $("cart-order").disabled = empty;
  }

  function openCart() {
    lastFocus = document.activeElement;
    renderCartModal();
    $("cart-modal").classList.add("open");
    document.body.style.overflow = "hidden";
    $("cart-close").focus();
  }

  function closeCart() {
    const modal = $("cart-modal");
    if (!modal.classList.contains("open")) return;
    modal.classList.remove("open");
    document.body.style.overflow = "";
    lastFocus?.focus?.();
  }

  /* ---------- Ordenar → formulario (con transición de corazón) ---------- */
  async function goToOrder(button) {
    if (ordering || totalQty() === 0) return;
    ordering = true;
    button.disabled = true;
    saveOrder();
    const rect = button.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    burstHearts(x, y);
    await sleep(450);
    await heartTransition(x, y);
    window.location.href = "pedido.html";
  }

  /* =====================================================
     FORMULARIO DE PEDIDO
     ===================================================== */
  const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s'.-]{1,59}$/u;
  const clean = value => String(value).replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim();

  async function initOrder() {
    cart = readOrder();
    const ids = Object.keys(cart);
    if (!ids.length) { window.location.replace("index.html"); return; }

    const list = $("summary-list");
    if (!sb) {
      list.innerHTML = `<li class="cart-empty">Falta conectar la base de datos (SUPABASE_URL y SUPABASE_KEY en config/env.js).</li>`;
      $("submit-btn").disabled = true;
      return;
    }

    // Se consultan de nuevo precios y disponibilidad reales
    let lines = [];
    try {
      const { data, error } = await sb.from("combos").select("id,nombre,foto,precio,activo").in("id", ids).eq("activo", true);
      if (error) throw error;
      const found = new Set((data || []).map(c => String(c.id)));
      const missing = ids.filter(id => !found.has(id));
      if (missing.length) {
        missing.forEach(id => delete cart[id]);
        saveOrder();
        toast("Algunos combos ya no están disponibles", "error", 4500, { key: "gone", sub: "Los quitamos de tu pedido." });
      }
      lines = (data || [])
        .map(c => ({ combo: c, qty: cart[String(c.id)] }))
        .sort((a, b) => byText(a.combo.nombre || "", b.combo.nombre || ""));
      if (!lines.length) { setTimeout(() => go("index.html"), 1800); return; }
    } catch (error) {
      console.error(error);
      list.innerHTML = `<li class="cart-empty">No pudimos cargar tu pedido. Revisa tu conexión y <button class="link-btn" type="button" onclick="location.reload()">vuelve a intentarlo</button>.</li>`;
      $("submit-btn").disabled = true;
      return;
    }

    const total = lines.reduce((sum, l) => sum + (Number(l.combo.precio) || 0) * l.qty, 0);
    $("estimated-price").textContent = money(total);
    list.innerHTML = lines.map(({ combo, qty }) => {
      const thumb = combo.foto ? `<img src="${esc(combo.foto)}" alt="" width="72" height="72">` : "";
      return `<li class="summary-item">
        <div class="cart-thumb">${thumb}</div>
        <div class="cart-info"><strong>${esc(combo.nombre || "Combo")}</strong><span>${money(combo.precio)} c/u</span></div>
        <div class="cart-side"><span class="summary-qty">× ${qty}</span><span class="cart-line-total">${money((Number(combo.precio) || 0) * qty)}</span></div>
      </li>`;
    }).join("");

    const nameInput = $("receiver-name");
    const addressInput = $("address");
    let submitted = false;
    let cooling = false;

    function setError(fieldId, errId, input, message) {
      $(fieldId).classList.toggle("has-error", Boolean(message));
      $(errId).textContent = message || "";
      input.setAttribute("aria-invalid", message ? "true" : "false");
    }

    function validate() {
      const name = clean(nameInput.value);
      const address = clean(addressInput.value);
      const nameOk = NAME_RE.test(name);
      const addressOk = address.length >= 10 && address.length <= 250;
      setError("field-name", "err-name", nameInput, nameOk ? "" : "Escribe un nombre válido (mínimo 2 letras).");
      setError("field-address", "err-address", addressInput, addressOk ? "" : "Escribe una dirección con al menos 10 caracteres.");
      return { ok: nameOk && addressOk, name, address, firstInvalid: !nameOk ? nameInput : !addressOk ? addressInput : null };
    }

    nameInput.addEventListener("input", () => { if (submitted) validate(); });
    addressInput.addEventListener("input", () => { if (submitted) validate(); });

    $("order-form").addEventListener("submit", event => {
      event.preventDefault();
      if (cooling) return;
      submitted = true;
      const result = validate();
      if (!result.ok) { toast("Revisa los campos marcados", "error", 3200, { key: "form" }); result.firstInvalid?.focus(); return; }

      const number = ADMIN_WHATSAPP.replace(/\D/g, "");
      if (!number || ADMIN_WHATSAPP.includes("TU_NUMERO")) { toast("El WhatsApp de la tienda aún no está configurado", "error", 4000, { key: "wa" }); return; }

      const items = lines.map(l => `🍽️ ${l.qty} × ${l.combo.nombre} — ${money((Number(l.combo.precio) || 0) * l.qty)}`).join("\n");
      const message = `Hola, Lía. Quiero solicitar este combo:\n\n${items}\n\nTotal: ${money(total)}\nNombre de quien recibe: ${result.name}\nDirección: ${result.address}\n\nQuedo pendiente de la confirmación. ¡Gracias!`;
      window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
      toast("Abriendo WhatsApp con tu solicitud ♡", "success", 3500, { key: "wa" });

      // Límite contra envíos repetidos
      cooling = true;
      const button = $("submit-btn");
      button.disabled = true;
      setTimeout(() => { cooling = false; button.disabled = false; }, 4000);
    });
  }
})();
