/**
 * Filename: pages.js
 * Description: Handles routing for rendering the main pages of the application,
 * such as the login/landing page, the chat dashboard, and the analytics page.
 * Author: Google Gemini (Senior Software Engineer)
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const Company = require('../models/Company');
const Employee = require('../models/Employee');
const { isAuthenticated } = require('../middleware/auth');

/**
 * @desc    A helper function to fetch company and current user data.
 * This is defined in a higher scope to be reusable by all routes in this file.
 * @param   {object} req - The Express request object.
 * @returns {object|null} An object containing company and user data, or null if not found.
 */
async function getSharedPageData(req) {
    const company = await Company.findById(req.session.companyId);
    if (!company) {
        return null;
    }

    let currentUser;
    // Differentiate between the company owner and an employee based on session data.
    if (req.session.role === 'admin' && req.session.userId.toString() === req.session.companyId.toString()) {
        currentUser = { name: company.companyName, role: 'Admin' };
    } else {
        const employee = await Employee.findById(req.session.userId);
        if (!employee) {
            return null; // Employee not found, session is invalid.
        }
        currentUser = { name: employee.name, role: employee.role === 'admin' ? 'Admin' : 'Employee' };
    }
    return { company, user: currentUser };
}



/**
 * @route   GET /
 * @desc    Renders the landing/login page or redirects if already logged in.
 * @access  Public
 */
router.get('/', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/dashboard');
    }
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
});


/**
 * @route   GET /dashboard
 * @desc    Renders the main application dashboard.
 * @access  Private
 */
router.get('/dashboard', isAuthenticated, async (req, res) => {
    try {
        const pageData = await getSharedPageData(req);
        if (!pageData) {
            return req.session.destroy(() => res.redirect('/'));
        }

        const webhookUrl = `${req.protocol}://${req.get('host')}/webhook/${pageData.company._id}`;
        
        res.render('dashboard', { 
            company: pageData.company, 
            webhookUrl,  
            user: pageData.user,
            page_name: 'dashboard',
            cloudName: process.env.CLOUDINARY_CLOUD_NAME
        });
    } catch (error) {
        console.error("Dashboard loading error:", error);
        res.redirect('/');
    }
});

/**
 * @route   GET /analytics
 * @desc    Renders the analytics page.
 * @access  Private
 */
router.get('/analytics', isAuthenticated, async (req, res) => {
    try {
        const pageData = await getSharedPageData(req);
        if (!pageData) {
            return req.session.destroy(() => res.redirect('/'));
        }

        res.render('analytics', { 
            company: pageData.company, 
            user: pageData.user,
            page_name: 'analytics',
            cloudName: process.env.CLOUDINARY_CLOUD_NAME
        });
    } catch (error) {
        console.error("Analytics page error:", error);
        res.redirect('/dashboard');
    }
});

/**
 * @route   GET /customers
 * @desc    Renders the customers page, showing a list of all unique customers.
 * @access  Private
 */
router.get('/customers', isAuthenticated, async (req, res) => {
    try {
        const pageData = await getSharedPageData(req);
        if (!pageData) {
            return req.session.destroy(() => res.redirect('/'));
        }

        res.render('customers', {
            company: pageData.company,
            user: pageData.user,
            page_name: 'customers',
            cloudName: process.env.CLOUDINARY_CLOUD_NAME
         });
    } catch (error) {
        console.error("Customers page error:", error);
        res.redirect('/dashboard');
    }
});

/**
 * @route   GET /templates
 * @desc    Renders the message templates management page.
 * @access  Private
 */
router.get('/templates', isAuthenticated, async (req, res) => {
    try {
        const pageData = await getSharedPageData(req);
        if (!pageData) {
            return req.session.destroy(() => res.redirect('/'));
        }

        res.render('templates', { 
            company: pageData.company, 
            user: pageData.user,
            cloudName: process.env.CLOUDINARY_CLOUD_NAME,
            page_name: 'templates' 
        });
    } catch (error) {
        console.error("Templates page error:", error);
        res.redirect('/dashboard');
    }
});

module.exports = router;