const express = require('express');
const bcrypt = require('bcrypt');
const Company = require('../models/Company');
const Employee = require('../models/Employee');
const router = express.Router();

function generate2FACode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

router.post('/register', async (req, res) => {
    try {
        const { companyName, email, password } = req.body;
        if (!companyName || !email || !password) return res.status(400).json({ message: 'Please fill all fields' });
        const existingCompany = await Company.findOne({ email });
        if (existingCompany) return res.status(400).json({ message: 'Email already in use' });
        const company = new Company({ companyName, email, password });
        await company.save();
        res.status(201).json({ message: 'Company registered successfully!' });
    } catch (error) {
        res.status(500).json({ message: 'Server error during registration' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Check if the user is an Employee
        let employee = await Employee.findOne({ email });
        if (employee) {
            const isMatch = await bcrypt.compare(password, employee.password);
            if (isMatch) {
                req.session.userId = employee._id;
                req.session.companyId = employee.companyId;
                req.session.role = employee.role;
                return res.status(200).json({ message: 'Login successful!', redirectUrl: '/dashboard' });
            }
        }

        // 2. If not an employee, check if the user is a Company Owner
        let company = await Company.findOne({ email });
        if (company) {
            const isMatch = await bcrypt.compare(password, company.password);
            if (isMatch) {
                req.session.userId = company._id;
                req.session.companyId = company._id;
                req.session.role = 'admin';
                return res.status(200).json({ message: 'Login successful!', redirectUrl: '/dashboard' });
            }
        }
        
        // 3. If neither, login fails
        return res.status(400).json({ message: 'Invalid email or password' });

    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: 'Server error during login' });
    }
});

// Step 2 of Login: Verify 2FA code and create session
router.post('/verify-2fa', async (req, res) => {
    try {
        const { email, code } = req.body;
        let user = await Employee.findOne({ email }) || await Company.findOne({ email });

        if (!user || user.twoFactorCode !== code || user.twoFactorExpires < Date.now()) {
            return res.status(400).json({ message: 'Invalid or expired verification code.' });
        }

        // Clear the 2FA code
        user.twoFactorCode = undefined;
        user.twoFactorExpires = undefined;
        await user.save();

        // Create the session
        req.session.userId = user._id;
        if (user instanceof Company) {
            req.session.companyId = user._id;
            req.session.role = 'admin';
        } else { // It's an Employee
            req.session.companyId = user.companyId;
            req.session.role = user.role;
        }

        res.status(200).json({ message: 'Login successful!', redirectUrl: '/dashboard' });
    } catch (error) {
        console.error("Login Step 2 error:", error);
        res.status(500).json({ message: 'Server error during verification' });
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

module.exports = router;