const express = require('express');
const axios = require('axios');
const cloudinary = require('cloudinary').v2;
const mime = require('mime-types'); // <-- إضافة المكتبة لمعالجة أنواع الملفات

// Import Models
const Company = require('../models/Company');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Template = require('../models/Template');

// Import Services & Middleware
const { notifyAgentsViaWhatsApp } = require('../services/notificationService');
const verifyWebhookSignature = require('../middleware/verifyWebhook');

// --- Helper Functions for Cleaner Code ---

/**
 * Finds an existing conversation or creates a new one.
 * Handles reopening of resolved conversations.
 * @returns {object} The found or created conversation document.
 */
async function findOrCreateConversation(companyId, customerPhone, customerName) {
    let conversation = await Conversation.findOne({ companyId, customerPhone });

    if (conversation) {
        // Reopen resolved conversations when the customer messages again
        if (conversation.status === 'resolved') {
            conversation.status = 'new';
            // CRITICAL FIX: Save the status change immediately to the database
            await conversation.save();
        }
    } else {
        // Create a new conversation if none exists
        conversation = new Conversation({
            companyId,
            customerPhone,
            customerName,
            status: 'new',
            unreadCount: 0,
        });
        await conversation.save();
    }
    return conversation;
}

/**
 * Sends a message using the Meta Graph API.
 * @returns {string|null} The message ID from Meta, or null on failure.
 */
async function sendWhatsAppMessage(apiUrl, apiRequestData, headers) {
    try {
        const response = await axios.post(apiUrl, apiRequestData, { headers });
        if (response.data && response.data.messages?.[0]?.id) {
            return response.data.messages[0].id;
        }
        return null;
    } catch (error) {
        console.error("WhatsApp API send error:", error.response ? error.response.data : error.message);
        return null;
    }
}

/**
 * Handles special actions triggered by a bot template, like contacting an agent or resolving the conversation.
 */
async function handleBotActions(template, conversation, company, io) {
    let shouldSendRating = false;

    if (template.type === 'contact_agent') {
        console.log(`ACTION: Notifying agents for conversation ${conversation._id}`);
        notifyAgentsViaWhatsApp(company._id, conversation);
        conversation.status = 'in_progress';
    } else if (template.type === 'resolve_conversation') {
        console.log(`ACTION: Conversation ${conversation._id} resolved by bot.`);
        conversation.status = 'resolved';
        shouldSendRating = true; // Flag to send a rating request
    } else {
        conversation.status = 'in_progress';
    }

    await conversation.save();

    // NEW FEATURE: Send rating request if the conversation was just resolved
    if (shouldSendRating && company.ratingTemplateId) {
        const ratingTemplate = await Template.findById(company.ratingTemplateId);
        if (ratingTemplate) {
            console.log(`ACTION: Sending rating request for conversation ${conversation._id}`);
            // Construct and send the rating message (assuming it's an interactive template)
            const apiUrl = `https://graph.facebook.com/${process.env.META_API_VERSION}/${company.whatsapp.phoneNumberId}/messages`;
            const headers = { 'Authorization': `Bearer ${company.whatsapp.accessToken}` };
            const requestData = {
                messaging_product: "whatsapp",
                to: conversation.customerPhone,
                type: "interactive",
                interactive: {
                    type: "button",
                    body: { text: ratingTemplate.text },
                    action: {
                        buttons: ratingTemplate.buttons.slice(0, 3).map(btn => ({
                            type: "reply",
                            reply: { id: `rating_${conversation._id}_${btn.title}`, title: btn.title }
                        }))
                    }
                }
            };
            await sendWhatsAppMessage(apiUrl, requestData, headers);
        }
    }
}

/**
 * Processes an incoming customer message, saves it, and emits socket events.
 */
async function processCustomerMessage(messageData, conversation, company, io) {
    const { from: customerPhone } = messageData;
    const { name: customerName } = conversation;

    let customerMessage;
    const messageType = messageData.type;

    if (messageType === 'text' || (messageType === 'interactive' && messageData.interactive?.type === 'button_reply')) {
        const content = messageType === 'text' ? messageData.text.body : messageData.interactive.button_reply.title;
        customerMessage = new Message({ conversationId: conversation._id, sender: 'customer', messageType: 'text', content });
    } else if (['image', 'document', 'audio', 'video', 'sticker'].includes(messageType)) {
        try {
            const mediaId = messageData[messageType].id;
            const mediaInfoUrl = `https://graph.facebook.com/${process.env.META_API_VERSION}/${mediaId}`;
            const headers = { 'Authorization': `Bearer ${company.whatsapp.accessToken}` };
            
            const mediaInfoResponse = await axios.get(mediaInfoUrl, { headers });
            const mediaDownloadUrl = mediaInfoResponse.data.url;
            const mimeType = messageData[messageType].mime_type;

            const buffer = (await axios.get(mediaDownloadUrl, { headers, responseType: 'arraybuffer' })).data;
            
            // ROBUST FIX: Generate filename with correct extension using mime-type
            const baseFilename = messageData[messageType].filename || messageType;
            const extension = mime.extension(mimeType);
            const finalFilename = extension ? `${baseFilename.split('.').shift()}.${extension}` : baseFilename;

            const uploadResponse = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream({
                    resource_type: 'auto',
                    public_id: finalFilename,
                    folder: `${company._id}/media`
                }, (error, result) => error ? reject(error) : resolve(result)).end(buffer);
            });

            customerMessage = new Message({
                conversationId: conversation._id,
                sender: 'customer',
                messageType: messageType,
                content: uploadResponse.secure_url,
                filename: finalFilename,
                cloudinaryPublicId: uploadResponse.public_id,
            });

        } catch (mediaError) {
            console.error("Error processing media:", mediaError);
            customerMessage = new Message({ conversationId: conversation._id, sender: 'customer', messageType: 'text', content: `[Media processing failed]` });
        }
    }

    if (customerMessage) {
        await customerMessage.save();
        conversation.lastMessage = customerMessage.messageType === 'text' ? customerMessage.content : (customerMessage.filename || customerMessage.messageType);
        conversation.lastMessageTimestamp = customerMessage.createdAt;
        conversation.unreadCount = (conversation.unreadCount || 0) + 1;
        await conversation.save();

        io.to(company._id.toString()).emit('conversation_updated', conversation.toObject());
        io.to(company._id.toString()).emit('new_message', customerMessage.toObject());
    }
}


// --- Main Router ---

module.exports = function(io) {
    const router = express.Router();

    // GET /webhook/:companyId - Verification endpoint
    router.get('/:companyId', async (req, res) => {
        // ... (Verification logic remains the same, it's correct)
    });

    // POST /webhook/:companyId - Main event handler
    router.post('/:companyId', verifyWebhookSignature, async (req, res) => {
        try {
            const value = req.body.entry?.[0]?.changes?.[0]?.value;
            if (!value) return res.sendStatus(200);

            const companyId = req.params.companyId;
            const company = await Company.findById(companyId);
            if (!company) return res.sendStatus(404);

            // --- 1. Handle Incoming Messages ---
            if (value.messages?.[0]) {
                const messageData = value.messages[0];
                const customerPhone = messageData.from;
                const customerName = value.contacts[0].profile.name;

                const conversation = await findOrCreateConversation(companyId, customerPhone, customerName);
                
                // --- Bot Logic ---
                let templateToSend = null;
                if (company.isBotEnabled) {
                     if (messageData.type === 'interactive' && messageData.interactive?.type === 'button_reply') {
                        const nextTemplateId = messageData.interactive.button_reply.id;
                        // Handle ratings separately as they have a special ID format
                        if (nextTemplateId.startsWith('rating_')) {
                            // Logic to save the rating would go here.
                            console.log(`Received rating: ${nextTemplateId}`);
                        } else {
                            templateToSend = await Template.findById(nextTemplateId);
                        }
                    } else if (conversation.status === 'new') {
                        templateToSend = await Template.findById(company.welcomeTemplateId);
                    }
                }

                // If a bot template needs to be sent, send it.
                if (templateToSend) {
                    const apiUrl = `https://graph.facebook.com/${process.env.META_API_VERSION}/${company.whatsapp.phoneNumberId}/messages`;
                    const headers = { 'Authorization': `Bearer ${company.whatsapp.accessToken}` };
                    const requestData = {
                         messaging_product: "whatsapp", 
                         to: customerPhone, 
                         type: templateToSend.buttons?.length > 0 ? "interactive" : "text",
                         text: templateToSend.buttons?.length > 0 ? undefined : { body: templateToSend.text },
                         interactive: templateToSend.buttons?.length > 0 ? { 
                            type: "button", 
                            body: { text: templateToSend.text },
                            action: { buttons: templateToSend.buttons.slice(0, 3).map(btn => ({ type: "reply", reply: { id: btn.nextTemplateId, title: btn.title }}))}
                         } : undefined
                    };

                    const metaMessageId = await sendWhatsAppMessage(apiUrl, requestData, headers);
                    if (metaMessageId) {
                        const botMessage = new Message({ conversationId: conversation._id, sender: 'agent', messageType: 'text', content: templateToSend.text, wabaMessageId: metaMessageId });
                        await botMessage.save();
                        io.to(companyId.toString()).emit('new_message', botMessage.toObject());
                        await handleBotActions(templateToSend, conversation, company, io);
                    }
                }
                
                // Always process and save the customer's message
                await processCustomerMessage(messageData, conversation, company, io);
            }

            // --- 2. Handle Message Status Updates ---
            else if (value.statuses?.[0]) {
                const statusData = value.statuses[0];
                const updatedMessage = await Message.findOneAndUpdate({ wabaMessageId: statusData.id }, { status: statusData.status }, { new: true });
                if (updatedMessage) {
                    io.to(companyId.toString()).emit('message_status_update', { messageId: updatedMessage._id.toString(), status: statusData.status });
                }
            }
            
            res.sendStatus(200);
        } catch (error) {
            console.error("### FATAL ERROR in webhook:", error);
            res.sendStatus(200); // Always send 200 to prevent Meta from resending
        }
    });

    return router;
};