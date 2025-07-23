// src/middleware/verifyWebhook.js
const crypto = require('crypto');

function verifyWebhookSignature(req, res, next) {
    // 1. احصل على التوقيع من هيدر الطلب
    const signature = req.headers['x-hub-signature-256'];

    if (!signature) {
        console.warn('Webhook received without signature. Rejecting.');
        return res.sendStatus(403); // Forbidden
    }

    // 2. قم بحساب التوقيع المتوقع بنفسك
    // req.body هنا هو الجسم الخام (raw buffer) بفضل التعديل في index.js
    const expectedHash = crypto.createHmac('sha256', process.env.META_APP_SECRET)
                               .update(req.body)
                               .digest('hex');

    const expectedSignature = `sha256=${expectedHash}`;

    // 3. قارن بين التوقيعين
    if (signature !== expectedSignature) {
        console.error('Webhook signature verification failed! Request rejected.');
        return res.sendStatus(403); // Forbidden
    }
    
    // 4. إذا كان التوقيع صحيحًا، قم بتحليل الجسم (parse) ليستطيع الكود التالي التعامل معه
    req.body = JSON.parse(req.body.toString());
    
    // اسمح للطلب بالمرور إلى الخطوة التالية (مسار الـ webhook)
    next();
}

module.exports = verifyWebhookSignature;