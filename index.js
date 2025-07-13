// index.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose'); // استيراد mongoose

const app = express();

// --- الاتصال بقاعدة البيانات ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('تم الاتصال بقاعدة البيانات بنجاح!'))
    .catch(err => console.error(err));

app.get('/', (req, res) => {
    res.send('مرحبًا من منصة واتساب!');
});

const PORT = process.env.PORT || 3000;
// index.js (أضف هذه الأسطر)
const Company = require('./models/Company');

// أوامر وسيطة لمعالجة الطلبات الواردة
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- مسارات الواجهة البرمجية (API Routes) ---
app.post('/api/register', async (req, res) => {
    try {
        const { companyName, email, password } = req.body;

        // التحقق مما إذا كان المستخدم موجودًا بالفعل
        const existingCompany = await Company.findOne({ email });
        if (existingCompany) {
            return res.status(400).json({ message: 'هذا البريد الإلكتروني مستخدم بالفعل' });
        }

        // إنشاء شركة جديدة (سيتم تشفير كلمة المرور تلقائيًا بواسطة النموذج)
        const company = new Company({ companyName, email, password });
        await company.save();

        res.status(201).json({ message: 'تم تسجيل الشركة بنجاح!' });

    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم', error });
    }
});
app.listen(PORT, () => {
    console.log(`الخادم يعمل على المنفذ ${PORT}`);
});