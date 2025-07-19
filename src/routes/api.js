// src/routes/api.js
const express = require('express');
const bcrypt = require('bcrypt');
const axios = require('axios');
const multer = require('multer');
const cloudinary = require('cloudinary').v2; // <-- هذا هو السطر الذي كان ناقصًا
const Company = require('../models/Company');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const CannedResponse = require('../models/CannedResponse');
const { isAuthenticated } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage() });

module.exports = function(io) {
    const router = express.Router();

    // User & Company Management
    router.post('/register', async (req, res) => {
        try {
            const { companyName, email, password } = req.body;
            if (!companyName || !email || !password) return res.status(400).json({ message: 'Please fill all fields' });
            const existingCompany = await Company.findOne({ email });
            if (existingCompany) return res.status(400).json({ message: 'Email already in use' });
            const company = new Company({ companyName, email, password });
            await company.save();
            res.status(201).json({ message: 'Company registered successfully!' });
        } catch (error) {
            res.status(500).json({ message: 'Server error during registration' });
        }
    });

    router.post('/login', async (req, res) => {
        try {
            const { email, password } = req.body;
            const company = await Company.findOne({ email });
            if (!company) return res.status(400).json({ message: 'Invalid email or password' });
            const isMatch = await bcrypt.compare(password, company.password);
            if (!isMatch) return res.status(400).json({ message: 'Invalid email or password' });
            req.session.companyId = company._id;
            res.status(200).json({ message: 'Login successful!', redirectUrl: '/dashboard' });
        } catch (error) {
            res.status(500).json({ message: 'Server error during login' });
        }
    });

    router.post('/settings', isAuthenticated, async (req, res) => {
        try {
            const { accessToken, phoneNumberId, verifyToken } = req.body;
            if (!accessToken || !phoneNumberId || !verifyToken) return res.status(400).json({ message: 'Please fill all fields' });
            await Company.findByIdAndUpdate(req.session.companyId, {
                $set: { 'whatsapp.accessToken': accessToken, 'whatsapp.phoneNumberId': phoneNumberId, 'whatsapp.verifyToken': verifyToken }
            });
            res.status(200).json({ message: 'Settings saved successfully!' });
        } catch (error) {
            res.status(500).json({ message: 'Server error while saving settings' });
        }
    });

    // Conversation & Message Management
    router.get('/conversations', isAuthenticated, async (req, res) => {
        try {
            const conversations = await Conversation.find({ companyId: req.session.companyId }).sort({ lastMessageTimestamp: -1 });
            res.status(200).json(conversations);
        } catch (error) {
            res.status(500).json({ message: 'Error fetching conversations' });
        }
    });

    router.get('/conversations/:id/messages', isAuthenticated, async (req, res) => {
        try {
            const conversation = await Conversation.findById(req.params.id);
            if (conversation && conversation.unreadCount > 0) {
                conversation.unreadCount = 0;
                await conversation.save();
                io.to(req.session.companyId.toString()).emit('conversation_updated', conversation);
            }
            const messages = await Message.find({ conversationId: req.params.id }).sort({ createdAt: 'asc' });
            res.status(200).json(messages);
        } catch (error) {
            res.status(500).json({ message: 'Error fetching messages' });
        }
    });

    router.post('/conversations/:id/reply', isAuthenticated, async (req, res) => {
        try {
            const companyId = req.session.companyId;
            const company = await Company.findById(companyId);
            if (!company || !company.whatsapp.accessToken) return res.status(401).json({ message: 'Invalid Access Token.', redirectTo: '/dashboard' });
            
            const conversation = await Conversation.findById(req.params.id);
            if (!conversation) return res.status(404).json({ message: "Conversation not found" });

            const { message } = req.body;
            const whatsappApiUrl = `https://graph.facebook.com/v19.0/${company.whatsapp.phoneNumberId}/messages`;
            const apiRequestData = { messaging_product: "whatsapp", to: conversation.customerPhone, text: { body: message } };
            const headers = { 'Authorization': `Bearer ${company.whatsapp.accessToken}` };
            const metaResponse = await axios.post(whatsappApiUrl, apiRequestData, { headers });
            const metaMessageId = metaResponse.data.messages[0].id;

            const sentMessage = new Message({
                conversationId: req.params.id, sender: 'agent', messageType: 'text', content: message, wabaMessageId: metaMessageId
            });
            await sentMessage.save();
            
            conversation.lastMessage = sentMessage.content;
            conversation.lastMessageTimestamp = sentMessage.createdAt;
            await conversation.save();
            
            io.to(companyId.toString()).emit('conversation_updated', conversation);
            io.to(companyId.toString()).emit('new_message', sentMessage);
            res.status(200).json(sentMessage);
        } catch (error) {
            const errorMessage = error.response?.data?.error?.message || 'Failed to send message.';
            res.status(401).json({ message: errorMessage, redirectTo: '/dashboard' });
        }
    });

    router.post('/conversations/:id/send-media', isAuthenticated, upload.single('mediaFile'), async (req, res) => {
        try {
            const companyId = req.session.companyId;
            const company = await Company.findById(companyId);
            const conversation = await Conversation.findById(req.params.id);
            if (!req.file || !company || !conversation) {
                return res.status(400).json({ message: "Missing file or required data" });
            }

            const file = req.file;
            const resourceTypeForUpload = file.mimetype.startsWith('image/') ? 'image' : (file.mimetype.startsWith('video/') ? 'video' : 'raw');
            const originalFilename = file.originalname;

            const cloudinaryUploadResponse = await new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream({
                    resource_type: resourceTypeForUpload,
                    public_id: originalFilename,
                    upload_preset: 'whatsapp_files'
                }, (error, result) => {
                    if (error) return reject(error);
                    resolve(result);
                });
                uploadStream.end(file.buffer);
            });

            const mediaUrl = cloudinaryUploadResponse.secure_url;
            let apiRequestData;
            let messageTypeForDB;

            if (resourceTypeForUpload === 'image') {
                apiRequestData = { messaging_product: "whatsapp", to: conversation.customerPhone, type: "image", image: { link: mediaUrl } };
                messageTypeForDB = 'image';
            } else if (resourceTypeForUpload === 'video') {
                apiRequestData = { messaging_product: "whatsapp", to: conversation.customerPhone, type: "video", video: { link: mediaUrl } };
                messageTypeForDB = 'video';
            } else {
                apiRequestData = { messaging_product: "whatsapp", to: conversation.customerPhone, type: "document", document: { link: mediaUrl, filename: originalFilename } };
                messageTypeForDB = 'document';
            }

            const headers = { 'Authorization': `Bearer ${company.whatsapp.accessToken}` };
            const metaResponse = await axios.post(`https://graph.facebook.com/v19.0/${company.whatsapp.phoneNumberId}/messages`, apiRequestData, { headers });
            const metaMessageId = metaResponse.data.messages[0].id;

            const sentMessage = new Message({
                conversationId: req.params.id,
                sender: 'agent',
                messageType: messageTypeForDB,
                content: mediaUrl,
                filename: originalFilename,
                wabaMessageId: metaMessageId
            });
            await sentMessage.save();

            conversation.lastMessage = messageTypeForDB === 'image' ? 'Image' : originalFilename;
            conversation.lastMessageTimestamp = sentMessage.createdAt;
            await conversation.save();

            io.to(companyId.toString()).emit('conversation_updated', conversation);
            io.to(companyId.toString()).emit('new_message', sentMessage);
            res.status(200).json(sentMessage);
        } catch (error) {
            console.error("Error sending media:", error.response ? error.response.data : error);
            res.status(500).json({ message: 'Failed to send media' });
        }
    });

    router.get('/download/:messageId', isAuthenticated, async (req, res) => {
        try {
            const message = await Message.findById(req.params.messageId);
            if (!message || !message.content || message.messageType === 'text') {
                return res.status(404).send('File not found.');
            }

            // The 'content' field stores the public_id of the file
            const publicId = message.content;
            
            // Generate a signed, expiring download URL from Cloudinary
            const downloadUrl = cloudinary.url(publicId, {
                resource_type: 'raw',
                attachment: message.filename, // This sets the filename for download
                sign_url: true, // This makes the URL secure
                expires_at: Math.floor(Date.now() / 1000) + 3600 // URL is valid for 1 hour
            });
            
            // Redirect the user to this secure download URL
            res.redirect(downloadUrl);

        } catch (error) {
            console.error("Download Error:", error);
            res.status(500).send('Could not generate download link.');
        }
    });

    return router;
};