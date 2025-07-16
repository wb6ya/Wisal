document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selectors & Initial State ---
    const convListDiv = document.getElementById('conv-list');
    const messagesArea = document.querySelector('.messages-area');
    const replyForm = document.getElementById('replyForm');
    const replyMessageInput = document.getElementById('replyMessage');
    const chatHeaderContent = document.getElementById('chat-header-content');
    const chatHeaderAvatar = document.getElementById('chat-header-avatar');
    const chatHeaderName = document.getElementById('chat-header-name');
    const attachBtn = document.getElementById('attachBtn');
    const imageUploadInput = document.getElementById('imageUpload');
    const settingsForm = document.getElementById('settingsForm');
    const generateTokenBtn = document.getElementById('generateTokenBtn');
    const loginForm = document.getElementById('loginForm'); // For login page

    const socket = io();
    const notificationSound = new Audio('/sounds/notification.mp3');
    let activeConversationId = null;

    // --- Helper Function to create a message bubble ---
    function appendMessage(msg) {
        const placeholder = messagesArea.querySelector('.d-flex.h-100');
        if (placeholder) placeholder.remove();

        const msgBubble = document.createElement('div');
        msgBubble.className = 'message-bubble';
        msgBubble.dataset.messageId = msg._id;

        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'message-content';

        if (msg.messageType === 'image') {
            contentWrapper.innerHTML = `<a href="${msg.content}" target="_blank"><img src="${msg.content}" style="max-width: 200px; border-radius: 8px; cursor: pointer;"></a>`;
        } else if (msg.messageType === 'document') {
            contentWrapper.innerHTML = `<a href="${msg.content}" download="${msg.filename || 'document'}" target="_blank" class="text-decoration-none d-flex align-items-center"><i class="bi bi-file-earmark-text-fill fs-3 me-2"></i><span>${msg.filename || 'Download Document'}</span></a>`;
        } else {
            contentWrapper.textContent = msg.content;
        }
        
        if (msg.sender === 'agent') {
            const metaContainer = document.createElement('div');
            metaContainer.className = 'message-meta-container';
            metaContainer.innerHTML = `<span class="status-ticks" data-status="${msg.status}">✓</span>`;
            contentWrapper.appendChild(metaContainer);
        }

        const timestamp = new Date(msg.createdAt);
        const formattedTime = timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const timestampEl = document.createElement('div');
        timestampEl.className = 'timestamp';
        timestampEl.textContent = formattedTime;

        msgBubble.appendChild(contentWrapper);
        msgBubble.appendChild(timestampEl);
        msgBubble.classList.add(msg.sender === 'customer' ? 'customer-message' : 'agent-message');
        messagesArea.prepend(msgBubble);
    }

    // --- Function to load messages for a conversation ---
    async function loadMessages(conversationId, convElement) {
        if (activeConversationId === conversationId) return;
        activeConversationId = conversationId;
        document.querySelectorAll('.list-group-item').forEach(el => el.classList.remove('active'));
        convElement.classList.add('active');

        const customerName = convElement.dataset.customerName;
        const firstLetter = customerName.charAt(0).toUpperCase();
        
        chatHeaderAvatar.textContent = firstLetter;
        chatHeaderName.textContent = customerName;
        chatHeaderContent.style.visibility = 'visible';

        messagesArea.innerHTML = '<p class="text-center text-muted">Loading...</p>';
        const response = await fetch(`/api/conversations/${conversationId}/messages`);
        const messages = await response.json();
        messagesArea.innerHTML = '';
        if (messages.length === 0) {
            messagesArea.innerHTML = '<div class="d-flex h-100 justify-content-center align-items-center"><h4 class="text-muted">No messages</h4></div>';
        } else {
            messages.forEach(msg => appendMessage(msg));
        }
        replyForm.classList.remove('d-none');
    }

    // --- Function to load the conversation list ---
    async function loadConversations() {
        // Ensure this only runs on the dashboard page
        if (!convListDiv) return; 
        try {
            const response = await fetch('/api/conversations');
            if (!response.ok) return;
            const conversations = await response.json();
            convListDiv.innerHTML = '';

            conversations.forEach(conv => {
                const convItem = document.createElement('a');
                convItem.href = '#';
                convItem.className = 'list-group-item list-group-item-action';
                convItem.dataset.id = conv._id;
                const customerName = conv.customerName || 'Unknown';
                convItem.dataset.customerName = customerName;
                const firstLetter = customerName.charAt(0).toUpperCase();

                convItem.innerHTML = `<div class="avatar" style="background-color: #6c757d;">${firstLetter}</div><div class="flex-grow-1"><h5 class="mb-1">${customerName}</h5><p class="mb-1 text-muted">${conv.customerPhone}</p></div>`;
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

    function requestNotificationPermission() {
        if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            Notification.requestPermission();
        }
    }

    // --- EVENT LISTENERS (with checks to prevent errors) ---
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
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
// --- EVENT LISTENERS ---

if (settingsForm) {
    settingsForm.addEventListener('submit', async function(e) {
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
    replyForm.addEventListener('submit', async function(e) {
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
                if (response.status === 401 && data.redirectTo) {
                    alert(data.message);
                    window.location.href = data.redirectTo;
                } else {
                    alert('Failed to send reply: ' + data.message);
                }
            }
        } catch (error) {
            alert('An unexpected error occurred.');
        }
    });
}

if (attachBtn) {
    attachBtn.addEventListener('click', () => imageUploadInput.click());
}

if (imageUploadInput) {
    imageUploadInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file || !activeConversationId) return;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', 'whatsapp_files'); // تأكد من أن هذا الاسم صحيح

        alert('Uploading media...');

        try {
            // --- الخطوة أ: الرفع إلى Cloudinary ---
            console.log("Attempting to upload to Cloudinary...");
            const cloudName = document.body.dataset.cloudName;
            if (!cloudName) {
                throw new Error("Cloudinary cloud name is not available!");
            }

            const resourceType = file.type.startsWith('image/') ? 'image' : 'raw';
            const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

            const cloudinaryResponse = await fetch(cloudinaryUrl, {
                method: 'POST',
                body: formData
            });

            const cloudinaryData = await cloudinaryResponse.json();
            if (!cloudinaryResponse.ok || !cloudinaryData.secure_url) {
                // اطبع الخطأ من Cloudinary بالتفصيل
                console.error("Cloudinary Upload Failed:", cloudinaryData);
                throw new Error('Cloudinary upload failed.');
            }

            console.log("Cloudinary Upload Successful. URL:", cloudinaryData.secure_url);
            const mediaUrl = cloudinaryData.secure_url;

            // --- الخطوة ب: إرسال الرابط إلى خادمنا ---
            console.log("Sending media URL to our server...");
            const endpoint = resourceType === 'image' ? `/api/conversations/${activeConversationId}/send-image` : `/api/conversations/${activeConversationId}/send-document`;

            const serverResponse = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageUrl: mediaUrl, filename: file.name })
            });

            if (!serverResponse.ok) {
                // اطبع الخطأ من خادمنا بالتفصيل
                const errorData = await serverResponse.json();
                console.error("Server responded with an error:", errorData);
                throw new Error(errorData.message || 'Failed to send media via WhatsApp.');
            }

            const sentMessage = await serverResponse.json();
            appendMessage(sentMessage);

        } catch (error) {
            console.error('--- DETAILED ERROR ---', error);
            alert(`An error occurred: ${error.message}`);
        }
    });
}

if (generateTokenBtn) {
    generateTokenBtn.addEventListener('click', function() {
        const randomString = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        document.getElementById('verifyToken').value = randomString;
    });
}

// --- INITIAL PAGE LOAD ---
window.addEventListener('load', () => {
    loadConversations();
    requestNotificationPermission();
});
})