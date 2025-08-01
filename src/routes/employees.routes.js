/**
 * Filename: employees.routes.js
 * Description: Handles all API routes for managing employees within a company.
 * Author: Google Gemini (Senior Software Engineer)
 */

const express = require('express');
const { isAuthenticated } = require('../middleware/auth');
const Employee = require('../models/Employee');
const Company = require('../models/Company'); // Import the Company model
const router = express.Router();
const { body, validationResult } = require('express-validator');

// Middleware to check if the logged-in user is an admin
const isAdmin = (req, res, next) => {
    if (req.session.role === 'admin') {
        return next();
    }
    return res.status(403).json({ message: 'Forbidden: Admins only.' });
};
const addEmployeeValidationRules = [
    body('name')
        .notEmpty().withMessage('Name is required.')
        .trim()
        .escape(), // للحماية من هجمات XSS

    body('email')
        .isEmail().withMessage('Please provide a valid email address.')
        .normalizeEmail(), // لتوحيد شكل الإيميل

    body('password')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long.')
];


// GET all employees for the company
router.get('/', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const employees = await Employee.find({ companyId: req.session.companyId }).select('-password'); // Exclude passwords
        res.status(200).json(employees);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch employees.' });
    }
});

// POST to create a new employee
router.post('/', isAuthenticated, isAdmin, addEmployeeValidationRules, async (req, res) => {
    const errors = validationResult(req);
        if (!errors.isEmpty()) {
            // إذا كانت هناك أخطاء، أرجعها للمستخدم وتوقف
            return res.status(400).json({ errors: errors.array() });
        }
    try {
        const { name, email, password, role, phoneNumber } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Name, email, and password are required.' });
        }

        // --- VALIDATION ADDED ---
        // Fetch the parent company to check its email
        const company = await Company.findById(req.session.companyId);
        if (company && company.email === email) {
            return res.status(400).json({ message: 'Cannot use the company owner\'s email for an employee.' });
        }
        // --- END OF VALIDATION ---

        const newEmployee = new Employee({
            companyId: req.session.companyId,
            name,
            email,
            password,
            phoneNumber, // <-- 2. حفظ رقم الهاتف في قاعدة البيانات
            role: role || 'agent'
        });

        await newEmployee.save();
        const employeeResponse = newEmployee.toObject();
        delete employeeResponse.password;
        res.status(201).json(newEmployee);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ message: 'An employee with this email already exists.' });
        }
        res.status(500).json({ message: 'Failed to create employee.' });
    }
});

// DELETE an employee
router.delete('/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const employee = await Employee.findOneAndDelete({ _id: req.params.id, companyId: req.session.companyId });
        if (!employee) {
            return res.status(404).json({ message: 'Employee not found.' });
        }
        res.status(200).json({ message: 'Employee deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete employee.' });
    }
});

module.exports = router;