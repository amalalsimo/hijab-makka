# HIJAB MAKKAH — Standalone Pro V2

هذه النسخة مبنية مباشرة على ملف المتجر الحالي الذي كان يعمل مع منتجات HIJAB MAKKAH.

## ما بقي كما هو
- مصدر المنتجات الحالي: `hijab-makka-store-products-v2`
- Webhook الطلب الحالي: `makkah-store-order`
- تتبع الطلب الحالي: `hijab-makka-order-status`
- نفس منطق المنتجات، الألوان، المقاسات، الصور، الموردين داخلياً، التخفيضات، WhatsApp وMeta tracking.

## ما تم تحسينه
- واجهة أكثر احترافية وسلاسة.
- تحسين الهاتف والحاسوب.
- Skeleton أثناء تحميل المنتجات.
- صور Lazy Loading وAsync Decoding.
- Checkout أوضح وأهدأ بصرياً.
- إخفاء اسم المورد من العرض للعميل مع إبقائه داخلياً لمسار الطلب.
- إزالة الاعتماد على صور ثابتة مستضافة في YouCan.
- PWA manifest + robots + sitemap.
- خادم Node بسيط مناسب لـ Coolify/Nixpacks.

## Coolify
- Build Pack: Nixpacks
- Port: 3000
- Start Command: `npm start`
- إذا رفعت محتويات هذا المجلد مباشرة في Root الريبو: Base Directory = `/`

لا تحول `hijab-makka.store` إلى هذه النسخة قبل تجربة:
1. تحميل المنتجات.
2. اختيار اللون والمقاس.
3. تسجيل طلب تجريبي.
4. WhatsApp والتتبع.
