const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    customerPhone: { type: String, required: true },
    customerName: { type: String },
    lastMessage: { type: String, default: "" },
    lastMessageTimestamp: { type: Date, default: Date.now },
    unreadCount: { type: Number, default: 0 },
    notes: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Conversation', conversationSchema);