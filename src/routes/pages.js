const express = require('express');
const router = express.Router();
const path = require('path');
const Company = require('../models/Company');
const { isAuthenticated } = require('../middleware/auth');

router.get('/', (req, res) => {
    if (req.session.companyId) {
        return res.redirect('/dashboard');
    }
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
});

router.get('/dashboard', isAuthenticated, async (req, res) => {
    try {
        const company = await Company.findById(req.session.companyId);
        if (!company) {
            req.session.destroy();
            return res.redirect('/');
        }
        const webhookUrl = `${req.protocol}://${req.get('host')}/webhook/${company._id}`;
        res.render('dashboard', {
            company,
            webhookUrl,
            cloudName: process.env.CLOUDINARY_CLOUD_NAME
        });
    } catch (error) {
        console.error("Dashboard loading error:", error);
        res.redirect('/');
    }
});

module.exports = router;