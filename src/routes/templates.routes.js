const express = require('express');
const { isAuthenticated } = require('../middleware/auth');
const Template = require('../models/Template');
const router = express.Router();

/**
 * @route   GET /api/templates
 * @desc    Get all templates for the company
 * @access  Private
 */
router.get('/', isAuthenticated, async (req, res) => {
    try {
        const templates = await Template.find({ companyId: req.session.companyId }).sort({ createdAt: -1 });
        res.status(200).json(templates);
    } catch (error) {
        res.status(500).json({ message: 'Server error while fetching templates.' });
    }
});

/**
 * @route   POST /api/templates
 * @desc    Create a new message template
 * @access  Private
 */
router.post('/', isAuthenticated, async (req, res) => {
    try {
        const { name, text, type, buttons } = req.body;
        if (!name || !text || !type) {
            return res.status(400).json({ message: 'Name, text, and type are required.' });
        }
        const newTemplate = new Template({
            companyId: req.session.companyId,
            name, text, type,
            buttons: type === 'interactive' ? buttons : [],
            isInitiationOnly: isInitiationOnly || false 
        });
        await newTemplate.save();
        res.status(201).json(newTemplate);
    } catch (error) {
        res.status(500).json({ message: 'Server error while creating template.' });
    }
});

/**
 * @route   PUT /api/templates/:id
 * @desc    Update an existing template
 * @access  Private
 */
router.put('/:id', isAuthenticated, async (req, res) => {
    try {
        const { name, text, type, buttons } = req.body;
        const updatedTemplate = await Template.findOneAndUpdate(
            { _id: req.params.id, companyId: req.session.companyId }, // Security check
            { name, text, type, buttons: type === 'interactive' ? buttons : [], isInitiationOnly: isInitiationOnly || false },
            { new: true, runValidators: true }
        );
        if (!updatedTemplate) {
            return res.status(404).json({ message: 'Template not found.' });
        }
        res.status(200).json(updatedTemplate);
    } catch (error) {
        res.status(500).json({ message: 'Server error while updating template.' });
    }
});

/**
 * @route   DELETE /api/templates/:id
 * @desc    Delete a template
 * @access  Private
 */
router.delete('/:id', isAuthenticated, async (req, res) => {
    try {
        const deletedTemplate = await Template.findOneAndDelete({ 
            _id: req.params.id, 
            companyId: req.session.companyId // Security check
        });
        if (!deletedTemplate) {
            return res.status(404).json({ message: 'Template not found.' });
        }
        res.status(200).json({ message: 'Template deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error while deleting template.' });
    }
});

module.exports = router;