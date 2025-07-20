// src/models/Template.js
const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
    },
    category: {
        type: String,
        enum: ['MARKETING', 'UTILITY', 'AUTHENTICATION'],
        required: true
    },
    language: {
        type: String,
        required: true,
        default: 'ar'
    },
    bodyText: {
        type: String,
        required: true
    },
    // We will store the status provided by Meta
    status: {
        type: String,
        default: 'PENDING'
    },
    metaTemplateId: {
        type: String // To store the ID from Meta's system
    }
}, { timestamps: true });

// Prevent duplicate template names for the same company
templateSchema.index({ companyId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Template', templateSchema);