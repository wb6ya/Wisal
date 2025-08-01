// src/routes/analytics.routes.js
const express = require('express');
const { isAuthenticated } = require('../middleware/auth');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const mongoose = require('mongoose');
const router = express.Router();

// GET summary analytics for the company
router.get('/summary', isAuthenticated, async (req, res) => {
    try {
        const companyId = new mongoose.Types.ObjectId(req.session.companyId);

        // 1. Get total conversations count
        const totalConversations = await Conversation.countDocuments({ companyId });

        // 2. Get total messages (incoming vs outgoing) using aggregation
        const messageStats = await Message.aggregate([
            { $lookup: { from: 'conversations', localField: 'conversationId', foreignField: '_id', as: 'conversation' } },
            { $unwind: '$conversation' },
            { $match: { 'conversation.companyId': companyId } },
            { $group: { _id: '$sender', count: { $sum: 1 } } }
        ]);

        const incomingMessages = messageStats.find(stat => stat._id === 'customer')?.count || 0;
        const outgoingMessages = messageStats.find(stat => stat._id === 'agent')?.count || 0;

        // 3. Get new conversations in the last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const newConversationsLast7Days = await Conversation.countDocuments({
            companyId,
            createdAt: { $gte: sevenDaysAgo }
        });

        // 4. Calculate average messages per conversation
        const totalMessages = incomingMessages + outgoingMessages;
        const avgMessagesPerConversation = totalConversations > 0 ? (totalMessages / totalConversations).toFixed(1) : 0;

        res.status(200).json({
            totalConversations,
            incomingMessages,
            outgoingMessages,
            totalMessages,
            newConversationsLast7Days,
            avgMessagesPerConversation
        });

    } catch (error) {
        console.error("Error fetching analytics summary:", error);
        res.status(500).json({ message: 'Failed to fetch analytics data.' });
    }
});

// --- NEW ROUTE FOR THE CHART ---
router.get('/messages-over-time', isAuthenticated, async (req, res) => {
    try {
        const companyId = new mongoose.Types.ObjectId(req.session.companyId);
        const today = new Date();
        today.setHours(23, 59, 59, 999); // End of today

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0); // Start of 7 days ago

        const dailyMessageStats = await Message.aggregate([
            { $lookup: { from: 'conversations', localField: 'conversationId', foreignField: '_id', as: 'conversation' } },
            { $unwind: '$conversation' },
            { $match: { 
                'conversation.companyId': companyId,
                'createdAt': { $gte: sevenDaysAgo, $lte: today }
            }},
            { $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                count: { $sum: 1 }
            }},
            { $sort: { _id: 1 } }
        ]);

        res.status(200).json(dailyMessageStats);
    } catch (error) {
        console.error("Error fetching messages over time:", error);
        res.status(500).json({ message: 'Failed to fetch chart data.' });
    }
});

/**
 * @route   GET /api/analytics/status-distribution
 * @desc    Get the distribution of conversation statuses.
 */
router.get('/status-distribution', isAuthenticated, async (req, res) => {
    try {
        const companyId = new mongoose.Types.ObjectId(req.session.companyId);
        const statusData = await Conversation.aggregate([
            { $match: { companyId: companyId } },
            { $group: {
                _id: '$status',
                count: { $sum: 1 }
            }}
        ]);
        res.status(200).json(statusData);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch status distribution data.' });
    }
});

/**
 * @route   GET /api/analytics/peak-hours
 * @desc    Get the count of incoming messages per hour of the day.
 */
router.get('/peak-hours', isAuthenticated, async (req, res) => {
    try {
        const companyId = new mongoose.Types.ObjectId(req.session.companyId);
        const peakHoursData = await Message.aggregate([
            { $lookup: { from: 'conversations', localField: 'conversationId', foreignField: '_id', as: 'conversation' } },
            { $unwind: '$conversation' },
            { $match: { 
                'conversation.companyId': companyId,
                'sender': 'customer' 
            }},
            { $project: {
                hour: { $hour: { date: "$createdAt", timezone: "Asia/Riyadh" } } 
            }},
            { $group: {
                _id: '$hour',
                count: { $sum: 1 }
            }},
            { $sort: { '_id': 1 } }
        ]);
        res.status(200).json(peakHoursData);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch peak hours data.' });
    }
});

/**
 * @route   GET /api/analytics/ratings-summary
 * @desc    Get a summary of all customer ratings.
 */
router.get('/ratings-summary', isAuthenticated, async (req, res) => {
    try {
        const companyId = new mongoose.Types.ObjectId(req.session.companyId);
        const ratingsData = await Conversation.aggregate([
            { $match: { 
                companyId: companyId,
                rating: { $exists: true, $ne: null } 
            }},
            { $group: {
                _id: '$rating',
                count: { $sum: 1 }
            }}
        ]);
        res.status(200).json(ratingsData);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch ratings data.' });
    }
});

module.exports = router;