const express = require('express');
const axios = require('axios');
const cloudinary = require('cloudinary').v2;

const Company = require('../models/Company');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

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
    router.post('/:companyId', async (req, res) => {
        const body = req.body;
        try {
            // Handle Incoming Messages
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

                if (conversation && conversation.status === 'resolved') {
                    console.log(`Conversation ${conversation._id} was resolved. Customer replied, setting status to 'new'.`);
                    conversation.status = 'new';
                }

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
                const mediaTypes = ['image', 'document', 'audio', 'video', 'sticker'];

                if (messageType === 'text') {
                    newMessage = new Message({ conversationId: conversation._id, sender: 'customer', messageType: 'text', content: messageData.text.body, ...replyContext });
                } else if (mediaTypes.includes(messageType)) {
                    const mediaId = messageData[messageType].id;
                    const originalFilename = messageData[messageType].filename || `${mediaId}.webp`; // Stickers are usually .webp
                    
                    const mediaInfoResponse = await axios.get(`https://graph.facebook.com/${process.env.META_API_VERSION}/${mediaId}`, { headers: { 'Authorization': `Bearer ${accessToken}` }});
                    const tempMediaUrl = mediaInfoResponse.data.url;
                    const buffer = (await axios.get(tempMediaUrl, { headers: { 'Authorization': `Bearer ${accessToken}` }, responseType: 'arraybuffer' })).data;
                    
                    let resourceTypeForUpload = 'raw';
                    if (['image', 'sticker'].includes(messageType)) {
                        resourceTypeForUpload = 'image';
                    } else if (['video', 'audio'].includes(messageType)) {
                        resourceTypeForUpload = 'video';
                    }
                    
                    const cloudinaryUploadResponse = await new Promise((resolve, reject) => {
                        cloudinary.uploader.upload_stream({
                            resource_type: resourceTypeForUpload,
                            upload_preset: 'whatsapp_files'
                        }, (error, result) => {
                            if (error) reject(error); else resolve(result);
                        }).end(buffer);
                    });

                    newMessage = new Message({
                        conversationId: conversation._id,
                        sender: 'customer',
                        messageType: messageType, // Save the original type (e.g., 'sticker', 'audio')
                        content: cloudinaryUploadResponse.secure_url,
                        filename: originalFilename,
                        ...replyContext
                    });
                }

                if (newMessage) {
                    await newMessage.save();
                    conversation.lastMessage = newMessage.messageType === 'text' ? newMessage.content : (newMessage.filename || newMessage.messageType.charAt(0).toUpperCase() + newMessage.messageType.slice(1));
                    conversation.lastMessageTimestamp = newMessage.createdAt;
                    conversation.lastMessageTimestamp = newMessage.createdAt;
                    conversation.unreadCount = (conversation.unreadCount || 0) + 1;
                    await conversation.save();
                    
                    io.to(companyId.toString()).emit('new_message', newMessage);
                    io.to(companyId.toString()).emit('conversation_updated', conversation);
                }
            }
            // Handle Message Status Updates
            else if (body.object === 'whatsapp_business_account' && body.entry?.[0]?.changes?.[0]?.value?.statuses?.[0]) {
                const statusData = body.entry[0].changes[0].value.statuses[0];
                const messageIdFromMeta = statusData.id;
                const newStatus = statusData.status;
                const updatedMessage = await Message.findOneAndUpdate({ wabaMessageId: messageIdFromMeta }, { status: newStatus }, { new: true });
                if (updatedMessage) {
                    const conversation = await Conversation.findById(updatedMessage.conversationId);
                    if (conversation) {
                        io.to(conversation.companyId.toString()).emit('message_status_update', { messageId: updatedMessage._id.toString(), status: newStatus });
                    }
                }
            }
            res.sendStatus(200);
        } catch (error) {
            console.error("Error processing webhook:", error.response ? error.response.data : error);
            res.sendStatus(200);
        }
    });

    return router;
};