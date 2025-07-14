// models/Conversation.js
const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    customerPhone: {
        type: String,
        required: true
    },
    customerName: {
        type: String // We get this from the WhatsApp message
    },
    // We can add status like 'open', 'closed' later
}, { timestamps: true });

module.exports = mongoose.model('Conversation', conversationSchema);