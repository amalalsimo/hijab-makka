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
    sort: "default",
    selected: null,
    size: "",
    color: "",
    colorId: "",
    quantity: 1,
    cart: loadCart(),
    cities: [],
    checkoutRequestId: "",
    cardSelections: {},
  };

  function loadCart() {
    try {
      const value = JSON.parse(localStorage.getItem("hm_new_cart") || "[]");
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }

  function saveCart() {
    state.checkoutRequestId = "";
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
    return `<div class="loading-grid">${Array.from({ length: 12 }, () => `
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
      reconcileCartWithCatalog();
      status.innerHTML = "";
      renderCategories();
      applyFilters();
      pickHeroProduct();
      applyRouteAfterProducts();
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
    let list = state.products.filter(p => {
      const matchesCategory = state.filter === "all" || p.category_slug === state.filter;
      const hay = `${p.name} ${p.id} ${p.product_id} ${p.category}`.toLowerCase();
      return matchesCategory && (!q || hay.includes(q));
    });

    if (state.sort === "price-asc") list.sort((a,b) => Number(a.price||0) - Number(b.price||0));
    if (state.sort === "price-desc") list.sort((a,b) => Number(b.price||0) - Number(a.price||0));
    if (state.sort === "name") list.sort((a,b) => String(a.name||"").localeCompare(String(b.name||""), "ar"));

    $("#visibleCount").textContent = list.length;
    renderProducts(list);
  }

  function cardSelection(product) {
    const key = String(product.id);
    if (!state.cardSelections[key]) {
      const availableSizes = (product.sizes || []).filter(size => productVariantForSize(product, size)?.available !== false);
      const size = product.has_size_options && availableSizes.length === 1 ? availableSizes[0] : "";
      const colors = cardColorsForProduct(product, size);
      const onlyColor = product.has_color_options && colors.length === 1 ? colors[0] : null;
      state.cardSelections[key] = {
        size,
        color: onlyColor?.label || "",
        colorId: onlyColor?.id || "",
      };
    }
    return state.cardSelections[key];
  }

  function cardColorsForProduct(product, size = "") {
    if (size && Array.isArray(product.variants)) {
      const variant = product.variants.find(v => clean(v.size).toUpperCase() === clean(size).toUpperCase());
      if (variant?.colors?.length) return variant.colors.filter(c => c.available !== false);
    }
    return (product.colors || []).filter(c => c.available !== false);
  }

  function productCardHtml(p) {
    const selection = cardSelection(p);
    const sizes = (p.sizes || []).filter(size => productVariantForSize(p, size)?.available !== false);
    const colors = cardColorsForProduct(p, selection.size);
    const displayImage = colors.find(c => c.label === selection.color)?.image || p.main_image;
    const hoverPanel = `
      <div class="card-hover-panel">
        ${p.has_size_options && sizes.length ? `
          <div class="card-option-block">
            <span class="card-option-label">المقاسات</span>
            <div class="card-size-list">
              ${sizes.map(size => `<button type="button" class="card-size-btn ${selection.size===size ? "active" : ""}" data-card-size="${escapeHtml(size)}" data-card-product="${escapeHtml(p.id)}">${escapeHtml(size)}</button>`).join("")}
            </div>
          </div>` : ""}

        ${p.has_color_options && colors.length ? `
          <div class="card-option-block card-color-block">
            <span class="card-option-label">الألوان</span>
            <div class="card-color-list">
              ${colors.map(c => `<button type="button" class="card-color-dot ${selection.color===c.label ? "active" : ""}" data-card-color="${escapeHtml(c.label)}" data-card-color-id="${escapeHtml(c.id || "")}" data-card-color-image="${escapeHtml(c.image || "")}" data-card-product="${escapeHtml(p.id)}" title="${escapeHtml(c.label)}" aria-label="${escapeHtml(c.label)}"><span style="background:${escapeHtml(colorHex(c.label,c.hex))}"></span></button>`).join("")}
            </div>
          </div>` : ""}

        <div class="product-actions card-buy-actions">
          <button class="card-cart-btn" type="button" data-card-add="${escapeHtml(p.id)}"><i class="fa-solid fa-cart-plus"></i> أضف للسلة</button>
          <button class="card-buy-btn" type="button" data-card-buy="${escapeHtml(p.id)}"><i class="fa-solid fa-bolt"></i> شراء الآن</button>
        </div>
      </div>`;

    return `
      <article class="product-card product-card-hover" data-product="${escapeHtml(p.id)}">
        <div class="product-image-wrap">
          <button class="product-image-button" type="button" data-open-product="${escapeHtml(p.id)}" aria-label="فتح ${escapeHtml(p.name)}">
            <img src="${escapeHtml(displayImage)}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async">
          </button>
          <span class="availability">متوفر الآن</span>
          ${hoverPanel}
        </div>
        <div class="product-body">
          <small>${escapeHtml(p.category)}</small>
          <button class="card-title-button" type="button" data-open-product="${escapeHtml(p.id)}"><h3>${escapeHtml(p.name)}</h3></button>
          <div class="product-price">
            <strong>${money(p.price)}</strong>
            ${p.original_price && p.original_price > p.price ? `<del>${money(p.original_price)}</del>` : ""}
          </div>
        </div>
      </article>`;
  }

  function renderProducts(products) {
    const grid = $("#productGrid");
    if (!products.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">ما لقينا حتى منتج بهاد البحث.</div>`;
      return;
    }
    grid.innerHTML = products.map(productCardHtml).join("");
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

  function reconcileCartWithCatalog() {
    if (!state.cart.length || !state.products.length) return;
    let changed = false;
    const next = [];

    for (const item of state.cart) {
      const product = productById(item.product_id);
      if (!product || product.available === false) {
        changed = true;
        continue;
      }
      const updated = {
        ...item,
        name: product.name,
        price: product.price,
        order_group: product.order_group,
        image: item.image || product.main_image,
      };
      if (updated.name !== item.name || Number(updated.price) !== Number(item.price) || updated.order_group !== item.order_group) changed = true;
      next.push(updated);
    }

    if (changed) {
      state.cart = next;
      saveCart();
      toast("تحدّثت السلة حسب التوفر والثمن الحالي.");
    }
  }

  function renderMissingProduct(id) {
    $("#homeMain").hidden = true;
    $("#productPage").hidden = false;
    $("#pageBreadcrumbName").textContent = "غير موجود";
    $("#relatedSection").hidden = true;
    document.title = "المنتج غير موجود | HIJAB MAKKAH";
    $("#productPageBody").innerHTML = `
      <div class="product-missing">
        <i class="fa-solid fa-bag-shopping"></i>
        <h1>هاد المنتج ما بقاش متوفر</h1>
        <p>يمكن يكون تبدل الرابط أو سالا المنتج من المجموعة الحالية.</p>
        <button class="btn btn-black" data-action="go-catalog">شوفي المنتجات المتوفرة</button>
      </div>`;
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function productUrl(product) {
    const id = encodeURIComponent(product?.id || product?.product_id || "");
    return `${location.origin}/product/${id}`;
  }

  function routeProductId() {
    const match = location.pathname.match(/^\/product\/([^/]+)\/?$/i);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function applyRouteAfterProducts() {
    const id = routeProductId();
    if (!id) return showHome({ replace: false });
    const product = productById(id);
    if (product) return openProduct(product.id, { fromRoute: true });
    renderMissingProduct(id);
  }

  function showHome({ replace = false } = {}) {
    $("#homeMain").hidden = false;
    $("#productPage").hidden = true;
    state.selected = null;
    document.title = "HIJAB MAKKAH — أزياء محتشمة مختارة";
    if (replace && location.pathname !== "/") history.pushState({}, "", "/");
    document.documentElement.style.overflow = "";
  }

  function pageColorHex(label, explicit) {
    if (explicit) return explicit;
    return colorHex(label, explicit);
  }

  function productVariantForSize(product, size) {
    return (product?.variants || []).find(v => clean(v.size).toUpperCase() === clean(size).toUpperCase()) || null;
  }

  function productPageColors(product) {
    const variant = state.size ? productVariantForSize(product, state.size) : null;
    const source = variant?.colors?.length ? variant.colors : (product.colors || []);
    return source.filter(c => c.available !== false);
  }

  function renderPageOptions() {
    const p = state.selected;
    if (!p || $("#productPage").hidden) return;

    const sizes = p.sizes || [];
    const variants = p.variants || [];
    const sizeBox = $("#pageSizes");
    const sizeWrap = $("#pageSizeWrap");
    if (p.has_size_options && sizes.length) {
      sizeWrap.hidden = false;
      sizeBox.innerHTML = sizes.map(size => {
        const variant = variants.find(v => clean(v.size).toUpperCase() === clean(size).toUpperCase());
        const disabled = variant?.available === false;
        return `<button class="page-size-btn ${state.size===size ? "active" : ""}" data-page-size="${escapeHtml(size)}" ${disabled ? "disabled" : ""}>${escapeHtml(size)}</button>`;
      }).join("");
    } else {
      sizeWrap.hidden = true;
      state.size = "";
    }

    const colors = productPageColors(p);
    const colorWrap = $("#pageColorWrap");
    if (p.has_color_options && colors.length) {
      colorWrap.hidden = false;
      $("#pageColors").innerHTML = colors.map(c => `
        <button class="page-color-btn ${state.color===c.label ? "active" : ""}"
          data-page-color="${escapeHtml(c.label)}"
          data-page-color-id="${escapeHtml(c.id || "")}"
          data-page-color-image="${escapeHtml(c.image || "")}">
          <span class="page-color-swatch" style="background:${escapeHtml(pageColorHex(c.label,c.hex))}"></span>
          <span>${escapeHtml(c.label)}</span>
        </button>`).join("");
    } else {
      colorWrap.hidden = true;
      state.color = "";
      state.colorId = "";
    }

    updatePageTotal();
  }

  function updatePageTotal() {
    if (!state.selected || $("#productPage").hidden) return;
    $("#pageQtyValue").textContent = state.quantity;
    $("#pageOrderTotal").textContent = money(Number(state.selected.price||0) * state.quantity);
  }

  function renderRelated(product) {
    const list = state.products
      .filter(p => p.id !== product.id && p.category_slug === product.category_slug)
      .slice(0, 6);
    const section = $("#relatedSection");
    if (!list.length) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    $("#relatedProducts").innerHTML = list.map(productCardHtml).join("");
  }

  function renderProductPage(product) {
    state.selected = product;
    state.size = "";
    state.color = "";
    state.colorId = "";
    state.quantity = 1;

    const availableSizes = (product.sizes || []).filter(size => {
      const variant = productVariantForSize(product, size);
      return variant?.available !== false;
    });
    if (product.has_size_options && availableSizes.length === 1) state.size = availableSizes[0];

    const initialColors = productPageColors(product);
    if (product.has_color_options && initialColors.length === 1) {
      state.color = initialColors[0].label;
      state.colorId = initialColors[0].id || "";
    }

    $("#homeMain").hidden = true;
    $("#productPage").hidden = false;
    $("#pageBreadcrumbName").textContent = product.name;
    document.title = `${product.name} | HIJAB MAKKAH`;

    const images = [...new Set((product.images || []).filter(Boolean))];
    const main = product.main_image || images[0] || "";
    const description = product.description || "اختاري المقاس واللون المتوفرين، ومن بعد أضيفي المنتج للطلب.";
    const oldPrice = product.original_price && product.original_price > product.price
      ? `<del>${money(product.original_price)}</del>` : "";

    $("#productPageBody").innerHTML = `
      <div class="page-product-layout">
        <div class="page-gallery">
          <div class="page-main-image">
            <img id="pageMainImage" src="${escapeHtml(main)}" alt="${escapeHtml(product.name)}">
            <span class="page-stock"><i class="fa-solid fa-circle-check"></i> متوفر الآن</span>
          </div>
          <div class="page-thumbs">
            ${images.map((src,index)=>`
              <button class="page-thumb ${index===0?"active":""}" data-page-image="${escapeHtml(src)}" aria-label="الصورة ${index+1}">
                <img src="${escapeHtml(src)}" alt="" loading="lazy">
              </button>`).join("")}
          </div>
        </div>

        <div class="page-product-info">
          <span class="page-category"><i class="fa-solid fa-layer-group"></i> ${escapeHtml(product.category)}</span>
          <h1>${escapeHtml(product.name)}</h1>
          <div class="page-code">
            <span>كود المنتج: <b>${escapeHtml(product.id)}</b></span>
            <button class="product-direct-link" data-page-copy-link type="button"><i class="fa-solid fa-link"></i> نسخ الرابط</button>
          </div>
          <div class="page-price-row"><strong>${money(product.price)}</strong>${oldPrice}</div>
          <p class="page-description">${escapeHtml(description)}</p>

          <div class="page-option" id="pageSizeWrap">
            <div class="page-option-head"><b><i class="fa-solid fa-ruler-combined"></i> المقاس</b><small>اختاري المقاس المتوفر</small></div>
            <div class="page-size-grid" id="pageSizes"></div>
          </div>

          <div class="page-option" id="pageColorWrap">
            <div class="page-option-head"><b><i class="fa-solid fa-palette"></i> اللون</b><small>الصورة تتبدل حسب اللون إذا كانت متوفرة</small></div>
            <div class="page-color-grid" id="pageColors"></div>
          </div>

          <div class="page-order-box">
            <div class="page-order-row">
              <span>الكمية</span>
              <div class="page-qty">
                <button type="button" data-page-qty="minus" aria-label="نقص"><i class="fa-solid fa-minus"></i></button>
                <b id="pageQtyValue">1</b>
                <button type="button" data-page-qty="plus" aria-label="زيادة"><i class="fa-solid fa-plus"></i></button>
              </div>
            </div>
            <div class="page-order-row"><span>المجموع</span><strong id="pageOrderTotal">${money(product.price)}</strong></div>

            <div class="page-actions">
              <button class="page-add-btn" data-page-add type="button"><i class="fa-solid fa-cart-plus"></i> أضف للسلة</button>
              <button class="page-buy-btn" data-page-buy type="button"><i class="fa-solid fa-bolt"></i> شراء الآن</button>
              <button class="page-share-btn whatsapp" data-page-whatsapp type="button" aria-label="مشاركة عبر واتساب"><i class="fa-brands fa-whatsapp"></i></button>
              <button class="page-share-btn" data-page-share type="button" aria-label="مشاركة"><i class="fa-solid fa-share-nodes"></i></button>
            </div>

            <div class="page-service-list">
              <span><i class="fa-solid fa-money-bill-wave"></i>الدفع عند الاستلام</span>
              <span><i class="fa-solid fa-truck-fast"></i>التوصيل للمغرب</span>
              <span><i class="fa-solid fa-phone-volume"></i>تأكيد قبل الشحن</span>
            </div>
          </div>

          <div class="product-facts">
            <div><small>التصنيف</small><b>${escapeHtml(product.category)}</b></div>
            <div><small>التوفر</small><b>متوفر الآن</b></div>
            <div><small>المقاسات</small><b>${escapeHtml((product.sizes||[]).join(" / ") || "حسب المنتج")}</b></div>
            <div><small>الألوان</small><b>${escapeHtml((product.colors||[]).map(c=>c.label).slice(0,5).join(" / ") || "حسب المنتج")}</b></div>
          </div>
        </div>
      </div>`;

    renderPageOptions();
    renderRelated(product);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function openProduct(id, options = {}) {
    const p = productById(id);
    if (!p) return;
    if (!options.fromRoute) history.pushState({ productId: p.id }, "", `/product/${encodeURIComponent(p.id)}`);
    renderProductPage(p);
  }

  function addCurrentProductToCart() {
    const p = state.selected;
    if (!p) return false;
    if (p.has_size_options && !state.size) { toast("اختاري المقاس."); return false; }
    if (p.has_color_options && !state.color) { toast("اختاري اللون."); return false; }

    if (state.cart.length && state.cart[0].order_group !== p.order_group) {
      toast("كمّلي الطلب الحالي أولاً، ومن بعد تقدري تطلبي هاد المنتج.");
      return false;
    }

    const colorObj = productPageColors(p).find(c => c.label === state.color);
    const image = colorObj?.image || p.main_image;
    const key = `${p.id}|${state.size || "-"}|${state.color || "-"}`;
    const existing = state.cart.find(i => i.key === key);

    if (existing) existing.quantity = Math.min(4, existing.quantity + state.quantity);
    else state.cart.push({
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

    saveCart();
    toast("تزاد المنتج للطلب.");
    return true;
  }

  function addCardProductToCart(product, buyNow = false) {
    if (!product) return false;
    const selection = cardSelection(product);

    if (product.has_size_options && !selection.size) {
      toast("اختاري المقاس من البطاقة أولاً.");
      return false;
    }
    if (product.has_color_options && !selection.color) {
      toast("اختاري اللون من البطاقة أولاً.");
      return false;
    }
    if (state.cart.length && state.cart[0].order_group !== product.order_group) {
      toast("كمّلي الطلب الحالي أولاً، ومن بعد تقدري تطلبي هاد المنتج.");
      return false;
    }

    const colors = cardColorsForProduct(product, selection.size);
    const colorObj = colors.find(c => c.label === selection.color);
    if (product.has_color_options && !colorObj) {
      selection.color = "";
      selection.colorId = "";
      toast("اختاري لون متوفر لهاد المقاس.");
      applyFilters();
      return false;
    }

    const key = `${product.id}|${selection.size || "-"}|${selection.color || "-"}`;
    const existing = state.cart.find(i => i.key === key);
    if (existing) existing.quantity = Math.min(4, Number(existing.quantity || 1) + 1);
    else state.cart.push({
      key,
      product_id: product.id,
      name: product.name,
      price: product.price,
      size: selection.size,
      color: selection.color,
      color_id: selection.colorId,
      quantity: 1,
      image: colorObj?.image || product.main_image,
      order_group: product.order_group,
    });

    saveCart();
    if (buyNow) openCheckout();
    else { toast("تزاد المنتج للسلة."); openCart(); }
    return true;
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
    if (!addCurrentProductToCart()) return;
    hideModal("#productModal");
    openCart();
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
            <small>${i.size ? `المقاس: ${escapeHtml(i.size)}` : ""}${i.color ? ` • اللون: ${escapeHtml(i.color)}` : ""}</small>
            <div class="cart-row-bottom">
              <div class="cart-mini-qty" aria-label="الكمية">
                <button type="button" data-cart-qty="minus" data-cart-key="${escapeHtml(i.key)}" aria-label="نقص الكمية"><i class="fa-solid fa-minus"></i></button>
                <b>${i.quantity}</b>
                <button type="button" data-cart-qty="plus" data-cart-key="${escapeHtml(i.key)}" aria-label="زيادة الكمية"><i class="fa-solid fa-plus"></i></button>
              </div>
              <div class="row-price">${money(i.price * i.quantity)}</div>
            </div>
          </div>
          <button class="remove-row" data-remove="${escapeHtml(i.key)}" aria-label="حذف"><i class="fa-solid fa-trash"></i></button>
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
    if (selector === "#productModal" && /^\/product\//i.test(location.pathname)) {
      history.pushState({}, "", "/");
    }
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

  function makeRequestId() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return `hm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  async function submitOrder(event) {
    event.preventDefault();
    if (!state.cart.length) return;
    const form = new FormData(event.currentTarget);
    if (!state.checkoutRequestId) state.checkoutRequestId = makeRequestId();
    const payload = {
      client_request_id: state.checkoutRequestId,
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
      btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> تأكيد الطلب';
    }
  }

  function bindEvents() {
    document.addEventListener("click", (e) => {
      const open = e.target.closest("[data-open-product]");
      if (open) return openProduct(open.dataset.openProduct);

      if (e.target.closest('[data-action="go-home"]')) {
        e.preventDefault();
        history.pushState({}, "", "/");
        showHome();
        return window.scrollTo({top:0,behavior:"smooth"});
      }
      if (e.target.closest('[data-action="go-catalog"]')) {
        e.preventDefault();
        history.pushState({}, "", "/#catalog");
        showHome();
        return setTimeout(() => $("#catalog")?.scrollIntoView({behavior:"smooth"}), 30);
      }

      const pageImage = e.target.closest("[data-page-image]");
      if (pageImage) {
        $("#pageMainImage").src = pageImage.dataset.pageImage;
        $$(".page-thumb").forEach(x => x.classList.toggle("active", x === pageImage));
        return;
      }

      const pageSize = e.target.closest("[data-page-size]");
      if (pageSize) {
        state.size = pageSize.dataset.pageSize;
        state.color = "";
        state.colorId = "";
        renderPageOptions();
        return;
      }

      const pageColor = e.target.closest("[data-page-color]");
      if (pageColor) {
        state.color = pageColor.dataset.pageColor;
        state.colorId = pageColor.dataset.pageColorId || "";
        $$(".page-color-btn").forEach(x => x.classList.toggle("active", x === pageColor));
        if (pageColor.dataset.pageColorImage) $("#pageMainImage").src = pageColor.dataset.pageColorImage;
        return;
      }

      const pageQty = e.target.closest("[data-page-qty]");
      if (pageQty) {
        state.quantity = pageQty.dataset.pageQty === "plus"
          ? Math.min(4, state.quantity + 1)
          : Math.max(1, state.quantity - 1);
        return updatePageTotal();
      }

      if (e.target.closest("[data-page-add]")) {
        if (addCurrentProductToCart()) openCart();
        return;
      }

      if (e.target.closest("[data-page-buy]")) {
        if (addCurrentProductToCart()) openCheckout();
        return;
      }

      const cardSize = e.target.closest("[data-card-size]");
      if (cardSize) {
        const product = productById(cardSize.dataset.cardProduct);
        if (!product) return;
        const selection = cardSelection(product);
        selection.size = cardSize.dataset.cardSize;
        const colors = cardColorsForProduct(product, selection.size);
        if (!colors.some(c => c.label === selection.color)) {
          selection.color = colors.length === 1 ? colors[0].label : "";
          selection.colorId = colors.length === 1 ? (colors[0].id || "") : "";
        }
        applyFilters();
        return;
      }

      const cardColor = e.target.closest("[data-card-color]");
      if (cardColor) {
        const product = productById(cardColor.dataset.cardProduct);
        if (!product) return;
        const selection = cardSelection(product);
        if (product.has_size_options && !selection.size) {
          toast("اختاري المقاس أولاً باش نعرضو اللون المتوافق.");
          return;
        }
        selection.color = cardColor.dataset.cardColor;
        selection.colorId = cardColor.dataset.cardColorId || "";
        const card = cardColor.closest(".product-card");
        $$(".card-color-dot", card).forEach(x => x.classList.toggle("active", x === cardColor));
        if (cardColor.dataset.cardColorImage) {
          const image = $(".product-image-wrap img", card);
          if (image) image.src = cardColor.dataset.cardColorImage;
        }
        return;
      }

      const cardAdd = e.target.closest("[data-card-add]");
      if (cardAdd) return addCardProductToCart(productById(cardAdd.dataset.cardAdd), false);

      const cardBuy = e.target.closest("[data-card-buy]");
      if (cardBuy) return addCardProductToCart(productById(cardBuy.dataset.cardBuy), true);

      if (e.target.closest("[data-page-copy-link]")) {
        const url = location.href;
        navigator.clipboard?.writeText(url).then(()=>toast("تنسخ رابط المنتج.")).catch(()=>toast(url));
        return;
      }

      if (e.target.closest("[data-page-whatsapp]")) {
        const p = state.selected;
        const message = `${p?.name || "منتج HIJAB MAKKAH"}\n${money(p?.price || 0)}\n${location.href}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener");
        return;
      }

      if (e.target.closest("[data-page-share]")) {
        const p = state.selected;
        const payload = {title:p?.name || "HIJAB MAKKAH", text:p?.name || "", url:location.href};
        if (navigator.share) navigator.share(payload).catch(()=>{});
        else navigator.clipboard?.writeText(location.href).then(()=>toast("تنسخ رابط المنتج."));
        return;
      }

      const action = e.target.closest("[data-action]")?.dataset.action;
      if (action === "open-cart") return openCart();
      if (action === "close-cart") return closeCart();
      if (action === "close-product") return hideModal("#productModal");
      if (action === "close-checkout") return hideModal("#checkoutModal");
      if (action === "focus-search") {
        if (!$("#productPage").hidden) {
          history.pushState({}, "", "/#catalog");
          showHome();
        }
        $("#catalog").scrollIntoView({ behavior: "smooth" });
        return setTimeout(() => $("#searchInput").focus(), 400);
      }

      const scroll = e.target.closest("[data-scroll]")?.dataset.scroll;
      if (scroll === "catalog") {
        if (!$("#productPage").hidden) {
          history.pushState({}, "", "/#catalog");
          showHome();
        }
        return $("#catalog").scrollIntoView({ behavior: "smooth" });
      }

      const chip = e.target.closest("[data-category]");
      if (chip) {
        state.filter = chip.dataset.category;
        $$(".category-chip").forEach(x => x.classList.toggle("active", x === chip));
        return applyFilters();
      }

      const footerCategory = e.target.closest("[data-footer-category]");
      if (footerCategory) {
        state.filter = footerCategory.dataset.footerCategory || "all";
        if (!$("#productPage").hidden) {
          history.pushState({}, "", "/#catalog");
          showHome();
        }
        $$(".category-chip").forEach(x => x.classList.toggle("active", x.dataset.category === state.filter));
        $("#catalog").scrollIntoView({ behavior: "smooth" });
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

      const cartQty = e.target.closest("[data-cart-qty]");
      if (cartQty) {
        const item = state.cart.find(i => i.key === cartQty.dataset.cartKey);
        if (!item) return;
        item.quantity = cartQty.dataset.cartQty === "plus"
          ? Math.min(4, Number(item.quantity || 1) + 1)
          : Math.max(1, Number(item.quantity || 1) - 1);
        saveCart();
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
    $("#sortSelect")?.addEventListener("change", e => {
      state.sort = e.target.value || "default";
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

    window.addEventListener("popstate", () => {
      const id = routeProductId();
      if (id) {
        const p = productById(id);
        if (p) renderProductPage(p);
      } else {
        showHome();
        if (location.hash === "#catalog") setTimeout(() => $("#catalog")?.scrollIntoView({behavior:"auto"}), 0);
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