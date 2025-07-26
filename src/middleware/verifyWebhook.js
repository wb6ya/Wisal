// src/middleware/verifyWebhook.js
const crypto = require('crypto');

function verifyWebhookSignature(req, res, next) {
    console.log('\n--- [Security Check] Verifying Webhook Signature ---');
    
    const signature = req.headers['x-hub-signature-256'];
    
    if (!signature) {
        console.error('### REJECTED (Reason: Missing Signature Header)');
        return res.sendStatus(403);
    }

    // حساب التوقيع المتوقع
    const expectedHash = crypto.createHmac('sha256', process.env.META_APP_SECRET)
                               .update(req.body) // req.body هو الجسم الخام هنا
                               .digest('hex');

    const expectedSignature = `sha256=${expectedHash}`;

    console.log(`Received Signature:  "${signature}"`);
    console.log(`Calculated Signature: "${expectedSignature}"`);

    if (signature !== expectedSignature) {
        console.error('### REJECTED (Reason: Signatures DO NOT MATCH!)');
        console.error('Please check your META_APP_SECRET in the .env file.');
        return res.sendStatus(403);
    }
    
    console.log('✅ SUCCESS: Signature Verified. Passing request to main webhook logic.');
    req.body = JSON.parse(req.body.toString());
    next();
}

module.exports = verifyWebhookSignature;