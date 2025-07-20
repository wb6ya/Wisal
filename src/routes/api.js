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
const employeesRouter = require('./employees.routes');

const upload = multer({ storage: multer.memoryStorage() });

module.exports = function(io) {
    const router = express.Router();
    router.use('/conversations', conversationsRouter(io));
    router.use('/templates', isAuthenticated, templatesRouter);
    router.use('/employees', employeesRouter);

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
            const employee = await Employee.findOne({ email });
            if (employee) {
                const isMatch = await bcrypt.compare(password, employee.password);
                if (isMatch) {
                    req.session.userId = employee._id;
                    req.session.companyId = employee.companyId;
                    req.session.role = employee.role;
                    return res.status(200).json({ message: 'Login successful!', redirectUrl: '/dashboard' });
                }
            }
            const company = await Company.findOne({ email });
            if (company) {
                const isMatch = await bcrypt.compare(password, company.password);
                if (isMatch) {
                    req.session.userId = company._id;
                    req.session.companyId = company._id;
                    req.session.role = 'admin';
                    return res.status(200).json({ message: 'Login successful!', redirectUrl: '/dashboard' });
                }
            }
            return res.status(400).json({ message: 'Invalid email or password' });
        } catch (error) {
            console.error("Login error:", error);
            res.status(500).json({ message: 'Server error during login' });
        }
    });

    router.get('/logout', (req, res) => {
        req.session.destroy((err) => {
            if (err) {
                return res.status(500).json({ message: 'Could not log out, please try again.' });
            }
            res.redirect('/');
        });
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
            const conversation = await Conversation.findOne({ _id: req.params.id, companyId: req.session.companyId });
            if (!conversation) return res.status(404).json({ message: "Conversation not found" });

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

    router.get('/conversations/:id/notes', isAuthenticated, async (req, res) => {
        try {
            const conversation = await Conversation.findOne({ _id: req.params.id, companyId: req.session.companyId });
            if (!conversation) {
                return res.status(404).json({ message: 'Conversation not found' });
            }
            res.status(200).json({ notes: conversation.notes || '' });
        } catch (error) {
            res.status(500).json({ message: 'Failed to fetch notes' });
        }
    });

    // مسار لحفظ الملاحظات لمحادثة معينة
    router.post('/conversations/:id/notes', isAuthenticated, async (req, res) => {
        try {
            const { notes } = req.body;
            const conversation = await Conversation.findOneAndUpdate(
                { _id: req.params.id, companyId: req.session.companyId },
                { notes: notes },
                { new: true }
            );
            if (!conversation) {
                return res.status(404).json({ message: 'Conversation not found' });
            }
            res.status(200).json({ message: 'Notes saved successfully!' });
        } catch (error) {
            res.status(500).json({ message: 'Failed to save notes' });
        }
    });

    router.post('/conversations/:id/reply', isAuthenticated, async (req, res) => {
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
            const apiRequestData = { messaging_product: "whatsapp", to: conversation.customerPhone, text: { body: message } };
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

    router.post('/conversations/:id/send-media', isAuthenticated, upload.single('mediaFile'), async (req, res) => {
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
                const whatsappApiUrl = `https://graph.facebook.com/v19.0/${company.whatsapp.phoneNumberId}/messages`;
                
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