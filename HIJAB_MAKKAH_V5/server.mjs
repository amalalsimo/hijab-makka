import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 3000);

const PRODUCTS_UPSTREAM =
  process.env.HM_PRODUCTS_URL ||
  "https://n8n.amalal.cloud/webhook/hijab-makka-store-products-v2";

const ORDER_UPSTREAM =
  process.env.HM_ORDER_WEBHOOK_URL ||
  "https://n8n.amalal.cloud/webhook/makkah-store-order";

const cities = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "cities.json"), "utf8"));
const cityMap = new Map(cities.map((c) => [String(c.id), c]));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8",
};

let productCache = { at: 0, raw: [], safe: [] };
const CACHE_MS = 90_000;

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

function sendJson(res, status, value) {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(value));
}

function text(v) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

function normalizeColor(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  const label = text(typeof raw === "object" ? (raw.label || raw.name || raw.color) : raw);
  if (!label) return null;
  const quantity = num(o.quantity);
  const available =
    o.available !== undefined ? o.available !== false :
    quantity !== null ? quantity > 0 : null;
  return {
    id: text(o.color_id ?? o.id ?? ""),
    label,
    hex: text(o.hex || ""),
    image: text(o.image || o.image_url || ""),
    quantity,
    available,
  };
}

function normalizeVariant(raw) {
  if (!raw || typeof raw !== "object") return null;
  const size = text(raw.size);
  if (!size) return null;
  const colors = Array.isArray(raw.colors) ? raw.colors.map(normalizeColor).filter(Boolean) : [];
  const quantity = num(raw.total_quantity);
  return {
    size,
    total_quantity: quantity,
    available:
      raw.available !== undefined ? raw.available !== false :
      colors.some((c) => c.available === true) ? true : null,
    colors,
  };
}

function categoryKey(product) {
  const hay = [
    product.product_category_slug,
    product.product_category,
    product.category_detail_slug,
    product.category_detail,
    product.original_category,
    product.category_slug,
    product.category_ar,
    product.category,
    product.name,
    product.title,
  ].map(text).join(" ").toLowerCase();

  if (/burkini|borkini|bourkini|بوركيني|بركيني/.test(hay)) return ["burkini", "بوركيني"];
  if (/abaya|عباية|عبايات/.test(hay)) return ["abaya", "عبايات"];
  if (/ensemble|طقم|اطقم|أطقم/.test(hay)) return ["ensemble", "أطقم"];
  if (/robe|dress|فستان|فساتين/.test(hay)) return ["robe", "فساتين"];
  if (/cape|كاب|كابات/.test(hay)) return ["cape", "كابات"];
  if (/jalaba|djellaba|جلابة/.test(hay)) return ["jalaba", "جلابة"];
  if (/caftan|kaftan|قفطان/.test(hay)) return ["caftan", "قفطان"];
  if (/pantalon|سروال|سراويل/.test(hay)) return ["pantalon", "سراويل"];
  if (/sac|bag|حقيبة|حقائب/.test(hay)) return ["sac", "حقائب"];
  if (/sport|survetement|survêtement|رياضي|رياضية/.test(hay)) return ["sport", "ملابس رياضية"];
  return ["other", text(product.category_ar || product.category || "منتجات") || "منتجات"];
}

function normalizeProduct(product) {
  if (!product || typeof product !== "object") return null;

  const id = text(product.id || product.product_id);
  const name = text(product.name || product.title);
  const price = num(product.price ?? product.selling_price ?? product.sale_price);
  if (!id || !name || price === null || price <= 0) return null;

  const variants = Array.isArray(product.variants)
    ? product.variants.map(normalizeVariant).filter(Boolean)
    : [];

  const rawSizes = variants.length
    ? variants.map((v) => v.size)
    : (Array.isArray(product.all_sizes) ? product.all_sizes : Array.isArray(product.sizes) ? product.sizes : []);

  const colorsFromVariants = variants.flatMap((v) => v.colors || []);
  const rawColors = colorsFromVariants.length
    ? colorsFromVariants
    : (Array.isArray(product.all_colors) ? product.all_colors : Array.isArray(product.colors) ? product.colors : []);

  const colors = [];
  const seenColors = new Set();
  for (const c0 of rawColors.map(normalizeColor).filter(Boolean)) {
    const key = c0.label.toLowerCase();
    if (!seenColors.has(key)) {
      seenColors.add(key);
      colors.push(c0);
    }
  }

  const images = unique([
    ...(Array.isArray(product.images) ? product.images.map(text) : []),
    text(product.image_url),
    text(product.main_image),
    text(product.primary_image_url),
    ...colors.map((c) => c.image),
  ]);

  const [category_slug, category] = categoryKey(product);
  const available =
    product.available === false ? false :
    variants.length && variants.every((v) => v.available === false) ? false :
    true;

  const supplier = text(product.supplier);
  const order_group = crypto.createHash("sha256").update(supplier || "default").digest("hex").slice(0, 12);

  return {
    safe: {
      id,
      product_id: text(product.product_id || id),
      name,
      description: text(product.description),
      price,
      original_price: num(product.original_price ?? product.compare_at_price),
      category,
      category_slug,
      images,
      main_image: images[0] || "",
      variants,
      sizes: unique(rawSizes.map(text)),
      colors,
      has_size_options: product.has_size_options === true || rawSizes.length > 0,
      has_color_options: product.has_color_options === true || colors.length > 0,
      available,
      order_group,
    },
    raw: product,
  };
}

async function fetchJson(url, options = {}, timeout = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...(options.headers || {}),
      },
    });
    const body = await response.text();
    let data = {};
    try { data = body ? JSON.parse(body) : {}; } catch {}
    if (!response.ok) {
      const error = new Error(data?.message || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function getProducts(force = false) {
  if (!force && productCache.safe.length && Date.now() - productCache.at < CACHE_MS) {
    return productCache;
  }

  const payload = await fetchJson(PRODUCTS_UPSTREAM, { cache: "no-store" });
  const rawProducts = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.products)
      ? payload.products
      : [];

  const normalized = rawProducts.map(normalizeProduct).filter(Boolean);
  const dedup = [];
  const seen = new Set();

  for (const p of normalized) {
    const supplier = text(p.raw.supplier).toLowerCase();
    const supplierProduct = text(
      p.raw.supplier_product_id ||
      p.raw.original_id ||
      p.raw.product_id ||
      p.raw.id
    ).toLowerCase();
    const key = `${supplier}:${supplierProduct || p.safe.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(p);
  }

  // Keep safe/raw arrays aligned. This is critical because order validation
  // uses the index from the public safe catalog to locate the private raw product.
  const availableProducts = dedup.filter((p) => p.safe.available !== false);
  productCache = {
    at: Date.now(),
    raw: availableProducts.map((p) => p.raw),
    safe: availableProducts.map((p) => p.safe),
  };
  return productCache;
}

function validPhone(value) {
  const d = String(value || "").replace(/\D/g, "");
  return /^(?:0[67]\d{8}|212[67]\d{8})$/.test(d) &&
    !/^(?:0[67]|212[67])(\d)\1{7}$/.test(d);
}

function cleanPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function selectedColor(rawProduct, item, size) {
  const label = text(item.color).toLowerCase();
  if (!label) return null;

  const variants = Array.isArray(rawProduct.variants) ? rawProduct.variants : [];
  const variant = variants.find((v) => text(v.size).toUpperCase() === text(size).toUpperCase());
  const variantColors = Array.isArray(variant?.colors) ? variant.colors : [];

  // If the selected size has an explicit color matrix, never fall back to a
  // product-level color. A color may exist globally but not for this size.
  const sources = variantColors.length
    ? variantColors
    : [
        ...(Array.isArray(rawProduct.all_colors) ? rawProduct.all_colors : []),
        ...(Array.isArray(rawProduct.colors) ? rawProduct.colors : []),
      ];
  return sources.find((c) => text(c?.label || c?.name || c?.color).toLowerCase() === label) || null;
}

function selectedVariant(rawProduct, size) {
  const variants = Array.isArray(rawProduct.variants) ? rawProduct.variants : [];
  return variants.find((v) => text(v.size).toUpperCase() === text(size).toUpperCase()) || null;
}

function stockForSelection(rawProduct, size, colorRaw) {
  const colorQty = num(colorRaw?.quantity);
  if (colorQty !== null) return colorQty;

  const variant = selectedVariant(rawProduct, size);
  const variantQty = num(variant?.total_quantity ?? variant?.quantity);
  if (variantQty !== null) return variantQty;

  return null;
}

async function createOrder(req, res) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
    if (Buffer.concat(chunks).length > 512_000) {
      return sendJson(res, 413, { success: false, message: "الطلب كبير بزاف." });
    }
  }

  let body = {};
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { return sendJson(res, 400, { success: false, message: "بيانات الطلب غير صالحة." }); }

  const customer = body.customer || {};
  const items = Array.isArray(body.items) ? body.items : [];
  const clientRequestIdRaw = text(body.client_request_id);
  const clientRequestId = /^[A-Za-z0-9._:-]{10,120}$/.test(clientRequestIdRaw) ? clientRequestIdRaw : "";
  const name = text(customer.name);
  const phone = cleanPhone(customer.phone);
  const cityId = text(customer.city_id);
  const address = text(customer.address);
  const notes = text(customer.notes);

  if (name.length < 2) return sendJson(res, 400, { success: false, message: "دخلي الاسم." });
  if (!validPhone(phone)) return sendJson(res, 400, { success: false, message: "رقم الهاتف غير صحيح." });
  if (!cityMap.has(cityId)) return sendJson(res, 400, { success: false, message: "اختاري المدينة." });
  if (address.length < 8) return sendJson(res, 400, { success: false, message: "دخلي عنوان واضح." });
  if (!items.length) return sendJson(res, 400, { success: false, message: "السلة فارغة." });

  const catalog = await getProducts(true);
  const validated = [];

  for (const item of items.slice(0, 12)) {
    const productIndex = catalog.safe.findIndex((p) => p.id === text(item.product_id) || p.product_id === text(item.product_id));
    if (productIndex < 0) return sendJson(res, 409, { success: false, message: "واحد المنتج ما بقاش متوفر. حدّثي الصفحة." });

    const safe = catalog.safe[productIndex];
    const raw = catalog.raw[productIndex];
    if (safe.available === false) return sendJson(res, 409, { success: false, message: `${safe.name} ما بقاش متوفر.` });

    const size = text(item.size);
    const color = text(item.color);
    const parsedQuantity = Number(item.quantity);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 4) {
      return sendJson(res, 400, { success: false, message: "الكمية غير صالحة." });
    }
    const quantity = parsedQuantity;

    if (safe.has_size_options) {
      const variant = selectedVariant(raw, size);
      const sizeKnown = safe.sizes.some((s) => s.toUpperCase() === size.toUpperCase());
      if (!size || !sizeKnown || variant?.available === false) {
        return sendJson(res, 409, { success: false, message: `المقاس المختار غير متوفر في ${safe.name}.` });
      }
    }

    let colorRaw = null;
    if (safe.has_color_options) {
      colorRaw = selectedColor(raw, item, size);
      if (!color || !colorRaw || colorRaw.available === false) {
        return sendJson(res, 409, { success: false, message: `اللون المختار غير متوفر في ${safe.name}.` });
      }
    }

    const availableStock = stockForSelection(raw, size, colorRaw);
    if (availableStock !== null && quantity > availableStock) {
      return sendJson(res, 409, {
        success: false,
        message: `الكمية المطلوبة من ${safe.name} غير متوفرة حالياً.`,
      });
    }

    validated.push({ safe, raw, size, color, colorRaw, quantity });
  }

  const groupKeys = new Set(validated.map((x) => x.safe.order_group));
  if (groupKeys.size > 1) {
    return sendJson(res, 409, {
      success: false,
      message: "هاد المنتجات ما يمكنش يجتمعو في نفس الطلب. كمّلي الطلب الحالي ومن بعد ديري الطلب الثاني.",
    });
  }

  const city = cityMap.get(cityId);
  const parentOrderId = clientRequestId
    ? `HMC-${crypto.createHash("sha256").update(clientRequestId).digest("hex").slice(0, 14).toUpperCase()}`
    : `HMC-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
  const results = [];

  for (let index = 0; index < validated.length; index += 1) {
    const { safe, raw, size, color, colorRaw, quantity } = validated[index];
    const subtotal = Number((safe.price * quantity).toFixed(2));
    const supplierProductId = text(raw.supplier_product_id || raw.original_id || raw.product_id || raw.id);

    const payload = {
      parent_order_id: parentOrderId,
      client_request_id: clientRequestId,
      cart_sequence: index + 1,
      cart_items_count: validated.length,

      productName: safe.name,
      product_name: safe.name,
      productId: safe.product_id,
      product_id: safe.product_id,
      supplierProductId,
      supplier_product_id: supplierProductId,

      size,
      color,
      colorId: text(colorRaw?.color_id ?? colorRaw?.id ?? ""),
      color_id: text(colorRaw?.color_id ?? colorRaw?.id ?? ""),
      quantity,

      customerName: name,
      customer_name: name,
      phone,
      delivery_phone: phone,

      cityId,
      city_id: cityId,
      ville: cityId,
      city: city.ar,
      address,
      notes,

      product_price: safe.price,
      subtotal,
      subtotal_price: subtotal,
      discount_amount: 0,
      discount_type: "",
      total_price: subtotal,
      final_total: subtotal,
      shipping_fee: 0,
      delivery_fee: 0,
      free_shipping: true,
      price_includes_shipping: true,

      supplier: text(raw.supplier),
      category: safe.category,
      category_slug: safe.category_slug,
      product_image: text(colorRaw?.image || safe.main_image),
      product_source_url: text(raw.source_url),

      profit_per_item: Number(raw.profit_per_item || raw.profit || 20),
      shipping_cost: Number(raw.shipping_cost || 37),
      shipping_included: raw.shipping_included !== false,
      delivery_included: raw.delivery_included !== false,
      pricing_rule: text(raw.pricing_rule) || "supplier_price_plus_37_delivery_plus_20_profit",

      source: "hijab-makka-store-v5",
      idempotency_key: `${parentOrderId}:${index + 1}:${supplierProductId}:${safe.id}`,
      items: [{
        product_id: safe.product_id,
        supplier_product_id: supplierProductId,
        supplier: text(raw.supplier),
        name: safe.name,
        size,
        color,
        color_id: text(colorRaw?.color_id ?? colorRaw?.id ?? ""),
        quantity,
        unit_price: safe.price,
        subtotal,
        image: text(colorRaw?.image || safe.main_image),
      }],
      cart_items: [{
        product_id: safe.product_id,
        supplier_product_id: supplierProductId,
        supplier: text(raw.supplier),
        name: safe.name,
        size,
        color,
        color_id: text(colorRaw?.color_id ?? colorRaw?.id ?? ""),
        quantity,
        unit_price: safe.price,
        subtotal,
        image: text(colorRaw?.image || safe.main_image),
      }],
      products_count: 1,
    };

    const result = await fetchJson(ORDER_UPSTREAM, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }, 20_000);

    if (result?.success !== true) {
      return sendJson(res, 502, {
        success: false,
        message: result?.message || "تعذر تسجيل الطلب.",
        partial_order_ids: results.map((r) => r.order_id).filter(Boolean),
      });
    }
    results.push(result);
  }

  const orderIds = results.map((r) => text(r.order_id)).filter(Boolean);
  return sendJson(res, 200, {
    success: true,
    order_id: orderIds.join(" + ") || parentOrderId,
    order_ids: orderIds,
    parent_order_id: parentOrderId,
    message: "تم تسجيل الطلب بنجاح.",
  });
}


function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function productHtml(product) {
  const template = fs.readFileSync(path.join(PUBLIC, "index.html"), "utf8");
  const title = `${product.name} | HIJAB MAKKAH`;
  const description = text(product.description || `${product.name} متوفر لدى HIJAB MAKKAH. اختاري المقاس واللون وسجلي الطلب بالدفع عند الاستلام.`).slice(0, 170);
  const canonical = `https://hijab-makka.store/product/${encodeURIComponent(product.id)}`;
  const image = product.main_image || product.images?.[0] || "";
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description,
    sku: product.product_id || product.id,
    image: (product.images || []).filter(Boolean),
    brand: { "@type": "Brand", name: "HIJAB MAKKAH" },
    offers: {
      "@type": "Offer",
      url: canonical,
      priceCurrency: "MAD",
      price: Number(product.price).toFixed(2),
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  }).replaceAll("<", "\\u003c");

  const meta = `
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:locale" content="ar_MA">
  <meta property="og:type" content="product">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  ${image ? `<meta property="og:image" content="${escapeHtml(image)}">` : ""}
  <meta property="product:price:amount" content="${escapeHtml(Number(product.price).toFixed(2))}">
  <meta property="product:price:currency" content="MAD">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">${structuredData}</script>
  `;
  return template
    .replace(/<title>.*?<\/title>/i, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/i, `<meta name="description" content="${escapeHtml(description)}">`)
    .replace("</head>", `${meta}\n</head>`);
}

function staticFile(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, "http://local").pathname);
  let file = pathname === "/" ? path.join(PUBLIC, "index.html") : path.join(PUBLIC, pathname.replace(/^\/+/, ""));
  if (!file.startsWith(PUBLIC)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) file = path.join(PUBLIC, "index.html");
    fs.readFile(file, (readErr, data) => {
      if (readErr) {
        res.writeHead(404);
        return res.end("Not found");
      }
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        "content-type": MIME[ext] || "application/octet-stream",
        "cache-control": [".html", ".css", ".js"].includes(ext) ? "no-cache" : "public, max-age=86400",
      });
      res.end(data);
    });
  });
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://local");

    if (url.pathname === "/health") {
      return sendJson(res, 200, { ok: true, service: "hijab-makkah-store" });
    }

    if (url.pathname === "/api/cities" && req.method === "GET") {
      return sendJson(res, 200, { cities });
    }

    if (url.pathname === "/api/products" && req.method === "GET") {
      try {
        const catalog = await getProducts(url.searchParams.get("refresh") === "1");
        const categories = [...new Map(catalog.safe.map((p) => [p.category_slug, { slug: p.category_slug, label: p.category }])).values()];
        return sendJson(res, 200, {
          products: catalog.safe,
          categories,
          updated_at: new Date(productCache.at).toISOString(),
        });
      } catch (error) {
        return sendJson(res, 502, {
          products: [],
          categories: [],
          message: "تعذر تحميل المنتجات حالياً. حاولي من جديد.",
        });
      }
    }

    if (url.pathname === "/robots.txt" && req.method === "GET") {
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=3600",
      });
      return res.end("User-agent: *\nAllow: /\nSitemap: https://hijab-makka.store/sitemap.xml\n");
    }

    if (url.pathname === "/sitemap.xml" && req.method === "GET") {
      const catalog = await getProducts(false);
      const urls = [
        "https://hijab-makka.store/",
        ...catalog.safe.map(p => `https://hijab-makka.store/product/${encodeURIComponent(p.id)}`)
      ];
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((loc,index)=>`  <url><loc>${escapeHtml(loc)}</loc><changefreq>${index===0?"daily":"weekly"}</changefreq><priority>${index===0?"1.0":"0.8"}</priority></url>`).join("\n")}
</urlset>`;
      res.writeHead(200, {...SECURITY_HEADERS,"content-type":"application/xml; charset=utf-8","cache-control":"public, max-age=3600"});
      return res.end(xml);
    }

    const productMatch = url.pathname.match(/^\/product\/([^/]+)\/?$/i);
    if (productMatch && req.method === "GET") {
      const id = decodeURIComponent(productMatch[1]);
      const catalog = await getProducts(false);
      const product = catalog.safe.find(p => p.id === id || p.product_id === id);
      if (!product) {
        res.writeHead(404, {...SECURITY_HEADERS,"content-type":"text/html; charset=utf-8"});
        return res.end("المنتج غير موجود");
      }
      const page = await productHtml(product);
      res.writeHead(200, {...SECURITY_HEADERS,"content-type":"text/html; charset=utf-8","cache-control":"no-cache"});
      return res.end(page);
    }

    if (url.pathname === "/api/orders" && req.method === "POST") {
      return await createOrder(req, res);
    }

    return staticFile(req, res);
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { success: false, message: "وقع خطأ غير متوقع." });
  }
}).listen(PORT, "0.0.0.0", () => {
  console.log(`HIJAB MAKKAH Store listening on :${PORT}`);
});
