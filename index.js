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
const multer = require('multer');
const mime = require('mime-types');
const upload = multer({ storage: multer.memoryStorage() });

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
app.set('views', path.join(__dirname, 'views'));
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

app.get('/api/download/:messageId', isAuthenticated, async (req, res) => {
    try {
        const message = await Message.findById(req.params.messageId);
        if (!message || message.messageType === 'text') {
            return res.status(404).send('File not found.');
        }

        // 1. جلب الملف من Cloudinary كـ stream
        const response = await axios({
            method: 'GET',
            url: message.content, // رابط Cloudinary
            responseType: 'stream'
        });

        // 2. إعداد الهيدرز الصحيحة للتحميل
        const contentType = mime.lookup(message.filename) || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(message.filename)}"`);

        // 3. إرسال الملف مباشرة إلى المتصفح
        response.data.pipe(res);

    } catch (error) {
        console.error("Download Error:", error);
        res.status(500).send('Could not download the file.');
    }
});
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
        const conversations = await Conversation.find({ companyId: req.session.companyId }).sort({ lastMessageTimestamp: -1 });
        res.status(200).json(conversations);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching conversations' });
    }
});

app.get('/api/conversations/:id/messages', isAuthenticated, async (req, res) => {
    try {
        const conversation = await Conversation.findById(req.params.id);
        if (conversation && conversation.unreadCount > 0) {
            conversation.unreadCount = 0;
            await conversation.save();
            io.emit('conversation_updated', conversation);
        }
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
        
        conversation.lastMessage = sentMessage.content;
        conversation.lastMessageTimestamp = sentMessage.createdAt;
        await conversation.save();

        io.emit('conversation_updated', conversation);
        res.status(200).json(sentMessage);
    } catch (error) {
        console.error("--- DETAILED SENDING ERROR ---", error.response ? error.response.data : error.message);
        console.error("Error sending reply:", error);
        res.status(401).json({ message: 'Failed to send message. Please check your Access Token.', redirectTo: '/dashboard' });
    }
});

app.post('/api/conversations/:id/send-media', isAuthenticated, upload.single('mediaFile'), async (req, res) => {
    try {
        const company = await Company.findById(req.session.companyId);
        const conversation = await Conversation.findById(req.params.id);
        if (!req.file || !company || !conversation) {
            return res.status(400).json({ message: "Missing file or required data" });
        }

        const file = req.file;
        const originalFilename = file.originalname;

        let resourceType;
        if (file.mimetype.startsWith('image/')) {
            resourceType = 'image';
        } else if (file.mimetype.startsWith('video/')) {
            resourceType = 'video';
        } else {
            resourceType = 'raw'; // 'raw' للمستندات والملفات الأخرى
        }

        const cloudinaryUploadResponse = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream({
                resource_type: resourceType,
                upload_preset: 'whatsapp_files'
            }, (error, result) => {
                if (error) reject(error); else resolve(result);
            });
            uploadStream.end(file.buffer);
        });

        const mediaUrl = cloudinaryUploadResponse.secure_url;

        let apiRequestData;
        let messageTypeForDB;

        if (resourceType === 'image') {
            apiRequestData = { messaging_product: "whatsapp", to: conversation.customerPhone, type: "image", image: { link: mediaUrl } };
            messageTypeForDB = 'image';
        } else if (resourceType === 'video') {
            apiRequestData = { messaging_product: "whatsapp", to: conversation.customerPhone, type: "video", video: { link: mediaUrl } };
            messageTypeForDB = 'video';
        } else { // للمستندات
            apiRequestData = { messaging_product: "whatsapp", to: conversation.customerPhone, type: "document", document: { link: mediaUrl, filename: originalFilename } };
            messageTypeForDB = 'document';
        }

        const headers = { 'Authorization': `Bearer ${company.whatsapp.accessToken}` };
        const metaResponse = await axios.post(`https://graph.facebook.com/v19.0/${company.whatsapp.phoneNumberId}/messages`, apiRequestData, { headers });
        const metaMessageId = metaResponse.data.messages[0].id;

        const sentMessage = new Message({
            conversationId: req.params.id,
            sender: 'agent',
            messageType: resourceType,
            content: mediaUrl,
            filename: originalFilename,
            wabaMessageId: metaMessageId
        });
        await sentMessage.save();

        conversation.lastMessage = resourceType === 'image' ? 'Image' : originalFilename;
        conversation.lastMessageTimestamp = sentMessage.createdAt;
        await conversation.save();
        
        io.emit('conversation_updated', conversation);
        res.status(200).json(sentMessage);
    } catch (error) {
        console.error("Error sending media:", error);
        res.status(500).json({ message: 'Failed to send media' });
    }
});

app.post('/webhook/:companyId', async (req, res) => {
    const body = req.body;
    try {
        if (body.object === 'whatsapp_business_account' && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
            const value = body.entry[0].changes[0].value;
            const messageData = value.messages[0];
            const companyId = req.params.companyId;
            const customerPhone = messageData.from;
            const customerName = value.contacts[0].profile.name;

            let conversation = await Conversation.findOne({ companyId, customerPhone });
            if (!conversation) {
                conversation = new Conversation({ companyId, customerPhone, customerName });
            }

            const company = await Company.findById(companyId);
            if (!company) return res.sendStatus(404);
            const accessToken = company.whatsapp.accessToken;

            let replyContext = { repliedToMessageId: null, repliedToMessageContent: null, repliedToMessageSender: null };
            if (messageData.context && messageData.context.id) {
                const originalMessage = await Message.findOne({ wabaMessageId: messageData.context.id });
                if (originalMessage) {
                    const originalSenderName = originalMessage.sender === 'agent' ? company.companyName : customerName;
                    const originalContent = originalMessage.messageType === 'text' ? originalMessage.content : (originalMessage.filename || `a ${originalMessage.messageType}`);
                    replyContext.repliedToMessageId = originalMessage._id;
                    replyContext.repliedToMessageContent = originalContent.substring(0, 70) + (originalContent.length > 70 ? '...' : '');
                    replyContext.repliedToMessageSender = originalSenderName;
                }
            }

            let newMessage;
            const messageType = messageData.type;
            const mediaTypes = ['image', 'document', 'audio', 'video'];

            if (messageType === 'text') {
                newMessage = new Message({ conversationId: conversation._id, sender: 'customer', messageType: 'text', content: messageData.text.body, ...replyContext });
            } else if (mediaTypes.includes(messageType)) {
                const mediaId = messageData[messageType].id;
                const originalFilename = messageData[messageType].filename || `${mediaId}`;
                
                const mediaInfoResponse = await axios.get(`https://graph.facebook.com/v19.0/${mediaId}`, { headers: { 'Authorization': `Bearer ${accessToken}` }});
                const tempMediaUrl = mediaInfoResponse.data.url;
                const buffer = (await axios.get(tempMediaUrl, { headers: { 'Authorization': `Bearer ${accessToken}` }, responseType: 'arraybuffer' })).data;
                
                const resourceTypeForUpload = ['image', 'video'].includes(messageType) ? 'video' : 'raw';
                
                // --- هذا هو التعديل الأهم: تنظيف اسم الملف ---
                const sanitizedFilename = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');

                const cloudinaryUploadResponse = await new Promise((resolve, reject) => {
                    cloudinary.uploader.upload_stream({ 
                        resource_type: resourceTypeForUpload, 
                        public_id: sanitizedFilename, // استخدام الاسم النظيف
                        upload_preset: 'whatsapp_files' 
                    }, (error, result) => {
                        if (error) reject(error); else resolve(result);
                    }).end(buffer);
                });

                newMessage = new Message({
                    conversationId: conversation._id, 
                    sender: 'customer', 
                    messageType: messageType, 
                    content: cloudinaryUploadResponse.secure_url, 
                    filename: originalFilename, // حفظ الاسم الأصلي للعرض
                    ...replyContext
                });
            }

            if (newMessage) {
                await newMessage.save();
                conversation.lastMessage = newMessage.messageType === 'text' ? newMessage.content : (newMessage.filename || newMessage.messageType.charAt(0).toUpperCase() + newMessage.messageType.slice(1));
                conversation.lastMessageTimestamp = newMessage.createdAt;
                conversation.unreadCount = (conversation.unreadCount || 0) + 1;
                await conversation.save();
                io.emit('new_message', newMessage);
                io.emit('conversation_updated', conversation);
            }
        // --- 2. التعامل مع تحديثات الحالة ---
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
        res.sendStatus(200); // Always send 200 to prevent Meta from resending
    }
});

// 8. SERVER START
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('Database connected successfully!');
        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch(err => console.error("Could not connect to MongoDB:", err));