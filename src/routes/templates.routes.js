// src/routes/templates.routes.js
const express = require('express');
const axios = require('axios');
const { isAuthenticated } = require('../middleware/auth');
const Company = require('../models/Company');
const Template = require('../models/Template');

const router = express.Router();

// GET all templates for a company
router.get('/', isAuthenticated, async (req, res) => {
    try {
        const templates = await Template.find({ companyId: req.session.companyId }).sort({ createdAt: -1 });
        res.status(200).json(templates);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch templates' });
    }
});

// POST to create a new template
router.post('/', isAuthenticated, async (req, res) => {
    try {
        const { name, category, bodyText, language } = req.body;
        if (!name || !category || !bodyText || !language) {
            return res.status(400).json({ message: 'All fields are required.' });
        }

        const company = await Company.findById(req.session.companyId);
        if (!company || !company.whatsapp.accessToken) {
            return res.status(401).json({ message: "WhatsApp configuration is missing or invalid." });
        }

        // 1. Send the request to Meta to create the template
        const metaApiUrl = `https://graph.facebook.com/v19.0/${company.whatsapp.phoneNumberId}/message_templates`;
        const apiRequestData = {
            name: name,
            category: category,
            language: language,
            components: [{
                type: "BODY",
                text: bodyText
            }]
        };
        const headers = { 'Authorization': `Bearer ${company.whatsapp.accessToken}` };
        
        const metaResponse = await axios.post(metaApiUrl, apiRequestData, { headers });
        const metaTemplateId = metaResponse.data.id;

        // 2. Save the new template to our local database
        const newTemplate = new Template({
            companyId: req.session.companyId,
            name,
            category,
            bodyText,
            language,
            metaTemplateId,
            status: 'PENDING' // Meta's approval is pending
        });
        await newTemplate.save();

        res.status(201).json(newTemplate);
    } catch (error) {
        const errorMessage = error.response?.data?.error?.message || 'Failed to create template.';
        console.error("Error creating template:", error.response?.data?.error || error);
        res.status(500).json({ message: errorMessage });
    }
});

// DELETE a template
router.delete('/:name', isAuthenticated, async (req, res) => {
    try {
        const { name } = req.params;
        const company = await Company.findById(req.session.companyId);
        if (!company || !company.whatsapp.accessToken) {
            return res.status(401).json({ message: "WhatsApp configuration is missing." });
        }

        // 1. Send request to Meta to delete the template
        const metaApiUrl = `https://graph.facebook.com/v19.0/${company.whatsapp.phoneNumberId}/message_templates`;
        const headers = { 'Authorization': `Bearer ${company.whatsapp.accessToken}` };
        await axios.delete(metaApiUrl, { params: { name }, headers });
        
        // 2. Delete the template from our local database
        await Template.findOneAndDelete({ companyId: req.session.companyId, name: name });

        res.status(200).json({ message: 'Template deleted successfully.' });
    } catch (error) {
        const errorMessage = error.response?.data?.error?.message || 'Failed to delete template.';
        console.error("Error deleting template:", error.response?.data?.error || error);
        res.status(500).json({ message: errorMessage });
    }
});


module.exports = router;