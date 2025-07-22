const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    customerPhone: { type: String, required: true },
    customerName: { type: String },
    lastMessage: { type: String, default: "" },
    lastMessageTimestamp: { type: Date, default: Date.now },
    unreadCount: { type: Number, default: 0 },
    notes: { type: String, default: '' },
    status: { type: String, enum: ['new', 'in_progress', 'resolved'], default: 'new'}
}, { timestamps: true });

conversationSchema.index({ companyId: 1, lastMessageTimestamp: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);