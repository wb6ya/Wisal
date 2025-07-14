// 1. Imports - استيراد المكتبات
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const Company = require('./models/Company');
const Conversation = require('./models/Conversation');
const Message = require('./models/Message');

// 2. App & Middleware - إعداد التطبيق والأوامر الوسيطة
const app = express();
app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // لخدمة الملفات الثابتة مثل index.html
app.use(session({
    secret: 'a_very_secret_key_that_should_be_random',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI })
}));

// 3. Middleware for Authentication - حارس أمن للتحقق من تسجيل الدخول
const isAuthenticated = (req, res, next) => {
    if (req.session.companyId) {
        next();
    } else {
        res.redirect('/');
    }
};

// 4. Page Routes - مسارات الصفحات
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', isAuthenticated, async (req, res) => {
    try {
        const company = await Company.findById(req.session.companyId);
        if (!company) return res.redirect('/');
        
        const webhookUrl = `${req.protocol}://${req.get('host')}/webhook/${company._id}`;
        res.render('dashboard', { company, webhookUrl });
    } catch (error) {
        console.error("Dashboard Error:", error);
        res.redirect('/');
    }
});

// 5. API Routes - مسارات الواجهة البرمجية
app.post('/api/register', async (req, res) => {
    // ... (Your existing register logic is fine)
    try {
        const { companyName, email, password } = req.body;
        if (!companyName || !email || !password) return res.status(400).json({ message: 'الرجاء إدخال جميع الحقول' });
        const existingCompany = await Company.findOne({ email });
        if (existingCompany) return res.status(400).json({ message: 'هذا البريد الإلكتروني مستخدم بالفعل' });
        const company = new Company({ companyName, email, password });
        await company.save();
        res.status(201).json({ message: 'تم تسجيل الشركة بنجاح!' });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم', error });
    }
});

app.post('/api/login', async (req, res) => {
    // ... (Your existing login logic is fine)
    try {
        const { email, password } = req.body;
        const company = await Company.findOne({ email });
        if (!company) return res.status(400).json({ message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
        const isMatch = await bcrypt.compare(password, company.password);
        if (!isMatch) return res.status(400).json({ message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
        req.session.companyId = company._id;
        res.status(200).json({ message: 'تم تسجيل الدخول بنجاح!', redirectUrl: '/dashboard' });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم', error });
    }
});

app.post('/api/settings', isAuthenticated, async (req, res) => {
    // ... (Your existing settings logic is fine)
    try {
        const { accessToken, phoneNumberId, verifyToken } = req.body; // Added verifyToken here
        if (!accessToken || !phoneNumberId || !verifyToken) return res.status(400).json({ message: 'الرجاء إدخال جميع الحقول' });
        await Company.findByIdAndUpdate(req.session.companyId, {
            $set: { 'whatsapp.accessToken': accessToken, 'whatsapp.phoneNumberId': phoneNumberId, 'whatsapp.verifyToken': verifyToken }
        });
        res.status(200).json({ message: 'تم حفظ الإعدادات بنجاح!' });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// 6. Webhook Routes - مسارات واتساب
app.get('/webhook/:companyId', async (req, res) => {
    try {
        const company = await Company.findById(req.params.companyId).select('companyName whatsapp.verifyToken');
        
        if (!company || !company.whatsapp || !company.whatsapp.verifyToken) {
            console.log(`Webhook Error: Company or verify token not found for ID: ${req.params.companyId}`);
            return res.sendStatus(404);
        }

        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];
        
        if (mode === 'subscribe' && token === company.whatsapp.verifyToken) {
            console.log(`SUCCESS: Webhook verified for company: ${company.companyName}`);
            res.status(200).send(challenge);
        } else {
            console.log(`FAILED: Token mismatch for company: ${company.companyName}`);
            res.sendStatus(403);
        }
    } catch (error) {
        console.error(`CRITICAL WEBHOOK ERROR for ID: ${req.params.companyId}`, error);
        res.sendStatus(500);
    }
});
app.post('/webhook/:companyId', async (req, res) => {
    const companyId = req.params.companyId;
    const body = req.body;

    try {
        // تأكد من أن الرسالة من واتساب وأنها رسالة نصية واردة
        if (body.object === 'whatsapp_business_account' && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
            
            const messageData = body.entry[0].changes[0].value.messages[0];
            const customerPhone = messageData.from;
            const messageContent = messageData.text.body;
            const customerName = body.entry[0].changes[0].value.contacts[0].profile.name;

            console.log(`--- NEW MESSAGE RECEIVED for company ${companyId} ---`);
            console.log(`From: ${customerName} (${customerPhone})`);
            console.log(`Message: ${messageContent}`);

            // 1. ابحث عن محادثة حالية أو أنشئ واحدة جديدة
            let conversation = await Conversation.findOne({ companyId: companyId, customerPhone: customerPhone });

            if (!conversation) {
                conversation = new Conversation({
                    companyId: companyId,
                    customerPhone: customerPhone,
                    customerName: customerName
                });
                await conversation.save();
                console.log("New conversation created.");
            }

            // 2. احفظ الرسالة الجديدة في قاعدة البيانات
            const newMessage = new Message({
                conversationId: conversation._id,
                sender: 'customer',
                content: messageContent
            });
            await newMessage.save();
            console.log("Message saved to database.");

        }
        res.sendStatus(200); // أرسل رد نجاح إلى ميتا
    } catch (error) {
        console.error("Error processing webhook:", error);
        res.sendStatus(500); // أبلغ ميتا بوجود خطأ
    }
});
// 7. Database Connection and Server Start - الاتصال بالقاعدة والتشغيل
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('تم الاتصال بقاعدة البيانات بنجاح!');
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => console.log(`الخادم يعمل على المنفذ ${PORT}`));
    })
    .catch(err => console.error("Could not connect to MongoDB:", err));
    