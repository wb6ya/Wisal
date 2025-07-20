// src/routes/customers.routes.js
const express = require('express');
const { isAuthenticated } = require('../middleware/auth');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const mongoose = require('mongoose');
const router = express.Router();

/**
 * @route   GET /api/customers
 * @desc    Get a unique, detailed list of all customers for the company.
 * @access  Private
 */
router.get('/', isAuthenticated, async (req, res) => {
    try {
        const companyId = new mongoose.Types.ObjectId(req.session.companyId);

        // A more advanced aggregation pipeline to gather rich customer data
        const customers = await Conversation.aggregate([
            { $match: { companyId: companyId } },
            { $sort: { createdAt: 1 } }, // Sort by creation to find the first interaction
            {
                $group: {
                    _id: "$customerPhone", // Group by unique phone number
                    name: { $last: "$customerName" }, // Get the most recent name
                    status: { $last: "$status" }, // Get the status of the most recent conversation
                    firstInteraction: { $first: "$createdAt" }, // Get the date of the first conversation
                    lastInteraction: { $last: "$updatedAt" }, // Get the last interaction time
                    conversationIds: { $push: "$_id" } // Collect all conversation IDs for this customer
                }
            },
            {
                $lookup: { // Join with the messages collection
                    from: "messages",
                    localField: "conversationIds",
                    foreignField: "conversationId",
                    as: "messages"
                }
            },
            {
                $project: { // Reshape the final output
                    _id: 0,
                    phone: "$_id",
                    name: "$name",
                    status: "$status",
                    firstInteraction: "$firstInteraction",
                    lastInteraction: "$lastInteraction",
                    totalMessages: { $size: "$messages" } // Count the total number of messages
                }
            },
            { $sort: { lastInteraction: -1 } } // Sort by most recently active customer
        ]);

        res.status(200).json(customers);

    } catch (error) {
        console.error("Error fetching customers:", error);
        res.status(500).json({ message: 'Failed to fetch customer data.' });
    }
});

module.exports = router;