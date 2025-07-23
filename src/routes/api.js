// src/routes/api.js
const express = require('express');
const bcrypt = require('bcrypt');
const axios = require('axios');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const FormData = require('form-data');
const mime = require('mime-types');
const Company = require('../models/Company');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const CannedResponse = require('../models/CannedResponse');
const Employee = require('../models/Employee');
const conversationsRouter = require('./conversations.routes');
const templatesRouter = require('./templates.routes');
const { isAuthenticated } = require('../middleware/auth');
const analyticsRouter = require('./analytics.routes');
const employeesRouter = require('./employees.routes');
const customersRouter = require('./customers.routes');
const authRouter = require('./auth.routes'); 
const botSettingsRouter = require('./bot-settings.routes');

const upload = multer({ storage: multer.memoryStorage() });

module.exports = function(io) {
    const router = express.Router();
    router.use('/conversations', conversationsRouter(io));
    router.use('/templates', isAuthenticated, templatesRouter);
    router.use('/employees', employeesRouter);
    router.use('/analytics', analyticsRouter);
    router.use('/customers', customersRouter); 
    router.use('/auth', authRouter);
    router.use('/templates', isAuthenticated, templatesRouter);
    router.use('/bot-settings', isAuthenticated, botSettingsRouter);


    router.post('/conversations/:id/media', isAuthenticated, upload.single('file'), async (req, res) => {
        try {
            const { companyId } = req.session;
            const { id: conversationId } = req.params;
            const file = req.file;

            if (!file) {
                return res.status(400).json({ message: 'No file uploaded.' });
            }
            const originalFilename = file.originalname;

            const company = await Company.findById(companyId);
            if (!company || !company.whatsapp.accessToken || !company.whatsapp.phoneNumberId) {
                return res.status(400).json({ message: 'WhatsApp API credentials not set.' });
            }

            const conversation = await Conversation.findById(conversationId);
            if (!conversation || conversation.companyId.toString() !== companyId) {
                return res.status(404).json({ message: 'Conversation not found.' });
            }

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
                `https://graph.facebook.com/${process.env.META_API_VERSION}/${company.whatsapp.phoneNumberId}/media`,
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
            const metaResponse = await axios.post(`https://graph.facebook.com/${process.env.META_API_VERSION}/${company.whatsapp.phoneNumberId}/messages`, finalApiRequestData, { headers: sendHeaders });
            const metaMessageId = metaResponse.data.messages[0].id;

            // Step 3: Upload to Cloudinary for persistent storage
            const resourceTypeForUpload = ['image', 'video'].includes(messageType) ? messageType : 'raw';
            const cloudinaryUploadResponse = await new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream({
                    resource_type: resourceTypeForUpload,
                    upload_preset: 'whatsapp_files',
                    folder: `${companyId}/media` // Organize files by company
                }, (error, result) => {
                    if (error) return reject(error);
                    resolve(result);
                });
                uploadStream.end(file.buffer);
            });
            const mediaUrl = cloudinaryUploadResponse.secure_url;

            // Step 4: Save the message to our database
            let messageTypeForDB;
            if (['image', 'video', 'audio'].includes(messageType)) {
                messageTypeForDB = messageType;
            } else {
                messageTypeForDB = 'document';
            }

            const sentMessage = new Message({
                conversationId: req.params.id,
                sender: 'agent',
                messageType: messageTypeForDB,
                content: mediaUrl,
                filename: originalFilename,
                wabaMessageId: metaMessageId,
                cloudinaryPublicId: cloudinaryUploadResponse.public_id,
                cloudinaryResourceType: cloudinaryUploadResponse.resource_type
            });
            await sentMessage.save();

            conversation.lastMessage = messageTypeForDB === 'image' ? 'Image' : (messageTypeForDB === 'video' ? 'Video' : originalFilename);
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

            // Security check: Ensure the message belongs to a conversation of the current company
            if (message) {
                const conversation = await Conversation.findOne({ _id: message.conversationId, companyId: req.session.companyId });
                if (!conversation) {
                    // If the conversation doesn't belong to the company, treat the message as not found
                    return res.status(404).send('File not found or access denied.');
                }
            }

            if (!message || !message.content || message.messageType === 'text') {
                return res.status(404).send('File not found.');
            }

            // Use the stored public_id and resource_type to generate the URL
            const publicId = message.cloudinaryPublicId;
            const resourceType = message.cloudinaryResourceType;

            if (!publicId || !resourceType) {
                return res.status(404).send('File has no download reference.');
            }
            
            // Generate a signed, expiring download URL from Cloudinary
            const options = {
                resource_type: resourceType,
                sign_url: true, // This makes the URL secure
                expires_at: Math.floor(Date.now() / 1000) + 3600 // URL is valid for 1 hour
            };

            // Only force download for documents. For audio/video, let the browser handle streaming.
            if (message.messageType === 'document') {
                options.attachment = message.filename;
            }

            const downloadUrl = cloudinary.url(publicId, options);
            
            // Redirect the user to this secure download URL
            res.redirect(downloadUrl);

        } catch (error) {
            console.error("Download Error:", error.message);
            if (error.http_code) {
                console.error("Cloudinary HTTP Code:", error.http_code);
                console.error("Cloudinary Error Message:", error.message);
            }
            res.status(500).send('Could not generate download link.');
        }
    });

    // POST to initiate a new conversation with a template
    router.post('/conversations/initiate', isAuthenticated, async (req, res) => {
        try {
            const { customerPhone, templateName } = req.body;
            if (!customerPhone || !templateName) {
                return res.status(400).json({ message: "Customer phone and template name are required." });
            }

            const company = await Company.findById(req.session.companyId);
            if (!company || !company.whatsapp.accessToken) {
                return res.status(401).json({ message: "Invalid Access Token." });
            }
            
            const whatsappApiUrl = `https://graph.facebook.com/${process.env.META_API_VERSION}/${company.whatsapp.phoneNumberId}/messages`;
            
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

// في ملف src/routes/api.js

    router.post('/conversations/:id/status', isAuthenticated, async (req, res) => {
        try {
            const { status } = req.body;
            const validStatuses = {
                'new': 'جديدة',
                'in_progress': 'قيد التنفيذ',
                'resolved': 'تم حلها'
            };

            if (!validStatuses[status]) {
                return res.status(400).json({ message: 'Invalid status value.' });
            }

            const conversation = await Conversation.findOneAndUpdate(
                { _id: req.params.id, companyId: req.session.companyId },
                { status: status },
                { new: true }
            );

            if (!conversation) {
                return res.status(404).json({ message: 'Conversation not found' });
            }
            
            // --- هذا هو الجزء الجديد: إرسال رسالة القالب ---
            const company = await Company.findById(req.session.companyId);
            if (company && company.whatsapp.accessToken) {
                const whatsappApiUrl = `https://graph.facebook.com/${process.env.META_API_VERSION}/${company.whatsapp.phoneNumberId}/messages`;
                
                const apiRequestData = {
                    messaging_product: "whatsapp",
                    to: conversation.customerPhone,
                    type: "template",
                    template: {
                        name: "status_update", // اسم القالب الذي أنشأته
                        language: {
                            code: "ar"
                        },
                        components: [{
                            type: "body",
                            parameters: [{
                                type: "text",
                                text: validStatuses[status] // القيمة التي ستوضع مكان المتغير {{1}}
                            }]
                        }]
                    }
                };

                const headers = { 'Authorization': `Bearer ${company.whatsapp.accessToken}` };
                // إرسال الطلب بدون انتظار الرد لمنع تعطيل الواجهة
                axios.post(whatsappApiUrl, apiRequestData, { headers }).catch(err => {
                    console.error("Failed to send status update template:", err.response ? err.response.data : err.message);
                });
            }
            // --- نهاية الجزء الجديد ---
            
            io.to(req.session.companyId.toString()).emit('conversation_updated', conversation);
            
            res.status(200).json(conversation);
        } catch (error) {
            console.error("Error updating status:", error);
            res.status(500).json({ message: 'Failed to update status' });
        }
    });

    return router;
};