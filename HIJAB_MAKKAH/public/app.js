(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const money = (n) => `${Number(n || 0).toLocaleString("fr-MA", { maximumFractionDigits: 2 })} د.م.`;
  const clean = (v) => String(v ?? "").trim();
  const escapeHtml = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));

  const state = {
    products: [],
    categories: [],
    filter: "all",
    query: "",
    selected: null,
    size: "",
    color: "",
    colorId: "",
    quantity: 1,
    cart: loadCart(),
    cities: [],
  };

  function loadCart() {
    try {
      const value = JSON.parse(localStorage.getItem("hm_new_cart") || "[]");
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }

  function saveCart() {
    try { localStorage.setItem("hm_new_cart", JSON.stringify(state.cart)); } catch {}
    renderCart();
    updateCartIndicators();
  }

  let toastTimer;
  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function skeleton() {
    return `<div class="loading-grid">${Array.from({ length: 8 }, () => `
      <div class="skeleton"><div class="sk-img"></div><div class="sk-body">
        <div class="sk-line short"></div><div class="sk-line"></div><div class="sk-line short"></div>
      </div></div>`).join("")}</div>`;
  }

  async function loadProducts(refresh = false) {
    const status = $("#catalogState");
    const grid = $("#productGrid");
    status.innerHTML = skeleton();
    grid.innerHTML = "";

    try {
      const r = await fetch(`/api/products${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || "تعذر تحميل المنتجات");
      state.products = (data.products || []).filter(p => p.available !== false);
      state.categories = data.categories || [];
      status.innerHTML = "";
      renderCategories();
      applyFilters();
      pickHeroProduct();
    } catch (error) {
      status.innerHTML = `<div class="error-state">
        <b>تعذر تحميل المنتجات حالياً.</b><br>
        <span>${escapeHtml(error.message || "")}</span><br>
        <button class="btn btn-black" id="retryProducts">إعادة المحاولة</button>
      </div>`;
      $("#retryProducts")?.addEventListener("click", () => loadProducts(true));
    }
  }

  async function loadCities() {
    try {
      const r = await fetch("/api/cities");
      const data = await r.json();
      state.cities = data.cities || [];
      const select = $("#citySelect");
      select.innerHTML = `<option value="">اختاري المدينة</option>` +
        state.cities.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.ar)}</option>`).join("");
    } catch {}
  }

  function renderCategories() {
    const counts = new Map();
    for (const p of state.products) counts.set(p.category_slug, (counts.get(p.category_slug) || 0) + 1);
    $("#categoryChips").innerHTML =
      `<button class="category-chip active" data-category="all">الكل <span>${state.products.length}</span></button>` +
      state.categories
        .filter(c => counts.get(c.slug))
        .map(c => `<button class="category-chip" data-category="${escapeHtml(c.slug)}">${escapeHtml(c.label)} <span>${counts.get(c.slug)}</span></button>`)
        .join("");
  }

  function applyFilters() {
    const q = state.query.toLowerCase();
    const list = state.products.filter(p => {
      const matchesCategory = state.filter === "all" || p.category_slug === state.filter;
      const hay = `${p.name} ${p.id} ${p.product_id} ${p.category}`.toLowerCase();
      return matchesCategory && (!q || hay.includes(q));
    });
    $("#visibleCount").textContent = list.length;
    renderProducts(list);
  }

  function renderProducts(products) {
    const grid = $("#productGrid");
    if (!products.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">ما لقينا حتى منتج بهاد البحث.</div>`;
      return;
    }
    grid.innerHTML = products.map(p => `
      <article class="product-card" data-product="${escapeHtml(p.id)}">
        <div class="product-image-wrap">
          <img src="${escapeHtml(p.main_image)}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async">
          <span class="availability">متوفر الآن</span>
        </div>
        <div class="product-body">
          <small>${escapeHtml(p.category)}</small>
          <h3>${escapeHtml(p.name)}</h3>
          <div class="product-price">
            <strong>${money(p.price)}</strong>
            ${p.original_price && p.original_price > p.price ? `<del>${money(p.original_price)}</del>` : ""}
          </div>
          <div class="product-actions">
            <button class="view-btn" data-open-product="${escapeHtml(p.id)}">شوفي التفاصيل</button>
            <button class="quick-btn" data-open-product="${escapeHtml(p.id)}" aria-label="فتح">↗</button>
          </div>
        </div>
      </article>`).join("");
  }

  function pickHeroProduct() {
    const p = state.products.find(p => p.main_image) || state.products[0];
    if (!p) return;
    $("#heroProductImage").src = p.main_image;
    $("#heroProductImage").alt = p.name;
    $("#heroProductName").textContent = p.name;
  }

  function productById(id) {
    return state.products.find(p => String(p.id) === String(id) || String(p.product_id) === String(id));
  }

  function availableColorsForSelection(product) {
    if (!product) return [];
    if (state.size && Array.isArray(product.variants)) {
      const v = product.variants.find(v => clean(v.size).toUpperCase() === state.size.toUpperCase());
      if (v?.colors?.length) return v.colors.filter(c => c.available !== false);
    }
    return (product.colors || []).filter(c => c.available !== false);
  }

  function colorHex(label, explicit) {
    if (explicit) return explicit;
    const x = clean(label).toLowerCase();
    const map = {
      "noir":"#111","black":"#111","أسود":"#111","اسود":"#111",
      "blanc":"#f7f7f2","white":"#f7f7f2","أبيض":"#f7f7f2","ابيض":"#f7f7f2",
      "beige":"#d7c3a2","بيج":"#d7c3a2","marron":"#79513a","بني":"#79513a",
      "bordeaux":"#6b1f34","بورغندي":"#6b1f34","خمري":"#6b1f34",
      "kaki":"#666b45","khaki":"#666b45","زيتي":"#666b45","olive":"#666b45",
      "bleu":"#345779","blue":"#345779","أزرق":"#345779","ازرق":"#345779",
      "rose":"#d59aa6","pink":"#d59aa6","وردي":"#d59aa6",
      "gris":"#858585","gray":"#858585","رمادي":"#858585",
      "vert":"#497256","green":"#497256","أخضر":"#497256","اخضر":"#497256",
    };
    for (const [k,v] of Object.entries(map)) if (x.includes(k)) return v;
    return "#c9b9a9";
  }

  function openProduct(id) {
    const p = productById(id);
    if (!p) return;
    state.selected = p;
    state.size = "";
    state.color = "";
    state.colorId = "";
    state.quantity = 1;

    $("#productTitle").textContent = p.name;
    $("#productCode").textContent = p.id;
    $("#productCategory").textContent = p.category;
    $("#productPrice").textContent = money(p.price);
    $("#productOldPrice").textContent = p.original_price && p.original_price > p.price ? money(p.original_price) : "";
    $("#productOldPrice").style.display = p.original_price && p.original_price > p.price ? "" : "none";
    $("#productDescription").textContent = p.description || "اختاري المقاس واللون المتوفرين ثم أضيفي المنتج للطلب.";
    $("#productMainImage").src = p.main_image || "";
    $("#productMainImage").alt = p.name;

    const images = [...new Set((p.images || []).filter(Boolean))];
    $("#productThumbs").innerHTML = images.map((src, i) => `
      <button class="thumb ${i===0 ? "active" : ""}" data-image="${escapeHtml(src)}">
        <img src="${escapeHtml(src)}" alt="صورة ${i+1}" loading="lazy">
      </button>`).join("");

    renderSizes();
    renderColors();
    updateDetailTotal();
    showModal("#productModal");
  }

  function renderSizes() {
    const p = state.selected;
    const section = $("#sizeSection");
    if (!p?.has_size_options) {
      section.style.display = "none";
      state.size = "";
      return;
    }
    section.style.display = "";
    const variants = Array.isArray(p.variants) ? p.variants : [];
    const sizes = p.sizes || [];
    $("#sizeOptions").innerHTML = sizes.map(size => {
      const variant = variants.find(v => clean(v.size).toUpperCase() === clean(size).toUpperCase());
      const disabled = variant?.available === false;
      return `<button class="option-btn ${state.size===size ? "active" : ""}" ${disabled ? "disabled" : ""} data-size="${escapeHtml(size)}">${escapeHtml(size)}</button>`;
    }).join("");
  }

  function renderColors() {
    const p = state.selected;
    const section = $("#colorSection");
    if (!p?.has_color_options) {
      section.style.display = "none";
      state.color = "";
      state.colorId = "";
      return;
    }
    section.style.display = "";
    const colors = availableColorsForSelection(p);
    $("#colorOptions").innerHTML = colors.map(c => `
      <button class="color-btn ${state.color===c.label ? "active" : ""}" data-color="${escapeHtml(c.label)}" data-color-id="${escapeHtml(c.id || "")}" data-color-image="${escapeHtml(c.image || "")}">
        <span class="swatch" style="background:${escapeHtml(colorHex(c.label,c.hex))}"></span>
        <span>${escapeHtml(c.label)}</span>
      </button>`).join("");
  }

  function updateDetailTotal() {
    $("#qtyValue").textContent = state.quantity;
    $("#detailTotal").textContent = money((state.selected?.price || 0) * state.quantity);
  }

  function addToCart() {
    const p = state.selected;
    if (!p) return;
    if (p.has_size_options && !state.size) return toast("اختاري المقاس.");
    if (p.has_color_options && !state.color) return toast("اختاري اللون.");

    if (state.cart.length && state.cart[0].order_group !== p.order_group) {
      return toast("كمّلي الطلب الحالي أولاً، ومن بعد تقدري تطلبي هاد المنتج.");
    }

    const colorObj = availableColorsForSelection(p).find(c => c.label === state.color);
    const image = colorObj?.image || p.main_image;
    const key = `${p.id}|${state.size || "-"}|${state.color || "-"}`;
    const existing = state.cart.find(i => i.key === key);

    if (existing) {
      existing.quantity = Math.min(4, existing.quantity + state.quantity);
    } else {
      state.cart.push({
        key,
        product_id: p.id,
        name: p.name,
        price: p.price,
        size: state.size,
        color: state.color,
        color_id: state.colorId,
        quantity: state.quantity,
        image,
        order_group: p.order_group,
      });
    }
    saveCart();
    hideModal("#productModal");
    openCart();
    toast("تزاد المنتج للطلب.");
  }

  function cartTotal() {
    return state.cart.reduce((sum, i) => sum + Number(i.price || 0) * Number(i.quantity || 1), 0);
  }

  function updateCartIndicators() {
    const count = state.cart.reduce((n, i) => n + Number(i.quantity || 1), 0);
    $$("[data-cart-count]").forEach(el => el.textContent = count);
    $("#mobileCartTotal").textContent = money(cartTotal());
    $("#mobileCartBar").dataset.empty = String(count === 0);
  }

  function renderCart() {
    const host = $("#cartItems");
    if (!state.cart.length) {
      host.innerHTML = `<div class="empty-cart"><div><b>طلبك مازال فارغ</b><span>اختاري أي منتج وأضيفيه هنا.</span></div></div>`;
    } else {
      host.innerHTML = state.cart.map(i => `
        <article class="cart-row" data-key="${escapeHtml(i.key)}">
          <img src="${escapeHtml(i.image || "")}" alt="${escapeHtml(i.name)}">
          <div>
            <strong>${escapeHtml(i.name)}</strong>
            <small>${i.size ? `المقاس: ${escapeHtml(i.size)}` : ""}${i.color ? ` • اللون: ${escapeHtml(i.color)}` : ""} • الكمية: ${i.quantity}</small>
            <div class="row-price">${money(i.price * i.quantity)}</div>
          </div>
          <button class="remove-row" data-remove="${escapeHtml(i.key)}" aria-label="حذف">×</button>
        </article>`).join("");
    }
    $("#cartTotal").textContent = money(cartTotal());
    $("#goCheckout").disabled = state.cart.length === 0;
  }

  function openCart() {
    renderCart();
    $("#drawerBackdrop").classList.add("open");
    $("#cartDrawer").classList.add("open");
    $("#cartDrawer").setAttribute("aria-hidden", "false");
    document.documentElement.style.overflow = "hidden";
  }

  function closeCart() {
    $("#drawerBackdrop").classList.remove("open");
    $("#cartDrawer").classList.remove("open");
    $("#cartDrawer").setAttribute("aria-hidden", "true");
    document.documentElement.style.overflow = "";
  }

  function showModal(selector) {
    const el = $(selector);
    el.classList.add("open");
    el.setAttribute("aria-hidden", "false");
    document.documentElement.style.overflow = "hidden";
  }

  function hideModal(selector) {
    const el = $(selector);
    el.classList.remove("open");
    el.setAttribute("aria-hidden", "true");
    document.documentElement.style.overflow = "";
  }

  function openCheckout() {
    if (!state.cart.length) return toast("اختاري منتج أولاً.");
    closeCart();
    $("#checkoutItems").innerHTML = state.cart.map(i => `
      <div class="checkout-item">
        <img src="${escapeHtml(i.image || "")}" alt="">
        <div><b>${escapeHtml(i.name)}</b><small>${i.size ? `المقاس: ${escapeHtml(i.size)}` : ""}${i.color ? ` • اللون: ${escapeHtml(i.color)}` : ""} • ${i.quantity} قطعة</small></div>
        <strong>${money(i.price * i.quantity)}</strong>
      </div>`).join("");
    $("#checkoutTotal").textContent = money(cartTotal());
    $("#checkoutMessage").className = "form-message";
    $("#checkoutMessage").textContent = "";
    showModal("#checkoutModal");
  }

  async function submitOrder(event) {
    event.preventDefault();
    if (!state.cart.length) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      customer: {
        name: clean(form.get("name")),
        phone: clean(form.get("phone")),
        city_id: clean(form.get("city_id")),
        address: clean(form.get("address")),
        notes: clean(form.get("notes")),
      },
      items: state.cart.map(i => ({
        product_id: i.product_id,
        size: i.size,
        color: i.color,
        color_id: i.color_id,
        quantity: i.quantity,
      })),
    };

    const msg = $("#checkoutMessage");
    const btn = $("#submitOrder");
    btn.disabled = true;
    btn.textContent = "جاري تسجيل الطلب...";
    msg.className = "form-message info";
    msg.textContent = "كنتحققو من التوفر وكنسجلو الطلب...";

    try {
      const r = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok || data.success !== true) throw new Error(data.message || "تعذر تسجيل الطلب.");

      msg.className = "form-message success";
      msg.textContent = "تم تسجيل الطلب بنجاح.";
      state.cart = [];
      saveCart();
      event.currentTarget.reset();
      hideModal("#checkoutModal");
      $("#successOrderId").textContent = data.order_id || data.parent_order_id || "—";
      showModal("#successModal");
    } catch (error) {
      msg.className = "form-message error";
      msg.textContent = error.message || "تعذر تسجيل الطلب.";
    } finally {
      btn.disabled = false;
      btn.textContent = "تأكيد الطلب";
    }
  }

  function bindEvents() {
    document.addEventListener("click", (e) => {
      const open = e.target.closest("[data-open-product]");
      if (open) return openProduct(open.dataset.openProduct);

      const action = e.target.closest("[data-action]")?.dataset.action;
      if (action === "open-cart") return openCart();
      if (action === "close-cart") return closeCart();
      if (action === "close-product") return hideModal("#productModal");
      if (action === "close-checkout") return hideModal("#checkoutModal");
      if (action === "focus-search") {
        $("#catalog").scrollIntoView({ behavior: "smooth" });
        return setTimeout(() => $("#searchInput").focus(), 400);
      }

      const scroll = e.target.closest("[data-scroll]")?.dataset.scroll;
      if (scroll === "catalog") return $("#catalog").scrollIntoView({ behavior: "smooth" });

      const chip = e.target.closest("[data-category]");
      if (chip) {
        state.filter = chip.dataset.category;
        $$(".category-chip").forEach(x => x.classList.toggle("active", x === chip));
        return applyFilters();
      }

      const thumb = e.target.closest("[data-image]");
      if (thumb) {
        $("#productMainImage").src = thumb.dataset.image;
        $$(".thumb").forEach(x => x.classList.toggle("active", x === thumb));
        return;
      }

      const size = e.target.closest("[data-size]");
      if (size) {
        state.size = size.dataset.size;
        state.color = "";
        state.colorId = "";
        renderSizes();
        renderColors();
        return;
      }

      const color = e.target.closest("[data-color]");
      if (color) {
        state.color = color.dataset.color;
        state.colorId = color.dataset.colorId || "";
        $$(".color-btn").forEach(x => x.classList.toggle("active", x === color));
        if (color.dataset.colorImage) $("#productMainImage").src = color.dataset.colorImage;
        return;
      }

      const remove = e.target.closest("[data-remove]");
      if (remove) {
        state.cart = state.cart.filter(i => i.key !== remove.dataset.remove);
        saveCart();
        return;
      }
    });

    $("#searchInput").addEventListener("input", e => {
      state.query = clean(e.target.value);
      applyFilters();
    });

    $("#qtyMinus").addEventListener("click", () => {
      state.quantity = Math.max(1, state.quantity - 1);
      updateDetailTotal();
    });
    $("#qtyPlus").addEventListener("click", () => {
      state.quantity = Math.min(4, state.quantity + 1);
      updateDetailTotal();
    });
    $("#addToCart").addEventListener("click", addToCart);
    $("#goCheckout").addEventListener("click", openCheckout);
    $("#checkoutForm").addEventListener("submit", submitOrder);
    $("#successDone").addEventListener("click", () => {
      hideModal("#successModal");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    document.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        closeCart();
        hideModal("#productModal");
        hideModal("#checkoutModal");
      }
    });
  }

  function init() {
    updateCartIndicators();
    renderCart();
    bindEvents();
    loadCities();
    loadProducts();
  }

  init();
})();