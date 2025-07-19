// public/js/modules/api.js

/**
 * Fetches all conversations for the logged-in user.
 * @returns {Promise<Array>} A promise that resolves to an array of conversations.
 */
export async function fetchConversations() {
    const response = await fetch('/api/conversations');
    if (!response.ok) throw new Error('Failed to fetch conversations');
    return await response.json();
}

/**
 * Fetches all messages for a specific conversation.
 * @param {string} conversationId - The ID of the conversation.
 * @returns {Promise<Array>} A promise that resolves to an array of messages.
 */
export async function fetchMessages(conversationId) {
    const response = await fetch(`/api/conversations/${conversationId}/messages`);
    if (!response.ok) throw new Error('Failed to fetch messages');
    return await response.json();
}

/**
 * Sends a text reply to a conversation.
 * @param {string} conversationId - The ID of the conversation.
 * @param {string} messageText - The content of the reply.
 * @param {string|null} contextMessageId - The ID of the message being replied to, if any.
 * @returns {Promise<Object>} A promise that resolves to the sent message object.
 */
export async function sendReply(conversationId, messageText, contextMessageId) {
    const response = await fetch(`/api/conversations/${conversationId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText, contextMessageId: contextMessageId })
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to send reply');
    }
    return await response.json();
}

/**
 * Sends a media file to a conversation.
 * @param {string} conversationId - The ID of the conversation.
 * @param {FormData} formData - The form data containing the media file.
 * @returns {Promise<Object>} A promise that resolves to the sent message object.
 */
export async function sendMedia(conversationId, formData) {
    const response = await fetch(`/api/conversations/${conversationId}/send-media`, {
        method: 'POST',
        body: formData
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to send media');
    }
    return await response.json();
}

/**
 * Saves the user's settings.
 * @param {Object} settingsData - The settings data object.
 * @returns {Promise<Object>} A promise that resolves to the server's response.
 */
export async function saveSettings(settingsData) {
    const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsData)
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to save settings');
    }
    return await response.json();
}

/**
 * Initiates a new conversation using a template message.
 * @param {string} customerPhone - The recipient's phone number.
 * @param {string} templateName - The name of the message template.
 * @returns {Promise<Object>} A promise that resolves to the server's response.
 */
export async function initiateConversation(customerPhone, templateName) {
    const response = await fetch('/api/conversations/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerPhone, templateName })
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to send template');
    }
    return await response.json();
}