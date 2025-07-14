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
    wabaMessageId: { 
        type: String, 
        unique: true, // يجب أن يكون فريدًا
        sparse: true // يسمح بوجود قيم فارغة متعددة (للرسائل الواردة من العملاء)
    },
    content: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['sent', 'delivered', 'read'], // القيم المسموح بها فقط
        default: 'sent' // القيمة الافتراضية عند إنشاء الرسالة
    }
},{ timestamps: true });

module.exports = mongoose.model('Message', messageSchema);