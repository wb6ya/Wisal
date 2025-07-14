// 1. Imports - استيراد المكتبات
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const axios = require('axios');

// Import Models
const Company = require('./models/Company');
const Conversation = require('./models/Conversation');
const Message = require('./models/Message');

// 2. App & Middleware Setup
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'a_very_secret_key_that_should_be_random_and_long',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI })
}));


// 3. Authentication Middleware
const isAuthenticated = (req, res, next) => {
    if (req.session.companyId) {
        next();
    } else {
        res.redirect('/');
    }
};

// 4. Page Routes
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

// 5. API Routes
app.post('/api/register', async (req, res) => {
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
    // --- DEBUGGING LOGS ---
    console.log("--- 'SAVE SETTINGS' ROUTE CALLED ---");
    console.log("Session Company ID:", req.session.companyId);
    console.log("Data Received from Frontend:", req.body);
    // ---------------------

    try {
        const { accessToken, phoneNumberId, verifyToken } = req.body;
        if (!accessToken || !phoneNumberId || !verifyToken) {
            console.log("Error: Missing fields in request body.");
            return res.status(400).json({ message: 'Please fill out all fields' });
        }

        const updateResult = await Company.findByIdAndUpdate(req.session.companyId, {
            $set: {
                whatsapp: {
                    accessToken: accessToken,
                    phoneNumberId: phoneNumberId,
                    verifyToken: verifyToken
                }
            }
        }, { new: true }); // { new: true } returns the updated document

        console.log("Update Result from Database:", updateResult); // Log the result
        res.status(200).json({ message: 'Settings saved successfully!' });

    } catch (error) {
        console.error("Error saving settings:", error);
        res.status(500).json({ message: 'Server error while saving settings' });
    }
});

app.get('/api/conversations', isAuthenticated, async (req, res) => {
    try {
        const conversations = await Conversation.find({ companyId: req.session.companyId }).sort({ updatedAt: -1 });
        res.status(200).json(conversations);
    } catch (error) {
        console.error("Error fetching conversations:", error);
        res.status(500).json({ message: 'Error fetching conversations' });
    }
});

app.get('/api/conversations/:id/messages', isAuthenticated, async (req, res) => {
    try {
        const messages = await Message.find({ conversationId: req.params.id }).sort({ createdAt: 'asc' });
        res.status(200).json(messages);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching messages' });
    }
});

// في index.js
app.post('/api/conversations/:id/reply', isAuthenticated, async (req, res) => {
    try {
        const company = await Company.findById(req.session.companyId);
        if (!company || !company.whatsapp.accessToken) {
            return res.status(401).json({ message: 'رمز الوصول غير موجود. يرجى تحديث الإعدادات.', redirectTo: '/dashboard' });
        }

        // --- خطوة التحقق من صلاحية الرمز ---
        try {
            // سنقوم بطلب بسيط للتأكد من صلاحية الرمز قبل إرسال الرسالة
            await axios.get(`https://graph.facebook.com/v19.0/me?access_token=${company.whatsapp.accessToken}`);
        } catch (authError) {
            // إذا فشل التحقق (غالبًا 401 Unauthorized)
            return res.status(401).json({ message: 'رمز الوصول غير صالح أو منتهي الصلاحية. يرجى تحديثه.', redirectTo: '/dashboard' });
        }
        // --- نهاية خطوة التحقق ---

        const conversation = await Conversation.findById(req.params.id);
        if (!conversation) return res.status(404).json({ message: "Conversation not found" });

        const { message } = req.body;
        const whatsappApiUrl = `https://graph.facebook.com/v19.0/${company.whatsapp.phoneNumberId}/messages`;
        const apiRequestData = {
            messaging_product: "whatsapp", to: conversation.customerPhone, text: { body: message }
        };
        const headers = { 'Authorization': `Bearer ${company.whatsapp.accessToken}` };

        const metaResponse = await axios.post(whatsappApiUrl, apiRequestData, { headers });
        const metaMessageId = metaResponse.data.messages[0].id;

        const sentMessage = new Message({
            conversationId: req.params.id,
            sender: 'agent',
            content: message,
            wabaMessageId: metaMessageId
        });
        await sentMessage.save();
        res.status(200).json(sentMessage);
    } catch (error) {
        console.error("Error sending reply:", error.response ? error.response.data : error.message);
        res.status(500).json({ message: 'Failed to send message' });
    }
});

// 6. Webhook Routes
app.get('/webhook/:companyId', async (req, res) => {
    try {
        const company = await Company.findById(req.params.companyId).select('companyName whatsapp.verifyToken');
        if (!company || !company.whatsapp || !company.whatsapp.verifyToken) return res.sendStatus(404);
        
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        if (mode === 'subscribe' && token === company.whatsapp.verifyToken) {
            console.log(`WEBHOOK_VERIFIED for company: ${company.companyName}`);
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } catch (error) {
        res.sendStatus(500);
    }
});

app.post('/webhook/:companyId', async (req, res) => {
    const body = req.body;
    try {
        if (body.object === 'whatsapp_business_account' && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
            const messageData = body.entry[0].changes[0].value.messages[0];
            const companyId = req.params.companyId;
            const customerPhone = messageData.from;
            const customerName = body.entry[0].changes[0].value.contacts[0].profile.name;

            let conversation = await Conversation.findOne({ companyId, customerPhone });
            if (!conversation) {
                conversation = new Conversation({ companyId, customerPhone, customerName });
                await conversation.save();
            }

            let newMessage;

            // --- التحقق من نوع الرسالة ---
            if (messageData.type === 'text') {
                newMessage = new Message({
                    conversationId: conversation._id,
                    sender: 'customer',
                    messageType: 'text',
                    content: messageData.text.body
                });
            } else if (messageData.type === 'image') {
                const mediaId = messageData.image.id;
                const company = await Company.findById(companyId);
                const accessToken = company.whatsapp.accessToken;

                // جلب رابط الصورة من ميتا باستخدام الـ Media ID
                const mediaUrlResponse = await axios.get(`https://graph.facebook.com/v19.0/${mediaId}`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                const imageUrl = mediaUrlResponse.data.url;

                // تنزيل الصورة غير ضروري، فقط نستخدم الرابط المؤقت
                // لكن يجب إعادة تحميله عند الحاجة لأنه ينتهي

                newMessage = new Message({
                    conversationId: conversation._id,
                    sender: 'customer',
                    messageType: 'image',
                    content: imageUrl // نحفظ رابط الصورة
                });
            }

            if (newMessage) {
                await newMessage.save();
                io.emit('new_message', newMessage);
            }
        } else if (body.object === 'whatsapp_business_account' && body.entry?.[0]?.changes?.[0]?.value?.statuses?.[0]) {
            const statusData = body.entry[0].changes[0].value.statuses[0];
            const messageIdFromMeta = statusData.id;
            const newStatus = statusData.status;

            const updatedMessage = await Message.findOneAndUpdate(
                { wabaMessageId: messageIdFromMeta },
                { status: newStatus },
                { new: true }
            );
            if (updatedMessage) {
                io.emit('message_status_update', { messageId: updatedMessage._id.toString(), status: newStatus });
            }
        }
        res.sendStatus(200);
    } catch (error) {
        console.error("Error processing webhook:", error);
        res.sendStatus(200); // Send 200 to prevent Meta from resending
    }
});

// 7. Database Connection and Server Start
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('تم الاتصال بقاعدة البيانات بنجاح!');
        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => console.log(`الخادم يعمل على المنفذ ${PORT}`));
    })
    .catch(err => console.error("Could not connect to MongoDB:", err));