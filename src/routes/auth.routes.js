const express = require('express');
const bcrypt = require('bcrypt');
const Company = require('../models/Company');
const Employee = require('../models/Employee');
const { isAuthenticated } = require('../middleware/auth');
const router = express.Router();

// --- 1. استدعاء أدوات التحقق ---
const { body, validationResult } = require('express-validator');


// --- 2. تعريف قواعد التحقق للتسجيل الجديد ---
const registerValidationRules = [
    body('companyName').notEmpty().withMessage('Company name is required').trim().escape(),
    body('email').isEmail().withMessage('Please provide a valid email').normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
];

// --- 3. تعريف قواعد التحقق لتسجيل الدخول ---
const loginValidationRules = [
    body('email').isEmail().withMessage('Please provide a valid email').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required')
];


router.post('/register', registerValidationRules, async (req, res) => {
    // التحقق من وجود أخطاء في المدخلات
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { companyName, email, password } = req.body;
        const existingCompany = await Company.findOne({ email });
        if (existingCompany) return res.status(400).json({ message: 'Email already in use' });
        
        const company = new Company({ companyName, email, password });
        await company.save();
        
        // Create session after successful registration
        req.session.userId = company._id;
        req.session.companyId = company._id;
        req.session.role = 'admin';

        res.status(201).json({ message: 'Company registered successfully!', redirectUrl: '/dashboard' });
    } catch (error) {
        res.status(500).json({ message: 'Server error during registration' });
    }
});

router.post('/login', loginValidationRules, async (req, res) => {
    // التحقق من وجود أخطاء في المدخلات
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { email, password } = req.body;
        const employee = await Employee.findOne({ email });
        if (employee) {
            const isMatch = await bcrypt.compare(password, employee.password);
            if (isMatch) {
                req.session.userId = employee._id;
                req.session.companyId = employee.companyId;
                req.session.role = employee.role;
                return res.status(200).json({ message: 'Login successful!', redirectUrl: '/dashboard' });
            }
        }
        const company = await Company.findOne({ email });
        if (company) {
            const isMatch = await bcrypt.compare(password, company.password);
            if (isMatch) {
                req.session.userId = company._id;
                req.session.companyId = company._id;
                req.session.role = 'admin';
                return res.status(200).json({ message: 'Login successful!', redirectUrl: '/dashboard' });
            }
        }
        return res.status(400).json({ message: 'Invalid email or password' });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: 'Server error during login' });
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ message: 'Could not log out, please try again.' });
        }
        res.redirect('/');
    });
});

router.post('/settings', isAuthenticated, async (req, res) => {
    try {
        const { accessToken, phoneNumberId, verifyToken } = req.body; // تم حذف welcomeMessage

        if (!accessToken || !phoneNumberId || !verifyToken) {
            return res.status(400).json({ message: 'Please fill all required API fields' });
        }

        await Company.findByIdAndUpdate(req.session.companyId, {
            $set: { 
                'whatsapp.accessToken': accessToken, 
                'whatsapp.phoneNumberId': phoneNumberId, 
                'whatsapp.verifyToken': verifyToken

            }
        });

        res.status(200).json({ message: 'Settings saved successfully!' });
    } catch (error) {
        console.error("Error saving settings:", error);
        res.status(500).json({ message: 'Server error while saving settings' });
    }
});

module.exports = router;