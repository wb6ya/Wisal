const express = require('express');
const { isAuthenticated } = require('../middleware/auth');
const Company = require('../models/Company');
const router = express.Router();

/**
 * @route   POST /api/bot-settings/toggle
 * @desc    Enable or disable the entire bot for a company
 * @access  Private
 */
router.post('/toggle', isAuthenticated, async (req, res) => {
    try {
        const { isEnabled } = req.body; // Expecting { "isEnabled": true/false }

        if (typeof isEnabled !== 'boolean') {
            return res.status(400).json({ message: 'Invalid value for isEnabled.' });
        }

        await Company.findByIdAndUpdate(req.session.companyId, {
            $set: { isBotEnabled: isEnabled }
        });

        res.status(200).json({ message: `Bot has been ${isEnabled ? 'enabled' : 'disabled'}.` });
    } catch (error) {
        console.error("Error toggling bot:", error);
        res.status(500).json({ message: 'Server error while toggling bot.' });
    }
});

/**
 * @route   POST /api/bot-settings/set-welcome
 * @desc    Set a specific template as the welcome message for a company
 * @access  Private
 */
router.post('/set-welcome', isAuthenticated, async (req, res) => {
    try {
        const { templateId } = req.body; // Expecting { "templateId": "..." }

        // Setting templateId to null is allowed, to disable the welcome message
        if (!templateId) {
             await Company.findByIdAndUpdate(req.session.companyId, {
                $set: { welcomeTemplateId: null }
            });
            return res.status(200).json({ message: 'Welcome template has been unset.' });
        }

        await Company.findByIdAndUpdate(req.session.companyId, {
            $set: { welcomeTemplateId: templateId }
        });

        res.status(200).json({ message: 'Welcome template has been set successfully.' });
    } catch (error) {
        console.error("Error setting welcome template:", error);
        res.status(500).json({ message: 'Server error while setting welcome template.' });
    }
});

/**
 * @route   GET /api/bot-settings/status
 * @desc    Get the current status of the bot
 * @access  Private
 */
router.get('/status', isAuthenticated, async (req, res) => {
    try {
        const company = await Company.findById(req.session.companyId).select('isBotEnabled welcomeTemplateId');
        if (!company) {
            return res.status(404).json({ message: 'Company not found.' });
        }
        res.status(200).json({
            isBotEnabled: company.isBotEnabled,
            welcomeTemplateId: company.welcomeTemplateId
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error while fetching bot status.' });
    }
});

module.exports = router;