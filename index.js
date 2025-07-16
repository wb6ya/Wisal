// 1. IMPORTS
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
const cloudinary = require('cloudinary').v2;

// 2. CONFIGURATIONS
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const Company = require('./models/Company');
const Conversation = require('./models/Conversation');
const Message = require('./models/Message');

// 3. INITIALIZATION
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 4. MIDDLEWARE
app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'your_super_secret_key_for_sessions_12345',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI })
}));

const isAuthenticated = (req, res, next) => {
    if (req.session.companyId) {
        next();
    } else {
        res.redirect('/');
    }
};

// 5. PAGE ROUTES
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.get('/dashboard', isAuthenticated, async (req, res) => {
    try {
        const company = await Company.findById(req.session.companyId);
        if (!company) return res.redirect('/');
        
        const webhookUrl = `${req.protocol}://${req.get('host')}/webhook/${company._id}`;
        
        // --- هذا هو السطر الأهم ---
        // نتأكد من إرسال كل المتغيرات المطلوبة إلى الواجهة
        res.render('dashboard', { 
            company, 
            webhookUrl, 
            cloudName: process.env.CLOUDINARY_CLOUD_NAME 
        });

    } catch (error) {
        console.error("Dashboard Error:", error);
        res.redirect('/');
    }
});

// 6. API ROUTES
app.post('/api/register', async (req, res) => {
    try {
        const { companyName, email, password } = req.body;
        if (!companyName || !email || !password) return res.status(400).json({ message: 'Please fill all fields' });
        const existingCompany = await Company.findOne({ email });
        if (existingCompany) return res.status(400).json({ message: 'Email already exists' });
        const company = new Company({ companyName, email, password });
        await company.save();
        res.status(201).json({ message: 'Company registered successfully!' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const company = await Company.findOne({ email });
        if (!company) return res.status(400).json({ message: 'Invalid email or password' });
        const isMatch = await bcrypt.compare(password, company.password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid email or password' });
        req.session.companyId = company._id;
        res.status(200).json({ message: 'Login successful!', redirectUrl: '/dashboard' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
});

app.post('/api/settings', isAuthenticated, async (req, res) => {
    try {
        const { accessToken, phoneNumberId, verifyToken } = req.body;
        if (!accessToken || !phoneNumberId || !verifyToken) return res.status(400).json({ message: 'Please fill all fields' });
        
        await Company.findByIdAndUpdate(req.session.companyId, {
            $set: {
                whatsapp: {
                    accessToken: accessToken,
                    phoneNumberId: phoneNumberId,
                    verifyToken: verifyToken
                }
            }
        });
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

app.post('/api/conversations/:id/reply', isAuthenticated, async (req, res) => {
    try {
        const company = await Company.findById(req.session.companyId);
        if (!company || !company.whatsapp.accessToken) {
            return res.status(401).json({ message: 'Invalid Access Token. Please update your settings.', redirectTo: '/dashboard' });
        }
        
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
        console.error("Error sending reply:", error);
        res.status(401).json({ message: 'Failed to send message. Please check your Access Token.', redirectTo: '/dashboard' });
    }
});

app.post('/api/conversations/:id/send-image', isAuthenticated, async (req, res) => {
    try {
        const company = await Company.findById(req.session.companyId);
        const conversation = await Conversation.findById(req.params.id);
        const { imageUrl } = req.body;
        if (!company || !conversation || !imageUrl) return res.status(400).json({ message: "Missing data" });

        const whatsappApiUrl = `https://graph.facebook.com/v19.0/${company.whatsapp.phoneNumberId}/messages`;
        const apiRequestData = {
            messaging_product: "whatsapp",
            to: conversation.customerPhone,
            type: "image",
            image: { link: imageUrl }
        };
        const headers = { 'Authorization': `Bearer ${company.whatsapp.accessToken}` };
        const metaResponse = await axios.post(whatsappApiUrl, apiRequestData, { headers });
        const metaMessageId = metaResponse.data.messages[0].id;

        const sentMessage = new Message({
            conversationId: req.params.id,
            sender: 'agent',
            messageType: 'image',
            content: imageUrl,
            wabaMessageId: metaMessageId
        });
        await sentMessage.save();
        res.status(200).json(sentMessage);
    } catch (error) {
        res.status(500).json({ message: 'Failed to send image message' });
    }
});

// 7. WEBHOOK ROUTES
app.get('/webhook/:companyId', async (req, res) => {
    try {
        const company = await Company.findById(req.params.companyId).select('whatsapp.verifyToken');
        if (!company || !company.whatsapp || !company.whatsapp.verifyToken) return res.sendStatus(404);
        
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];
        
        if (mode === 'subscribe' && token === company.whatsapp.verifyToken) {
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

            const company = await Company.findById(companyId);
            if (!company) return res.sendStatus(404);
            const accessToken = company.whatsapp.accessToken;

            let newMessage;
            if (messageData.type === 'text') {
                newMessage = new Message({ conversationId: conversation._id, sender: 'customer', messageType: 'text', content: messageData.text.body });
            } else if (messageData.type === 'image' || messageData.type === 'document') {
                const mediaId = messageData[messageData.type].id;
                const filename = messageData[messageData.type].filename || `${mediaId}.jpg`;
                const mediaInfoResponse = await axios.get(`https://graph.facebook.com/v19.0/${mediaId}`, { headers: { 'Authorization': `Bearer ${accessToken}` }});
                const tempMediaUrl = mediaInfoResponse.data.url;
                const buffer = (await axios.get(tempMediaUrl, { headers: { 'Authorization': `Bearer ${accessToken}` }, responseType: 'arraybuffer' })).data;
                const cloudinaryUploadResponse = await new Promise((resolve, reject) => {
                    cloudinary.uploader.upload_stream({ resource_type: 'auto', public_id: filename, upload_preset: 'whatsapp_files' }, (error, result) => {
                        if (error) reject(error); else resolve(result);
                    }).end(buffer);
                });
                newMessage = new Message({
                    conversationId: conversation._id, sender: 'customer', messageType: messageData.type, content: cloudinaryUploadResponse.secure_url, filename: filename
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
            const updatedMessage = await Message.findOneAndUpdate({ wabaMessageId: messageIdFromMeta }, { status: newStatus }, { new: true });
            if (updatedMessage) {
                io.emit('message_status_update', { messageId: updatedMessage._id.toString(), status: newStatus });
            }
        }
        res.sendStatus(200);
    } catch (error) {
        console.error("Error processing webhook:", error);
        res.sendStatus(200);
    }
});

// 8. SERVER START
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('تم الاتصال بقاعدة البيانات بنجاح!');
        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => console.log(`الخادم يعمل على المنفذ ${PORT}`));
    })
    .catch(err => console.error("Could not connect to MongoDB:", err));