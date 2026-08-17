# HIJAB MAKKAH — New Store

متجر جديد من الصفر، لا يعتمد على واجهة YouCan أو تصميم المتجر السابق.

## المصدر الحقيقي
- المنتجات تُجلب وقت التشغيل من:
  `https://n8n.amalal.cloud/webhook/hijab-makka-store-products-v2`
- الطلبات تُرسل إلى:
  `https://n8n.amalal.cloud/webhook/makkah-store-order`

## المعمارية
Browser → نفس السيرفر → `/api/products` و`/api/orders` → n8n

السيرفر يخفي الحقول الداخلية الحساسة (supplier price/profit/source metadata) عن الواجهة، ويعيد التحقق من السعر والتوفر قبل إرسال الطلب.

## الواجهة
- تصميم جديد بالكامل.
- RTL + Mobile-first.
- بحث وتصنيفات.
- صفحة/Modal احترافية للمنتج.
- صور + مقاسات + ألوان حقيقية من الـ API.
- سلة طلب.
- Checkout بالدفع عند الاستلام.
- المدن الحقيقية المستعملة في النظام الحالي.
- نجاح الطلب مع رقم الطلب.

## Coolify
- Build Pack: Nixpacks
- Port: 3000
- Start: `npm start`
- Base Directory: `/` إذا رفعت محتويات المجلد مباشرة إلى جذر الـRepository.

## Environment Variables (اختيارية)
القيم الافتراضية مضمنة لتعمل مباشرة، ويمكن تغييرها في Coolify:
- `HM_PRODUCTS_URL`
- `HM_ORDER_WEBHOOK_URL`

## اختبار قبل تغيير الدومين
1. `/health`
2. تحميل المنتجات.
3. فتح منتج واختيار المقاس واللون.
4. إضافة المنتج للسلة.
5. طلب تجريبي.
6. تأكد أن الطلب وصل إلى n8n قبل ربط `hijab-makka.store`.


## تحديث الهوية والروابط
- تمت إضافة الشعار المعتمد الجديد في Header وFooter.
- Footer كامل: التسوق، خدمة الزبناء، معلومات الطلب، WhatsApp والهاتف.
- كل منتج عنده رابط مستقل:
  `https://hijab-makka.store/product/PRODUCT_ID`
- فتح رابط المنتج مباشرة يعرض نفس المنتج حتى بعد مشاركة الرابط.
- زر لنسخ رابط المنتج من صفحة التفاصيل.


## V3 — الهوية والأيقونات
- اعتماد الشعار الموافق عليه بخلفية شفافة بالكامل.
- إزالة أي خلفية أو إطار من الشعار في Header وFooter.
- إضافة Font Awesome للمتجر كامل.
- تحديث أيقونات السلة، البحث، التوصيل، الدفع، واتساب، الهاتف، الإغلاق، الحذف، الكمية، الروابط والتأكيد.
- روابط المنتجات المستقلة `/product/:id` ما زالت مفعلة.


## V4 — Professional Storefront
- صفحة منتج حقيقية مستقلة على `/product/:id` بدل الاعتماد على Modal.
- Gallery كبيرة + thumbnails.
- اختيار المقاس واللون داخل صفحة المنتج.
- اللون يغيّر الصورة عند توفر صورة خاصة به.
- Related Products.
- مشاركة المنتج وWhatsApp ونسخ الرابط.
- Sort حسب السعر والاسم.
- Product SEO ديناميكي: title / description / Open Graph / canonical.
- Sitemap ديناميكي يشمل كل روابط المنتجات.
- Floating WhatsApp.
- نفس `/api/products` ونفس `/api/orders` ونفس التحقق من السعر والتوفر.
