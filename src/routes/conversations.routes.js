// src/routes/conversations.routes.js
const express = require('express');
const axios = require('axios');
const multer = require('multer');
const { isAuthenticated } = require('../middleware/auth');
const Company = require('../models/Company');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

const upload = multer({ storage: multer.memoryStorage() });

module.exports = function(io) {
    const router = express.Router();

    // GET all conversations for the logged-in company
    router.get('/', isAuthenticated, async (req, res) => {
        try {
            const conversations = await Conversation.find({ companyId: req.session.companyId }).sort({ lastMessageTimestamp: -1 });
            res.status(200).json(conversations);
        } catch (error) {
            console.error("Error fetching conversations:", error);
            res.status(500).json({ message: 'Error fetching conversations' });
        }
    });

    // GET all messages for a specific conversation
    router.get('/:id/messages', isAuthenticated, async (req, res) => {
        try {
            const conversation = await Conversation.findOne({ _id: req.params.id, companyId: req.session.companyId });
            if (!conversation) return res.status(404).json({ message: "Conversation not found" });

            if (conversation.unreadCount > 0) {
                conversation.unreadCount = 0;
                await conversation.save();
                io.to(req.session.companyId.toString()).emit('conversation_updated', conversation);
            }
            const messages = await Message.find({ conversationId: req.params.id }).sort({ createdAt: 'asc' });
            res.status(200).json(messages);
        } catch (error) {
            console.error("Error fetching messages:", error);
            res.status(500).json({ message: 'Error fetching messages' });
        }
    });

    // POST a text reply to a conversation
    router.post('/:id/reply', isAuthenticated, async (req, res) => {
        try {
            const companyId = req.session.companyId;
            const company = await Company.findById(companyId);
            if (!company || !company.whatsapp.accessToken) {
                return res.status(401).json({ message: 'Invalid Access Token. Please update your settings.', redirectTo: '/dashboard' });
            }
            const conversation = await Conversation.findById(req.params.id);
            if (!conversation) return res.status(404).json({ message: "Conversation not found" });

            const { message, contextMessageId } = req.body;
            const whatsappApiUrl = `https://graph.facebook.com/v19.0/${company.whatsapp.phoneNumberId}/messages`;
            const apiRequestData = {
                messaging_product: "whatsapp",
                to: conversation.customerPhone,
                text: { body: message }
            };
            // Add context if it's a reply
            if (contextMessageId) {
                const originalMessage = await Message.findById(contextMessageId);
                if (originalMessage) {
                    apiRequestData.context = { message_id: originalMessage.wabaMessageId };
                }
            }

            const headers = { 'Authorization': `Bearer ${company.whatsapp.accessToken}` };
            const metaResponse = await axios.post(whatsappApiUrl, apiRequestData, { headers });
            const metaMessageId = metaResponse.data.messages[0].id;

            const sentMessage = new Message({
                conversationId: req.params.id,
                sender: 'agent',
                messageType: 'text',
                content: message,
                wabaMessageId: metaMessageId
            });
            await sentMessage.save();
            
            conversation.lastMessage = sentMessage.content;
            conversation.lastMessageTimestamp = sentMessage.createdAt;
            await conversation.save();
            
            io.to(companyId.toString()).emit('conversation_updated', conversation);
            io.to(companyId.toString()).emit('new_message', sentMessage);
            res.status(200).json(sentMessage);
        } catch (error) {
            console.error("Error sending reply:", error.response ? error.response.data : error);
            const errorMessage = error.response?.data?.error?.message || 'Failed to send message.';
            res.status(401).json({ message: errorMessage, redirectTo: '/dashboard' });
        }
    });

    // POST a media file to a conversation
    router.post('/:id/send-media', isAuthenticated, upload.single('mediaFile'), async (req, res) => {
        try {
            const companyId = req.session.companyId;
            const company = await Company.findById(companyId);
            const conversation = await Conversation.findById(req.params.id);
            if (!req.file || !company || !conversation) {
                return res.status(400).json({ message: "Missing file or required data" });
            }

            const file = req.file;
            const resourceType = file.mimetype.startsWith('image/') ? 'image' : (file.mimetype.startsWith('video/') ? 'video' : 'raw');
            const originalFilename = file.originalname;

            const cloudinaryUploadResponse = await new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream({
                    resource_type: resourceType,
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

            if (resourceType === 'image') {
                apiRequestData = { messaging_product: "whatsapp", to: conversation.customerPhone, type: "image", image: { link: mediaUrl } };
                messageTypeForDB = 'image';
            } else if (resourceType === 'video') {
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

    // POST to initiate a new conversation with a template
    router.post('/initiate', isAuthenticated, async (req, res) => {
        try {
            const { customerPhone, templateName } = req.body;
            if (!customerPhone || !templateName) {
                return res.status(400).json({ message: "Customer phone and template name are required." });
            }

            const company = await Company.findById(req.session.companyId);
            if (!company || !company.whatsapp.accessToken) {
                return res.status(401).json({ message: "Invalid Access Token." });
            }
            
            const whatsappApiUrl = `https://graph.facebook.com/v19.0/${company.whatsapp.phoneNumberId}/messages`;
            
            const apiRequestData = {
                messaging_product: "whatsapp",
                to: customerPhone,
                type: "template",
                template: {
                    name: templateName,
                    language: {
                        code: "ar"
                    }
                }
            };

            const headers = { 'Authorization': `Bearer ${company.whatsapp.accessToken}` };
            await axios.post(whatsappApiUrl, apiRequestData, { headers });

            res.status(200).json({ message: `Template message sent to ${customerPhone}` });
        } catch (error) {
            console.error("Error sending template message:", error.response ? error.response.data : error);
            res.status(500).json({ message: 'Failed to send template message' });
        }
    });

    return router;
};