const express = require('express');
const axios = require('axios');
const cloudinary = require('cloudinary').v2;

const Company = require('../models/Company');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Template = require('../models/Template'); 
const verifyWebhookSignature = require('../middleware/verifyWebhook');

module.exports = function(io) {
    const router = express.Router();

    // Webhook Verification Route
    router.get('/:companyId', async (req, res) => {
        try {
            const company = await Company.findById(req.params.companyId).select('whatsapp.verifyToken');
            if (!company || !company.whatsapp || !company.whatsapp.verifyToken) {
                return res.sendStatus(404);
            }
            const mode = req.query['hub.mode'];
            const token = req.query['hub.verify_token'];
            const challenge = req.query['hub.challenge'];
            if (mode === 'subscribe' && token === company.whatsapp.verifyToken) {
                console.log("Webhook verified successfully for:", company._id);
                res.status(200).send(challenge);
            } else {
                res.sendStatus(403);
            }
        } catch (error) {
            console.error("Webhook verification error:", error);
            res.sendStatus(500);
        }
    });

    // Webhook Event Handling Route
router.post('/:companyId', verifyWebhookSignature, async (req, res) => {
    const body = req.body;
    try {
        const value = body.entry?.[0]?.changes?.[0]?.value;
        if (!value) return res.sendStatus(200);

        // --- Handle Incoming Messages from Customers ---
        if (value.messages?.[0]) {
            console.log("--- Step 1: Incoming message received. Processing... ---");

            const messageData = value.messages[0];
            const companyId = req.params.companyId;
            const customerPhone = messageData.from;
            const customerName = value.contacts[0].profile.name;

            // Find/Create Conversation & Determine if Auto-Reply is needed
            let conversation = await Conversation.findOne({ companyId, customerPhone });
            let shouldSendAutoReply = false;

            if (!conversation) {
                // 1. This is a brand new customer
                conversation = new Conversation({ companyId, customerPhone, customerName, status: 'new' });
                await conversation.save(); 
                shouldSendAutoReply = true;
            } else if (conversation.status === 'resolved' || conversation.status === 'new') {
                // 2. This is a resolved OR an existing 'new' conversation
                conversation.status = 'new';
                shouldSendAutoReply = true;
            } else {
                 console.log(`Step 2: Existing conversation found with status: '${conversation.status}'.`);
            }
            
            console.log(`Step 3: Should an auto-reply be sent? -> ${shouldSendAutoReply}`);

            const company = await Company.findById(companyId).populate('welcomeTemplateId');
            if (!company) {
                console.error("### FATAL: Company not found!");
                return res.sendStatus(404);
            }
            console.log(`Step 4: Company found. Welcome Template ID is: ${company.welcomeTemplateId ? company.welcomeTemplateId._id : 'Not Set'}`);

            // --- Auto-Reply Bot Logic ---
            let templateToSend = null;
            if (shouldSendAutoReply && conversation.status === 'new') {
                console.log("Step 5: Conditions met for checking templates.");
                if (company.welcomeTemplateId) {
                    console.log("Step 6: Welcome template is set. Preparing to send.");
                    templateToSend = company.welcomeTemplateId;
                } else {
                    console.log("Step 6: No welcome template is set for this company.");
                }
            } else if (messageData.type === 'interactive' && messageData.interactive?.type === 'button_reply') {
                console.log("Step 5: User clicked a button. Finding next template...");
                const nextTemplateId = messageData.interactive.button_reply.id;
                if (nextTemplateId) {
                    templateToSend = await Template.findById(nextTemplateId);
                    console.log(`Step 6: Next template found with ID: ${nextTemplateId}`);
                }
            } else {
                 console.log("Step 5: Conditions for auto-reply NOT met.");
            }

            if (templateToSend && templateToSend.text) {
                console.log(`Step 7: SENDING BOT MESSAGE with template name: "${templateToSend.name}"`);
                const whatsappApiUrl = `https://graph.facebook.com/${process.env.META_API_VERSION}/${company.whatsapp.phoneNumberId}/messages`;
                const headers = { 'Authorization': `Bearer ${company.whatsapp.accessToken}` };
                let apiRequestData;

                if (templateToSend.type === 'interactive' && templateToSend.buttons?.length > 0) {
                    apiRequestData = {
                        messaging_product: "whatsapp", to: customerPhone, type: "interactive",
                        interactive: { type: "button", body: { text: templateToSend.text }, action: { buttons: templateToSend.buttons.slice(0, 3).map(btn => ({ type: "reply", reply: { id: btn.nextTemplateId, title: btn.title }}))}}
                    };
                } else {
                    apiRequestData = { messaging_product: "whatsapp", to: customerPhone, text: { body: templateToSend.text }};
                }

                try {
                    console.log('Sending bot message to:', customerPhone);
                    const metaResponse = await axios.post(whatsappApiUrl, apiRequestData, { headers });
                    const metaMessageId = metaResponse.data.messages[0].id;
                    const botMessage = new Message({
                        conversationId: conversation._id, sender: 'agent', messageType: 'text',
                        content: templateToSend.text, wabaMessageId: metaMessageId
                    });
                    await botMessage.save();
                    
                    conversation.status = 'in_progress';
                    conversation.lastMessage = botMessage.content;
                    conversation.lastMessageTimestamp = botMessage.createdAt;
                    io.to(companyId.toString()).emit('new_message', botMessage);
                } catch (error) {
                    console.error("Failed to send bot message:", error.response ? error.response.data : error.message);
                }
            }else{
                console.log("Step 7: No template to send. Skipping bot message.");
            }

            // --- Process and Save the Customer's Original Message ---
            let replyContext = {};
            if (messageData.context && messageData.context.id) {
                const originalMessage = await Message.findOne({ wabaMessageId: messageData.context.id });
                if (originalMessage) {
                    const originalSenderName = originalMessage.sender === 'agent' ? company.companyName : customerName;
                    const originalContent = originalMessage.messageType === 'text' ? originalMessage.content : (originalMessage.filename || `a ${originalMessage.messageType}`);
                    replyContext = {
                        repliedToMessageId: originalMessage._id,
                        repliedToMessageContent: originalContent.substring(0, 70) + (originalContent.length > 70 ? '...' : ''),
                        repliedToMessageSender: originalSenderName
                    };
                }
            }

            let customerMessage;
            const messageType = messageData.type;
            const mediaTypes = ['image', 'document', 'audio', 'video', 'sticker'];

            if (messageType === 'text') {
                customerMessage = new Message({ conversationId: conversation._id, sender: 'customer', messageType: 'text', content: messageData.text.body, ...replyContext });
            } else if (messageType === 'interactive' && messageData.interactive?.type === 'button_reply') {
                customerMessage = new Message({ conversationId: conversation._id, sender: 'customer', messageType: 'text', content: messageData.interactive.button_reply.title, ...replyContext });
            } else if (mediaTypes.includes(messageType)) {
                const accessToken = company.whatsapp.accessToken;
                const mediaId = messageData[messageType].id;
                
                const mediaInfoResponse = await axios.get(`https://graph.facebook.com/${process.env.META_API_VERSION}/${mediaId}`, { headers: { 'Authorization': `Bearer ${accessToken}` }});
                const tempMediaUrl = mediaInfoResponse.data.url;
                const buffer = (await axios.get(tempMediaUrl, { headers: { 'Authorization': `Bearer ${accessToken}` }, responseType: 'arraybuffer' })).data;
                
                let resourceTypeForUpload = 'raw';
                if (['image', 'sticker'].includes(messageType)) resourceTypeForUpload = 'image';
                else if (['video', 'audio'].includes(messageType)) resourceTypeForUpload = 'video';
                
                const cloudinaryUploadResponse = await new Promise((resolve, reject) => {
                    cloudinary.uploader.upload_stream({ resource_type: resourceTypeForUpload }, 
                    (error, result) => { if (error) reject(error); else resolve(result); }).end(buffer);
                });
                
                customerMessage = new Message({
                    conversationId: conversation._id, sender: 'customer', messageType: messageType,
                    content: cloudinaryUploadResponse.secure_url, filename: messageData[messageType].filename, ...replyContext
                });
            }

            if (customerMessage) {
                await customerMessage.save();
                conversation.lastMessage = customerMessage.messageType === 'text' ? customerMessage.content : (customerMessage.filename || customerMessage.messageType);
                conversation.lastMessageTimestamp = customerMessage.createdAt;
                conversation.unreadCount = (conversation.unreadCount || 0) + 1;
                io.to(companyId.toString()).emit('new_message', customerMessage);
            }
            
            await conversation.save();
            io.to(companyId.toString()).emit('conversation_updated', conversation);
        }
        // --- Handle Message Status Updates ---
        else if (value.statuses?.[0]) {
            const statusData = value.statuses[0];
            const messageIdFromMeta = statusData.id;
            const newStatus = statusData.status;
            const updatedMessage = await Message.findOneAndUpdate({ wabaMessageId: messageIdFromMeta }, { status: newStatus }, { new: true });
            if (updatedMessage) {
                const conv = await Conversation.findById(updatedMessage.conversationId);
                if (conv) {
                    io.to(conv.companyId.toString()).emit('message_status_update', { messageId: updatedMessage._id.toString(), status: newStatus });
                }
            }
        }
        
        res.sendStatus(200);
    } catch (error) {  
        console.error("### FATAL ERROR in webhook:", error);
        res.sendStatus(200);
    }
});
    return router;
};