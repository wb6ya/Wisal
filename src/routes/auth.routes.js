const express = require('express');
const bcrypt = require('bcrypt');
const Company = require('../models/Company');
const Employee = require('../models/Employee');
const router = express.Router();

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

module.exports = router;