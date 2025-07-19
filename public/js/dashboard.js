// This event listener ensures that the entire script runs only after the
// HTML document is fully loaded, preventing "element not found" errors.
document.addEventListener('DOMContentLoaded', () => {

    // --- 1. Element Selectors & Initial State ---
    // We select all the interactive elements from the page once and store them in constants.
    const convListDiv = document.getElementById('conv-list');
    const messagesArea = document.querySelector('.messages-area');
    const replyForm = document.getElementById('replyForm');
    const replyMessageInput = document.getElementById('replyMessage');
    const chatHeaderContent = document.getElementById('chat-header-content');
    const chatHeaderAvatar = document.getElementById('chat-header-avatar');
    const chatHeaderName = document.getElementById('chat-header-name');
    const attachBtn = document.getElementById('attachBtn');
    const mediaUploadInput = document.getElementById('mediaUpload');
    const settingsForm = document.getElementById('settingsForm');
    const generateTokenBtn = document.getElementById('generateTokenBtn');
    const loginForm = document.getElementById('loginForm');
    const newChatForm = document.getElementById('newChatForm');
    const conversationSearchInput = document.getElementById('conversationSearch');
    const messageSearchInput = document.getElementById('messageSearchInput');
    const searchIcon = document.getElementById('searchIcon');
    const closeSearchBtn = document.getElementById('closeSearchBtn');
    const messageSearchContainer = document.getElementById('messageSearchContainer');

    // --- Socket.IO & Sound Initialization ---
    const socket = io();
    const notificationSound = new Audio('/sounds/notification.mp3');
    let activeConversationId = null;

    // --- 2. Helper Functions ---

    // Formats a date into a relative time string (e.g., "5 minutes ago")
    function formatRelativeTime(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.round((now - date) / 1000);
        const minutes = Math.round(seconds / 60);
        const hours = Math.round(minutes / 60);
        const days = Math.round(hours / 24);

        if (seconds < 60) return `الآن`;
        if (minutes < 60) return `منذ ${minutes} دقيقة`;
        if (hours < 24) return `منذ ${hours} ساعة`;
        return new Date(dateString).toLocaleDateString();
    }
    
    // Generates a unique, pleasant color based on a string (like a name)
    function generateHSLColor(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = hash % 360;
        return `hsl(${h}, 50%, 60%)`; // Hue, Saturation, Lightness
    }

    // Creates and displays a new message bubble in the chat window
    function appendMessage(msg) {
        const placeholder = messagesArea.querySelector('.placeholder');
        if (placeholder) placeholder.remove();

        const msgBubble = document.createElement('div');
        msgBubble.className = 'message-bubble';
        msgBubble.dataset.messageId = msg._id;
        
        if (msg.repliedToMessageContent && msg.repliedToMessageId) {
        const quotedReply = document.createElement('div');
        quotedReply.className = 'quoted-reply';
        // --- هذا هو التعديل الأهم: إضافة data-reply-id ---
        quotedReply.dataset.replyId = msg.repliedToMessageId; 
        quotedReply.innerHTML = `
            <strong>${msg.repliedToMessageSender}</strong>
            <p class="mb-0 text-truncate">${msg.repliedToMessageContent}</p>
        `;
        msgBubble.appendChild(quotedReply);
        }

        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'message-content';

        if (msg.messageType === 'image') {
            contentWrapper.innerHTML = `<a href="${msg.content}" target="_blank"><img src="${msg.content}" style="max-width: 200px; border-radius: 8px; cursor: pointer;"></a>`;
        } else if (msg.messageType === 'document' || msg.messageType === 'raw') {
            // نستخدم المسار الجديد الخاص بنا للتحميل
            const downloadUrl = `/api/download/${msg._id}`;
            contentWrapper.innerHTML = `<a href="${downloadUrl}" target="_blank" class="text-decoration-none d-flex align-items-center"><i class="bi bi-file-earmark-text-fill fs-3 me-2"></i><span>${msg.filename || 'Download Document'}</span></a>`;
        } else {
            contentWrapper.textContent = msg.content;
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

    // Fetches and displays all messages for a selected conversation
    async function loadMessages(conversationId, convElement) {
        if (activeConversationId === conversationId) return;
        activeConversationId = conversationId;
        document.querySelectorAll('.list-group-item').forEach(el => el.classList.remove('active'));
        convElement.classList.add('active');

        const customerName = convElement.dataset.customerName;
        const firstLetter = customerName.charAt(0).toUpperCase();
        
        chatHeaderAvatar.textContent = firstLetter;
        chatHeaderAvatar.style.backgroundColor = generateHSLColor(customerName);
        chatHeaderName.textContent = customerName;
        chatHeaderContent.style.visibility = 'visible';

        messagesArea.innerHTML = '<p class="text-center text-muted">Loading...</p>';
        const response = await fetch(`/api/conversations/${conversationId}/messages`);
        const messages = await response.json();
        messagesArea.innerHTML = '';
        if (messages.length === 0) {
            messagesArea.innerHTML = '<div class="placeholder"><h4>No messages in this conversation.</h4></div>';
        } else {
            messages.forEach(msg => appendMessage(msg));
        }
        replyForm.classList.remove('d-none');
    }

    // Fetches and displays the list of conversations
    async function loadConversations() {
        if (!convListDiv) return; 
        try {
            const response = await fetch('/api/conversations');
            if (!response.ok) return;
            const conversations = await response.json();
            const activeConvId = document.querySelector('.list-group-item.active')?.dataset.id;
            convListDiv.innerHTML = '';

            conversations.forEach(conv => {
                const convItem = document.createElement('a');
                convItem.href = '#';
                convItem.className = 'list-group-item list-group-item-action';
                convItem.dataset.id = conv._id;
                const customerName = conv.customerName || 'Unknown';
                convItem.dataset.customerName = customerName;
                const firstLetter = customerName.charAt(0).toUpperCase();
                const relativeTime = formatRelativeTime(conv.lastMessageTimestamp);
                const lastMessageContent = conv.lastMessage || '...';
                const unreadBadge = conv.unreadCount > 0 ? `<span class="unread-badge ms-auto">${conv.unreadCount}</span>` : '';
                const avatarColor = generateHSLColor(customerName);

                convItem.innerHTML = `<div class="avatar me-3" style="background-color: ${avatarColor};"><span>${firstLetter}</span></div><div class="conv-item-details"><div class="d-flex w-100 justify-content-between"><span class="customer-name text-truncate">${customerName}</span><small class="text-nowrap text-muted">${relativeTime}</small></div><div class="d-flex align-items-center"><p class="last-message text-muted text-truncate mb-0 flex-grow-1">${lastMessageContent}</p>${unreadBadge}</div></div>`;
                if (conv._id === activeConvId) {
                    convItem.classList.add('active');
                }
                convItem.addEventListener('click', (e) => {
                    e.preventDefault();
                    loadMessages(conv._id, convItem);
                });
                convListDiv.appendChild(convItem);
            });
        } catch (error) {
            console.error("Failed to load conversations:", error);
        }
    }

    // Requests permission to show desktop notifications
    function requestNotificationPermission() {
        if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            Notification.requestPermission();
        }
    }

    // --- 3. EVENT LISTENERS ---
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            const messageEl = document.getElementById('loginMessage');
            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await response.json();
                if (response.ok && data.redirectUrl) {
                    window.location.href = data.redirectUrl;
                } else {
                    messageEl.textContent = data.message || 'Login failed.';
                }
            } catch (error) {
                messageEl.textContent = 'An error occurred.';
            }
        });
    }

    if (settingsForm) {
        settingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const messageEl = document.getElementById('formMessage');
            messageEl.textContent = 'Saving...';
            const accessToken = document.getElementById('accessToken').value;
            const phoneNumberId = document.getElementById('phoneNumberId').value;
            const verifyToken = document.getElementById('verifyToken').value;
            try {
                const response = await fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ accessToken, phoneNumberId, verifyToken })
                });
                const data = await response.json();
                messageEl.textContent = data.message;
                messageEl.style.color = response.ok ? 'green' : 'red';
            } catch (error) {
                messageEl.textContent = 'Failed to connect to server.';
                messageEl.style.color = 'red';
            }
        });
    }

    if (replyForm) {
        replyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const messageText = replyMessageInput.value;
            if (!messageText.trim() || !activeConversationId) return;
            try {
                const response = await fetch(`/api/conversations/${activeConversationId}/reply`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: messageText })
                });
                const data = await response.json();
                if (response.ok) {
                    appendMessage(data);
                    replyMessageInput.value = '';
                    replyMessageInput.focus();
                } else {
                    alert('Failed to send reply: ' + (data.message || 'Unknown error'));
                }
            } catch (error) {
                alert('An unexpected error occurred.');
            }
        });
    }

    if (attachBtn) {
        attachBtn.addEventListener('click', () => mediaUploadInput.click());
    }
    
    if (mediaUploadInput) {
        mediaUploadInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (!file || !activeConversationId) return;
            const formData = new FormData();
            formData.append('mediaFile', file);
            try {
                const response = await fetch(`/api/conversations/${activeConversationId}/send-media`, {
                    method: 'POST',
                    body: formData
                });
                if (response.ok) {
                    const sentMessage = await response.json();
                    appendMessage(sentMessage);
                } else {
                    const errorData = await response.json();
                    alert('Failed to send media: ' + (errorData.message || 'Unknown error'));
                }
            } catch (error) {
                console.error('Error uploading media:', error);
                alert('An error occurred during upload.');
            }
        });
    }

    if (generateTokenBtn) {
        generateTokenBtn.addEventListener('click', () => {
            document.getElementById('verifyToken').value = Math.random().toString(36).substring(2);
        });
    }

    if (conversationSearchInput) {
        conversationSearchInput.addEventListener('keyup', () => {
            const searchTerm = conversationSearchInput.value.toLowerCase();
            convListDiv.querySelectorAll('.list-group-item').forEach(conv => {
                const name = conv.dataset.customerName.toLowerCase();
                conv.style.display = name.includes(searchTerm) ? 'flex' : 'none';
            });
        });
    }

    messagesArea.addEventListener('click', (e) => {
    const quotedBox = e.target.closest('.quoted-reply');
    if (quotedBox) {
        const originalMessageId = quotedBox.dataset.replyId;
        const originalMessageBubble = document.querySelector(`.message-bubble[data-message-id="${originalMessageId}"]`);

        if (originalMessageBubble) {
            // Scroll to the original message
            originalMessageBubble.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Add a temporary flash effect to highlight it
            originalMessageBubble.classList.add('flash');
            setTimeout(() => {
                originalMessageBubble.classList.remove('flash');
            }, 1200); // Remove the flash after 1.2 seconds
        }
    }
});


    // --- 4. SOCKET.IO REAL-TIME LISTENERS ---
    socket.on('new_message', (message) => {
        loadConversations();
        notificationSound.play().catch(e => console.error("Error playing sound:", e));
        if (message.conversationId === activeConversationId) {
            appendMessage(message);
        }
    });

    socket.on('message_status_update', (data) => {
        const messageBubble = document.querySelector(`.message-bubble[data-message-id="${data.messageId}"]`);
        if (messageBubble) {
            const statusTicks = messageBubble.querySelector('.status-ticks');
            if (statusTicks) {
                statusTicks.dataset.status = data.status;
            }
        }
    });

    socket.on('conversation_updated', () => {
        loadConversations();
    });

    // --- 5. INITIAL PAGE LOAD ---
    if (document.getElementById('conv-list')) {
        loadConversations();
        requestNotificationPermission();
    }
});