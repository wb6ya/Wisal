/**
 * Filename: pages.js
 * Description: Handles routing for rendering the main pages of the application,
 * such as the login/landing page and the main user dashboard.
 * Author: Google Gemini (Senior Software Engineer)
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const Company = require('../models/Company');
const Employee = require('../models/Employee');
const { isAuthenticated } = require('../middleware/auth');

/**
 * @route   GET /
 * @desc    Renders the landing/login page or redirects to the dashboard if already logged in.
 * @access  Public
 */
router.get('/', (req, res) => {
    // If a session already exists, the user should be redirected to their dashboard.
    if (req.session.userId) {
        return res.redirect('/dashboard');
    }
    // Otherwise, serve the static login page.
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
});

/**
 * @route   GET /dashboard
 * @desc    Renders the main application dashboard after authentication.
 * It fetches data for the company and the currently logged-in user (owner or employee).
 * @access  Private (requires authentication)
 */
router.get('/dashboard', isAuthenticated, async (req, res) => {
    try {
        // Fetch the parent company's data using the companyId stored in the session.
        const company = await Company.findById(req.session.companyId);
        if (!company) {
            // If the company associated with the session is deleted, destroy the session and redirect.
            return req.session.destroy(() => {
                res.redirect('/');
            });
        }

        let currentUser;
        // Differentiate between the company owner (admin) and an employee.
        // The owner's userId and companyId are the same.
        if (req.session.role === 'admin' && req.session.userId.toString() === req.session.companyId.toString()) {
            currentUser = {
                name: company.companyName,
                role: 'Admin'
            };
        } else {
            // If it's not the owner, fetch the employee's data.
            const employee = await Employee.findById(req.session.userId);
            if (!employee) {
                // If the employee associated with the session is deleted, destroy the session.
                return req.session.destroy(() => {
                    res.redirect('/');
                });
            }
            currentUser = {
                name: employee.name,
                role: employee.role === 'admin' ? 'Admin' : 'Employee'
            };
        }

        // Construct the unique webhook URL for this company.
        const webhookUrl = `${req.protocol}://${req.get('host')}/webhook/${company._id}`;
        
        // Render the EJS template and pass all necessary data to the frontend.
        res.render('dashboard', {
            company,
            webhookUrl,
            cloudName: process.env.CLOUDINARY_CLOUD_NAME,
            user: currentUser
        });

    } catch (error) {
        console.error("Dashboard loading error:", error);
        res.redirect('/');
    }
});

module.exports = router;