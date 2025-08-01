// src/routes/conversations.routes.js
const express = require('express');
const axios = require('axios');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const FormData = require('form-data');
const { isAuthenticated } = require('../middleware/auth');
const Company = require('../models/Company');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

const upload = multer({ storage: multer.memoryStorage() });

// Add this helper function at the top of your routes file
function ensureFileExtension(filename, mimetype, messageType) {
    if (!filename || messageType !== 'document') return filename;
    
    const hasExtension = filename.includes('.') && 
                        filename.lastIndexOf('.') > filename.lastIndexOf('/');
    
    if (hasExtension) return filename;
    
    // MIME type to extension mapping
    const mimeToExt = {
        'application/pdf': '.pdf',
        'application/msword': '.doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'text/plain': '.txt',
        'application/vnd.ms-excel': '.xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif'
    };
    
    const extension = mimeToExt[mimetype] || '.pdf';
    return filename + extension;
}

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

    // GET all messages for a specific conversation (with pagination)
router.get('/:id/messages', isAuthenticated, async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const { companyId } = req.session;
        const page = parseInt(req.query.page) || 1;

        // الخطوة 1: تحديث عداد الرسائل غير المقروءة مباشرة في قاعدة البيانات
        if (page === 1) {
            // ابحث عن المحادثة وقم بتحديثها في خطوة واحدة
            const updatedConversation = await Conversation.findOneAndUpdate(
                { _id: conversationId, companyId, unreadCount: { $gt: 0 } }, // ابحث فقط إذا كان هناك رسائل غير مقروءة
                { $set: { unreadCount: 0 } }, // اجعل العداد صفرًا
                { new: true } // قم بإرجاع المستند بعد التحديث
            );

            // إذا تم العثور على محادثة وتحديثها، أرسل إشعارًا للواجهة الأمامية
            if (updatedConversation) {
                console.log(`Unread count has been reset and saved for conversation: ${conversationId}`);
                io.to(companyId.toString()).emit('conversation_updated', updatedConversation);
            }
        }

        // الخطوة 2: جلب الرسائل وإرسالها كالمعتاد
        const limit = 30;
        const skip = (page - 1) * limit;
        const messages = await Message.find({ conversationId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
        
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
            const whatsappApiUrl = `https://graph.facebook.com/${process.env.META_API_VERSION}/${company.whatsapp.phoneNumberId}/messages`;
            const apiRequestData = {
                messaging_product: "whatsapp",
                to: conversation.customerPhone,
                text: { body: message }
            };
            let originalMessage = null;
            if (contextMessageId) {
                originalMessage = await Message.findById(contextMessageId);
                if (originalMessage && originalMessage.wabaMessageId) {
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

        // --- 1. التحقق من وجود كل البيانات أولاً ---
        if (!req.file || !company || !conversation || !company.whatsapp.accessToken) {
            return res.status(400).json({ message: "Missing file, company data, or access token." });
        }

        // Declare file variable immediately after initial checks
        const file = req.file;
        const originalFilename = file.originalname;

        const allowedMimeTypes = [
            // Images
            'image/jpeg',
            'image/png',
            'image/webp', // For stickers

            // Audio
            'audio/aac',
            'audio/mp4',
            'audio/mpeg', // MP3
            'audio/amr',
            'audio/ogg', // Only with OPUS codec

            // Video
            'video/mp4',
            'video/3gpp',

            // Documents
            'text/plain',
            'application/pdf',
            'application/vnd.ms-powerpoint', // .ppt
            'application/msword', // .doc
            'application/vnd.ms-excel', // .xls
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
            'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' // .xlsx
        ];

        if (!allowedMimeTypes.includes(file.mimetype)) {
            return res.status(400).json({ message: `File type not supported.` });
        }

        console.log(`Step 1: File received by Multer successfully. Name: ${originalFilename}, Size: ${file.size} bytes`);

        console.log("Step 2: Starting upload to WhatsApp API...");

        const form = new FormData();
        form.append('messaging_product', 'whatsapp');
        form.append('file', file.buffer, {
            filename: originalFilename,
            contentType: file.mimetype,
        });

        const uploadHeaders = { ...form.getHeaders(), 'Authorization': `Bearer ${company.whatsapp.accessToken}` };
        const uploadResponse = await axios.post(
            `https://graph.facebook.com/${process.env.META_API_VERSION}/${company.whatsapp.phoneNumberId}/media`,
            form,
            { headers: uploadHeaders }
        );
        const mediaId = uploadResponse.data.id;
        console.log(`Step 3: WhatsApp upload successful. Media ID: ${mediaId}`);

        console.log("Step 4: Starting upload to Cloudinary...");
        const messageType = file.mimetype.split('/')[0];
        let apiRequestData;
        if (messageType === 'image') {
            apiRequestData = { type: "image", image: { id: mediaId } };
        } else if (messageType === 'video') {
            apiRequestData = { type: "video", video: { id: mediaId } };
        } else if (messageType === 'audio') {
            apiRequestData = { type: "audio", audio: { id: mediaId } };
        } else {
            apiRequestData = { type: "document", document: { id: mediaId, filename: originalFilename } };
        }
        
        const finalApiRequestData = { messaging_product: "whatsapp", to: conversation.customerPhone, ...apiRequestData };
        const sendHeaders = { 'Authorization': `Bearer ${company.whatsapp.accessToken}` };
        const metaResponse = await axios.post(`https://graph.facebook.com/${process.env.META_API_VERSION}/${company.whatsapp.phoneNumberId}/messages`, finalApiRequestData, { headers: sendHeaders });
        const metaMessageId = metaResponse.data.messages[0].id;

        const resourceTypeForUpload = ['image', 'video'].includes(messageType) ? messageType : 'raw';
        const cloudinaryUploadResponse = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream({
                resource_type: resourceTypeForUpload,
                upload_preset: 'whatsapp_files',
                folder: `${companyId}/media`
            }, (error, result) => {
                if (error) return reject(error);
                resolve(result);
            });
            uploadStream.end(file.buffer);
        });
        const mediaUrl = cloudinaryUploadResponse.secure_url;

        const finalMessageType = ['image', 'video', 'audio'].includes(messageType) ? messageType : 'document';
        let finalFilename = originalFilename;

        // Ensure document files have proper extensions
        if (finalMessageType === 'document' && finalFilename) {
            const hasExtension = finalFilename.includes('.') && 
                                finalFilename.lastIndexOf('.') > finalFilename.lastIndexOf('/');
            
            if (!hasExtension) {
                // Try to determine extension from MIME type
                const mimeToExt = {
                    'application/pdf': '.pdf',
                    'application/msword': '.doc',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
                    'text/plain': '.txt',
                    'application/vnd.ms-excel': '.xls',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx'
                };
                
                const extension = mimeToExt[file.mimetype] || '.pdf';
                finalFilename += extension;
            }
        }

        const sentMessage = new Message({
            conversationId: req.params.id,
            sender: 'agent',
            messageType: finalMessageType,
            content: mediaUrl,
            filename: finalFilename, // Use the corrected filename
            wabaMessageId: metaMessageId,
            cloudinaryPublicId: cloudinaryUploadResponse.public_id,
            cloudinaryResourceType: cloudinaryUploadResponse.resource_type
        });
        await sentMessage.save();

        conversation.lastMessage = ['image', 'video'].includes(messageType) ? messageType.charAt(0).toUpperCase() + messageType.slice(1) : originalFilename;
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
            
            const whatsappApiUrl = `https://graph.facebook.com/${process.env.META_API_VERSION}/${company.whatsapp.phoneNumberId}/messages`;
            const apiRequestData = {
                messaging_product: "whatsapp",
                to: customerPhone,
                type: "template",
                template: { name: templateName, language: { code: "ar" } }
            };
            const headers = { 'Authorization': `Bearer ${company.whatsapp.accessToken}` };
            await axios.post(whatsappApiUrl, apiRequestData, { headers });
            res.status(200).json({ message: `Template message sent to ${customerPhone}` });
        } catch (error) {
            console.error("Error sending template message:", error.response ? error.response.data : error);
            res.status(500).json({ message: 'Failed to send template message' });
        }
    });

    // أضف هذا المسار الجديد بالكامل
    router.post('/:id/mark-as-read', isAuthenticated, async (req, res) => {
        try {
            const conversation = await Conversation.findOneAndUpdate(
                { _id: req.params.id, companyId: req.session.companyId },
                { $set: { unreadCount: 0 } },
                { new: true }
            );

            if (conversation) {
                io.to(req.session.companyId.toString()).emit('conversation_updated', conversation);
            }
            
            res.sendStatus(200); // فقط أرسل ردًا ناجحًا
        } catch (error) {
            console.error("Error marking conversation as read:", error);
            res.sendStatus(500);
        }
    });

    // GET notes for a specific conversation
    router.get('/:id/notes', isAuthenticated, async (req, res) => {
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

    // POST to save notes for a specific conversation
    router.post('/:id/notes', isAuthenticated, async (req, res) => {
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
   // POST to update conversation status
    router.post('/:id/status', isAuthenticated, async (req, res) => {
        try {
            const { status } = req.body;
            const validStatuses = { 'new': 'جديدة', 'in_progress': 'قيد التنفيذ', 'resolved': 'تم حلها' };
            if (!validStatuses[status]) {
                return res.status(400).json({ message: 'Invalid status value.' });
            }
            const conversation = await Conversation.findOneAndUpdate(
                { _id: req.params.id, companyId: req.session.companyId },
                { status: status },
                { new: true }
            );
            if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
            
            const company = await Company.findById(req.session.companyId);
            if (company && company.whatsapp.accessToken) {
                const whatsappApiUrl = `https://graph.facebook.com/${process.env.META_API_VERSION}/${company.whatsapp.phoneNumberId}/messages`;
                const apiRequestData = {
                    messaging_product: "whatsapp", to: conversation.customerPhone, type: "template",
                    template: {
                        name: "status_update", language: { code: "ar" },
                        components: [{ type: "body", parameters: [{ type: "text", text: validStatuses[status] }]}]
                    }
                };
                const headers = { 'Authorization': `Bearer ${company.whatsapp.accessToken}` };
                axios.post(whatsappApiUrl, apiRequestData, { headers }).catch(err => {
                    console.error("Failed to send status update template:", err.response ? err.response.data : err.message);
                });
            }
            
            io.to(req.session.companyId.toString()).emit('conversation_updated', conversation);
            res.status(200).json(conversation);
        } catch (error) {
            console.error("Error updating status:", error);
            res.status(500).json({ message: 'Failed to update status' });
        }
    });

/**
 * @route   GET /download/:messageId
 * @desc    Streams a file from Cloudinary for secure download with a correct filename.
 * @access  Private
 */
router.get('/download/:messageId', isAuthenticated, async (req, res) => {
    try {
        const message = await Message.findById(req.params.messageId);

        // Security check to ensure the user owns this conversation
        if (message) {
            const conversation = await Conversation.findOne({ _id: message.conversationId, companyId: req.session.companyId });
            if (!conversation) {
                return res.status(404).send('File not found or access denied.');
            }
        } else {
            return res.status(404).send('Message not found.');
        }

        if (!message.cloudinaryPublicId) {
            return res.status(404).send('File has no download reference.');
        }

        // Generate the secure URL from Cloudinary
        const options = {
            resource_type: message.cloudinaryResourceType || 'raw',
            sign_url: true
        };
        const downloadUrl = cloudinary.url(message.cloudinaryPublicId, options);
        
        // --- هذا هو المنطق الجديد والمهم لتحديد اسم الملف ---
        let downloadFilename = message.filename || 'document';
        // إذا كان نوع الرسالة مستندًا واسم الملف لا يحتوي على امتداد، أضف .pdf كحل احتياطي
        if (message.messageType === 'document' && !downloadFilename.includes('.')) {
            downloadFilename += '.pdf';
        }
        // --- نهاية المنطق الجديد ---

        // Stream the file from Cloudinary to the user
        const response = await axios({
            method: 'GET',
            url: downloadUrl,
            responseType: 'stream'
        });

        // Set headers to force the browser to download the file with the correct name
        res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
        res.setHeader('Content-Type', response.headers['content-type']);

        response.data.pipe(res);

    } catch (error) {
        console.error("Download Error:", error);
        res.status(500).send('Could not download file.');
    }
});

    return router;
};