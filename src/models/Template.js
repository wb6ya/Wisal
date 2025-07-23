const mongoose = require('mongoose');

// تعريف مخطط فرعي لشكل الأزرار
const templateButtonSchema = new mongoose.Schema({
    title: { // النص الذي يظهر على الزر
        type: String,
        required: true,
        trim: true,
        maxlength: 20 // حد واتساب لنص الزر
    },
    nextTemplateId: { // معرّف القالب التالي الذي سيتم إرساله
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Template',
        default: null // إذا كان فارغًا، تنتهي السلسلة هنا
    }
}, { _id: false });

// المخطط الرئيسي للقالب
const templateSchema = new mongoose.Schema({
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true,
        index: true
    },
    name: { // اسم داخلي للقالب لتنظيمه (مثال: "قائمة الترحيب الرئيسية")
        type: String,
        required: true,
        trim: true
    },
    text: { // محتوى الرسالة
        type: String,
        required: true,
        trim: true,
        maxlength: 1024
    },
    type: {
        type: String,
        required: true,
        enum: ['text', 'interactive'],
        default: 'text'
    },
    buttons: {
        type: [templateButtonSchema],
        validate: [val => val.length <= 3, 'A template can have a maximum of 3 buttons.']
    }
}, { timestamps: true });

module.exports = mongoose.model('Template', templateSchema);