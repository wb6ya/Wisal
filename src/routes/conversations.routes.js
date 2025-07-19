// src/routes/conversations.routes.js
const express = require('express');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const { isAuthenticated } = require('../middleware/auth');
const cloudinary = require('cloudinary').v2;
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
            let originalMessage = null;
            // Add context if it's a reply
            if (contextMessageId) {
                originalMessage = await Message.findById(contextMessageId);
                if (originalMessage) {
                    apiRequestData.context = { message_id: originalMessage.wabaMessageId };
                }
            }

            const headers = { 'Authorization': `Bearer ${company.whatsapp.accessToken}` };
            const metaResponse = await axios.post(whatsappApiUrl, apiRequestData, { headers });
            const metaMessageId = metaResponse.data.messages[0].id;

            const sentMessageData = {
                conversationId: req.params.id,
                sender: 'agent',
                messageType: 'text',
                content: message,
                wabaMessageId: metaMessageId
            };

            if (originalMessage) {
                const originalSenderName = originalMessage.sender === 'agent' ? company.companyName : conversation.customerName;
                const originalContent = originalMessage.messageType === 'text' ? originalMessage.content : (originalMessage.filename || `a ${originalMessage.messageType}`);
                sentMessageData.repliedToMessageId = originalMessage._id;
                sentMessageData.repliedToMessageContent = originalContent.substring(0, 70) + (originalContent.length > 70 ? '...' : '');
                sentMessageData.repliedToMessageSender = originalSenderName;
            }

            const sentMessage = new Message(sentMessageData);
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
            if (!req.file || !company || !conversation || !company.whatsapp.accessToken) {
                return res.status(400).json({ message: "Missing file, company data, or access token." });
            }

            const file = req.file;
            const originalFilename = file.originalname;

            // Step 1: Upload media to WhatsApp to get a media ID
            const form = new FormData();
            form.append('messaging_product', 'whatsapp');
            form.append('file', file.buffer, {
                filename: originalFilename,
                contentType: file.mimetype,
            });

            const uploadHeaders = {
                ...form.getHeaders(),
                'Authorization': `Bearer ${company.whatsapp.accessToken}`,
            };

            const uploadResponse = await axios.post(
                `https://graph.facebook.com/v19.0/${company.whatsapp.phoneNumberId}/media`,
                form,
                { headers: uploadHeaders }
            );
            const mediaId = uploadResponse.data.id;

            // Step 2: Send the message using the media ID
            const messageType = file.mimetype.split('/')[0]; // 'image', 'video', 'audio'
            let apiRequestData;

            if (messageType === 'image') {
                apiRequestData = { type: "image", image: { id: mediaId } };
            } else if (messageType === 'video') {
                apiRequestData = { type: "video", video: { id: mediaId } };
            } else if (messageType === 'audio') {
                apiRequestData = { type: "audio", audio: { id: mediaId } };
            } else { // Treat as document
                apiRequestData = { type: "document", document: { id: mediaId, filename: originalFilename } };
            }
            
            const finalApiRequestData = {
                messaging_product: "whatsapp",
                to: conversation.customerPhone,
                ...apiRequestData
            };

            const sendHeaders = { 'Authorization': `Bearer ${company.whatsapp.accessToken}` };
            const metaResponse = await axios.post(`https://graph.facebook.com/v19.0/${company.whatsapp.phoneNumberId}/messages`, finalApiRequestData, { headers: sendHeaders });
            const metaMessageId = metaResponse.data.messages[0].id;

            // Step 3 (Optional but recommended): Upload to Cloudinary for persistent storage
            const cloudinaryUploadResponse = await new Promise((resolve, reject) => {
                const resourceTypeForUpload = ['image', 'video'].includes(messageType) ? messageType : 'raw';
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

            // Step 4: Save the message to our database
            const sentMessage = new Message({
                conversationId: req.params.id,
                sender: 'agent',
                messageType: messageType, // 'image', 'video', 'audio', or 'document'
                content: mediaUrl, // Store the persistent Cloudinary URL
                filename: originalFilename,
                wabaMessageId: metaMessageId
            });
            await sentMessage.save();

            conversation.lastMessage = messageType === 'image' ? 'Image' : (messageType === 'video' ? 'Video' : originalFilename);
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