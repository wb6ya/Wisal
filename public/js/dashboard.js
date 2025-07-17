document.addEventListener('DOMContentLoaded', () => {
    // --- 1. Element Selectors & Initial State ---
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
    const searchInput = document.getElementById('conversationSearch');
    const searchIcon = document.getElementById('searchIcon');
    const messageSearchContainer = document.getElementById('messageSearchContainer');
    const messageSearchInput = document.getElementById('messageSearchInput');
    const closeSearchBtn = document.getElementById('closeSearchBtn');

    // --- Socket.IO & Sound Initialization ---
    const socket = io();
    const notificationSound = new Audio('/sounds/notification.mp3');
    let activeConversationId = null;

    // --- 2. Helper Functions ---
    function formatRelativeTime(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.round((now - date) / 1000);
        if (seconds < 60) return `الآن`;
        const minutes = Math.round(seconds / 60);
        if (minutes < 60) return `منذ ${minutes} دقيقة`;
        const hours = Math.round(minutes / 60);
        if (hours < 24) return `منذ ${hours} ساعة`;
        return new Date(dateString).toLocaleDateString();
    }

    function generateHSLColor(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = hash % 360;
        return `hsl(${h}, 50%, 60%)`; // Hue, Saturation, Lightness
    }

    function generateHSLColor(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = hash % 360;
        return `hsl(${h}, 50%, 60%)`; // Hue, Saturation, Lightness
    }

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
        } else if (msg.messageType === 'document' || msg.messageType === 'raw') {
            contentWrapper.innerHTML = `<a href="${msg.content}" download="${msg.filename || 'document'}" target="_blank" class="text-decoration-none d-flex align-items-center"><i class="bi bi-file-earmark-text-fill fs-3 me-2"></i><span>${msg.filename || 'Download Document'}</span></a>`;
        } else {
            contentWrapper.textContent = msg.content;
        }
        
        const timestamp = new Date(msg.createdAt);
        const formattedTime = timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
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

   // In public/js/dashboard.js
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
                convItem.className = 'list-group-item list-group-item-action d-flex align-items-start p-3';
                convItem.dataset.id = conv._id;
                
                const customerName = conv.customerName || 'Unknown';
                convItem.dataset.customerName = customerName;
                const firstLetter = customerName.charAt(0).toUpperCase();
                
                const relativeTime = formatRelativeTime(conv.lastMessageTimestamp);
                const lastMessageContent = conv.lastMessage || '...';
                
                // --- هذا هو الكود الجديد لإنشاء الشارة ---
                const unreadBadge = conv.unreadCount > 0 ? `<span class="unread-badge ms-auto">${conv.unreadCount}</span>` : '';

                // الهيكل الجديد الذي يتضمن الشارة
                convItem.innerHTML = `
                    <div class="avatar me-3" style="background-color: ${generateHSLColor(customerName)};">
                        <span>${firstLetter}</span>
                    </div>
                    <div class="conv-item-details">
                        <div class="d-flex w-100 justify-content-between">
                            <span class="customer-name text-truncate">${customerName}</span>
                            <small class="text-nowrap text-muted">${relativeTime}</small>
                        </div>
                        <div class="d-flex align-items-center">
                            <p class="last-message text-muted text-truncate mb-0 flex-grow-1">${lastMessageContent}</p>
                            ${unreadBadge}
                        </div>
                    </div>
                `;
                
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

    function requestNotificationPermission() {
        if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            Notification.requestPermission();
        }
    }

    // --- 3. EVENT LISTENERS ---
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
        generateTokenBtn.addEventListener('click', function() {
            const randomString = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            document.getElementById('verifyToken').value = randomString;
        });
    }
    
    if (searchInput) {
        searchInput.addEventListener('keyup', () => {
            const searchTerm = searchInput.value.toLowerCase();
            const conversations = convListDiv.querySelectorAll('.list-group-item');

            conversations.forEach(conv => {
                const customerName = conv.dataset.customerName.toLowerCase();
                if (customerName.includes(searchTerm)) {
                    conv.style.display = 'flex';
                } else {
                    conv.style.display = 'none';
                }
            });
        });
    }

    if (closeSearchBtn) {
        closeSearchBtn.addEventListener('click', () => {
            messageSearchContainer.classList.add('d-none');
            messageSearchInput.value = '';
            document.querySelectorAll('.message-bubble.highlight').forEach(el => {
                el.classList.remove('highlight');
            });
        });
    }

    if (messageSearchInput) {
        messageSearchInput.addEventListener('keyup', () => {
            const searchTerm = messageSearchInput.value.toLowerCase();
            document.querySelectorAll('.message-bubble.highlight').forEach(el => {
                el.classList.remove('highlight');
            });
            if (searchTerm.length < 2) return;
            const allMessages = messagesArea.querySelectorAll('.message-bubble');
            allMessages.forEach(bubble => {
                const messageText = bubble.querySelector('.message-content').textContent.toLowerCase();
                if (messageText.includes(searchTerm)) {
                    bubble.classList.add('highlight');
                }
            });
        });
    }

    document.body.addEventListener('click', function(e) {
        document.querySelectorAll('.message-dropdown').forEach(menu => {
            if (menu.style.display === 'block' && !menu.contains(e.target) && !e.target.closest('.message-options')) {
                menu.style.display = 'none';
            }
        });
        if (e.target.closest('.message-options')) {
            const optionsDiv = e.target.closest('.message-options');
            const dropdown = optionsDiv.nextElementSibling;
            dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
        }
        if (e.target.matches('.dropdown-item')) {
            const action = e.target.dataset.action;
            const messageBubble = e.target.closest('.message-bubble');
            const contentWrapper = messageBubble.querySelector('.message-content');
            if (action === 'copy') {
                navigator.clipboard.writeText(contentWrapper.textContent.trim())
                    .then(() => alert('تم نسخ النص!'))
                    .catch(err => console.error('Failed to copy: ', err));
            }
            e.target.closest('.message-dropdown').style.display = 'none';
        }
    });

    if (searchIcon) {
        searchIcon.addEventListener('click', () => {
            messageSearchContainer.classList.remove('d-none');
            messageSearchInput.focus();
        });
    }

    if (closeSearchBtn) {
        closeSearchBtn.addEventListener('click', () => {
            messageSearchContainer.classList.add('d-none');
            messageSearchInput.value = '';
            // إزالة التمييز من كل الرسائل
            document.querySelectorAll('.message-bubble.highlight').forEach(el => {
                el.classList.remove('highlight');
            });
        });
    }

    if (messageSearchInput) {
        messageSearchInput.addEventListener('keyup', () => {
            const searchTerm = messageSearchInput.value.toLowerCase();
            
            document.querySelectorAll('.message-bubble.highlight').forEach(el => {
                el.classList.remove('highlight');
            });

            if (searchTerm.length < 2) {
                return; // لا تبدأ البحث إلا بعد كتابة حرفين على الأقل
            }

            const allMessages = messagesArea.querySelectorAll('.message-bubble');
            allMessages.forEach(bubble => {
                const contentWrapper = bubble.querySelector('.message-content');
                if (contentWrapper) {
                    const messageText = contentWrapper.textContent.toLowerCase();
                    if (messageText.includes(searchTerm)) {
                        bubble.classList.add('highlight'); // تمييز الرسالة المطابقة
                    }
                }
            });
        });
    }

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