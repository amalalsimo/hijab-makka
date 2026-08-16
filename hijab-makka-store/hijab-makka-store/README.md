# HIJAB MAKKAH — Standalone Store

نسخة مستقلة عن YouCan مهيأة لـ Coolify.

## Coolify
- Base Directory: `/hijab-makka-store`
- Build Pack: Nixpacks
- Port: `3000`
- Start Command: `npm start` (غالباً Nixpacks يكتشفها تلقائياً)

## الربط الحالي
واجهة المتجر تتصل مباشرة بخدمات n8n الحالية:
- المنتجات: `https://n8n.amalal.cloud/webhook/hijab-makka-all-products`
- الطلبات: `https://n8n.amalal.cloud/webhook/makkah-store-order`
- زيارات المتجر: `https://n8n.amalal.cloud/webhook/hijab-makka-visitor`
- Chatbot: webhook الحالي الخاص بـ HIJAB MAKKAH

## مهم
هذه المرحلة تنقل الواجهة خارج YouCan مع الحفاظ على المنطق الحالي. لا تغيّر الدومين الرئيسي إلى Coolify حتى تنجح اختبارات المنتجات والطلب وواتساب والتتبع.
