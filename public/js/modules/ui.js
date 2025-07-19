// public/js/modules/ui.js

// --- Helper Functions for UI manipulation ---

/**
 * Creates and displays a new message bubble in the chat window.
 * @param {Object} msg - The message object from the database.
 * @param {HTMLElement} messagesArea - The DOM element for the messages container.
 */
export function appendMessage(msg, messagesArea) {
    const placeholder = messagesArea.querySelector('.placeholder');
    if (placeholder) placeholder.remove();

    const msgBubble = document.createElement('div');
    msgBubble.className = 'message-bubble';
    msgBubble.dataset.messageId = msg._id;

    if (msg.repliedToMessageContent) {
        const quotedReply = document.createElement('div');
        quotedReply.className = 'quoted-reply';
        quotedReply.dataset.replyId = msg.repliedToMessageId;
        quotedReply.innerHTML = `
            <strong>${msg.repliedToMessageSender}</strong>
            <p class="mb-0 text-truncate">${msg.repliedToMessageContent}</p>
        `;
        msgBubble.appendChild(quotedReply);
    }

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'message-content';

    switch (msg.messageType) {
        case 'image':
            contentWrapper.innerHTML = `<a href="${msg.content}" target="_blank"><img src="${msg.content}" style="max-width: 250px; border-radius: 8px;"></a>`;
            break;
        case 'video':
            contentWrapper.innerHTML = `<video controls src="${msg.content}" style="max-width: 300px; border-radius: 8px;"></video>`;
            break;
        case 'audio':
            contentWrapper.innerHTML = `<audio controls src="${msg.content}" style="width: 250px;"></audio>`;
            break;
        case 'document':
        case 'raw':
            contentWrapper.innerHTML = `<a href="/api/download/${msg._id}" target="_blank" class="text-decoration-none d-flex align-items-center"><i class="bi bi-file-earmark-text-fill fs-3 me-2"></i><span>${msg.filename}</span></a>`;
            break;
        default:
            contentWrapper.textContent = msg.content;
            break;
    }

    const timestamp = new Date(msg.createdAt);
    const formattedTime = timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const timestampEl = document.createElement('div');
    timestampEl.className = 'timestamp';
    timestampEl.textContent = formattedTime;

    if (msg.sender === 'agent') {
        const metaContainer = document.createElement('div');
        metaContainer.className = 'message-meta-container';
        metaContainer.innerHTML = `<span class="status-ticks" data-status="${msg.status}">✓</span>`;
        timestampEl.appendChild(metaContainer);
    }

    msgBubble.appendChild(contentWrapper);
    msgBubble.appendChild(timestampEl);
    msgBubble.classList.add(msg.sender === 'customer' ? 'customer-message' : 'agent-message');
    messagesArea.prepend(msgBubble);
}

/**
 * Updates the status ticks (✓✓) of a sent message.
 * @param {Object} data - The status update data from the server.
 */
export function updateMessageStatus(data) {
    const messageBubble = document.querySelector(`.message-bubble[data-message-id="${data.messageId}"]`);
    if (messageBubble) {
        const statusTicks = messageBubble.querySelector('.status-ticks');
        if (statusTicks) {
            statusTicks.dataset.status = data.status;
        }
    }
}