const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const CompanySchema = new mongoose.Schema({
    companyName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    whatsapp: {
        accessToken: { type: String },
        phoneNumberId: { type: String },
        verifyToken: { type: String },
    },
    welcomeTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template', default: null },
    isBotEnabled: { type: Boolean, default: false },
}, { timestamps: true });

CompanySchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

module.exports = mongoose.model('Company', CompanySchema);