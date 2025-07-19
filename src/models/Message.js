const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: String, enum: ['customer', 'agent'], required: true },
    messageType: { type: String, default: 'text' },
    content: { type: String, required: true },
    filename: { type: String },
    wabaMessageId: { type: String, unique: true, sparse: true },
    status: { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' },
    repliedToMessageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    repliedToMessageContent: { type: String },
    repliedToMessageSender: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Message', messageSchema);