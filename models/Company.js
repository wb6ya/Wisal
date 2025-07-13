// models/Company.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const CompanySchema = new mongoose.Schema({
    companyName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }
}, { timestamps: true });

// أمر وسيط لتجزئة (تشفير) كلمة المرور قبل الحفظ
CompanySchema.pre('save', async function(next) {
    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

module.exports = mongoose.model('Company', CompanySchema);