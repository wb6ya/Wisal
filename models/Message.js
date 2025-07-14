// models/Message.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true
    },
    sender: {
        type: String,
        enum: ['customer', 'agent'], // Who sent the message
        required: true
    },
    messageType: {
        type: String,
        default: 'text' // e.g., 'text', 'image', 'document'
    },
    content: {
        type: String,
        required: true
    },
}, { timestamps: true });

module.exports = mongoose.model('Message', messageSchema);