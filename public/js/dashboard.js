/**
 * Filename: dashboard.js
 * Description: The complete client-side logic for the WhatsApp SaaS dashboard.
 * This file handles all UI interactions, real-time events via Socket.IO, and API calls.
 * Author: Google Gemini (Senior Software Engineer & UI/UX Designer)
 * Version: Final & Refactored
 */
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
    const newChatForm = document.getElementById('newChatForm');
    const conversationSearchInput = document.getElementById('conversationSearch');
    const searchBtn = document.getElementById('searchBtn');
    const conversationSearchContainer = document.getElementById('conversationSearchContainer');
    const replyPreviewContainer = document.getElementById('replyPreview');
    const replyPreviewContent = document.getElementById('replyPreviewContent');
    const closeReplyPreviewBtn = document.getElementById('closeReplyPreview');
    const chatHeaderPhone = document.getElementById('chat-header-phone');
    const searchIcon = document.getElementById('searchIcon');
    const messageSearchContainer = document.getElementById('messageSearchContainer');
    const messageSearchInput = document.getElementById('messageSearchInput');
    const closeSearchBtn = document.getElementById('closeSearchBtn');
    const notesBtn = document.getElementById('notesBtn');
    const customerNotesTextarea = document.getElementById('customerNotes');
    const saveNotesBtn = document.getElementById('saveNotesBtn');
    const notesStatus = document.getElementById('notesStatus');
    const employeesModal = document.getElementById('employeesModal');
    const addEmployeeForm = document.getElementById('addEmployeeForm');
    const employeesTableBody = document.getElementById('employeesTableBody');

    // --- Socket.IO & State Initialization ---
    const socket = io();
    const notificationSound = new Audio('/sounds/notification.mp3');
    let activeConversationId = null;
    let messageToReplyToId = null;
    let searchMatches = [];
    let currentMatchIndex = -1;

    // --- 2. Helper Functions ---

        async function loadEmployees() {
        if (!employeesTableBody) return;
        try {
            const response = await fetch('/api/employees');
            const employees = await response.json();
            employeesTableBody.innerHTML = '';
            employees.forEach(emp => {
                const row = `
                    <tr>
                        <td>${emp.name}</td>
                        <td>${emp.email}</td>
                        <td><button class="btn btn-sm btn-outline-danger" data-id="${emp._id}">حذف</button></td>
                    </tr>
                `;
                employeesTableBody.insertAdjacentHTML('beforeend', row);
            });
        } catch (error) {
            console.error('Failed to load employees:', error);
        }
    }

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
        return new Date(dateString).toLocaleDateString('ar-EG');
    }
    
    function generateHSLColor(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = hash % 360;
        return `hsl(${h}, 50%, 60%)`;
    }

    function appendMessage(msg) {
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
        case 'sticker': // Treat stickers as images
            contentWrapper.innerHTML = `<a href="${msg.content}" target="_blank"><img src="${msg.content}" style="max-width: 250px; border-radius: 8px; cursor: pointer;"></a>`;
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
        default: // text
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

    async function loadMessages(conversationId, convElement) {
        if (activeConversationId === conversationId) return;
        activeConversationId = conversationId;
        document.querySelectorAll('.list-group-item').forEach(el => el.classList.remove('active'));
        convElement.classList.add('active');

        const customerName = convElement.dataset.customerName;
        const customerPhone = convElement.dataset.customerPhone;
        const firstLetter = customerName.charAt(0).toUpperCase();
        
        chatHeaderAvatar.textContent = firstLetter;
        chatHeaderAvatar.style.backgroundColor = generateHSLColor(customerName);
        chatHeaderName.textContent = customerName;
        if(chatHeaderPhone) chatHeaderPhone.textContent = customerPhone;
        chatHeaderContent.style.visibility = 'visible';

        messagesArea.innerHTML = '<p class="text-center text-muted">Loading...</p>';
        try {
            const messages = await fetch(`/api/conversations/${conversationId}/messages`).then(res => res.json());
            messagesArea.innerHTML = '';
            if (messages.length === 0) {
                messagesArea.innerHTML = '<div class="placeholder"><h4>No messages in this conversation.</h4></div>';
            } else {
                messages.forEach(msg => appendMessage(msg));
            }
            replyForm.classList.remove('d-none');
        } catch (error) {
            messagesArea.innerHTML = '<div class="placeholder"><h4>Failed to load messages.</h4></div>';
        }
        try {
            const notesResponse = await fetch(`/api/conversations/${conversationId}/notes`);
            const data = await notesResponse.json();
            customerNotesTextarea.value = data.notes || '';
        } catch (error) {
            console.error("Failed to load notes:", error);
        }
    }

    async function loadConversations() {
        if (!convListDiv) return; 
        try {
            const conversations = await fetch('/api/conversations').then(res => res.json());
            const activeConvId = document.querySelector('.list-group-item.active')?.dataset.id;
            convListDiv.innerHTML = '';

            conversations.forEach(conv => {
                const convItem = document.createElement('a');
                convItem.href = '#';
                convItem.className = 'list-group-item list-group-item-action';
                convItem.dataset.id = conv._id;
                const customerName = conv.customerName || 'Unknown';
                convItem.dataset.customerName = customerName;
                convItem.dataset.customerPhone = conv.customerPhone;
                const firstLetter = customerName.charAt(0).toUpperCase();
                const relativeTime = formatRelativeTime(conv.lastMessageTimestamp);
                const lastMessageContent = conv.lastMessage || '...';
                const unreadBadge = conv.unreadCount > 0 ? `<span class="unread-badge ms-auto">${conv.unreadCount}</span>` : '';
                const avatarColor = generateHSLColor(customerName);
                const statusIndicator = `<div class="status-indicator status-${conv.status}" title="الحالة: ${conv.status}"></div>`;

                convItem.innerHTML = `
                    <div class="d-flex align-items-center">
                        ${statusIndicator}
                        <div class="avatar me-3" style="background-color: ${avatarColor};">
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
                    body: JSON.stringify({ message: messageText, contextMessageId: messageToReplyToId })
                });
                if (response.ok) {
                    // The message will be appended via the 'new_message' socket event.
                    // This prevents the message from appearing twice.
                    replyMessageInput.value = '';
                    if(replyPreviewContainer) replyPreviewContainer.classList.add('d-none');
                    messageToReplyToId = null;
                } else {
                    const data = await response.json();
                    alert('Failed to send reply: ' + (data.message || 'Unknown error'));
                }
            } catch (error) {
                console.error("Error sending reply:", error);
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
                    // The message will be appended via the 'new_message' socket event.
                    // This prevents the media message from appearing twice.
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

    if (newChatForm) {
        newChatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const customerPhone = document.getElementById('customerPhoneInput').value;
            const templateName = document.getElementById('templateNameInput').value;
            try {
                const response = await fetch('/api/conversations/initiate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ customerPhone, templateName })
                });
                if (response.ok) {
                    alert('Template message sent successfully!');
                    const modal = bootstrap.Modal.getInstance(document.getElementById('newChatModal'));
                    if(modal) modal.hide();
                } else {
                    const errorData = await response.json();
                    alert('Failed to send template: ' + errorData.message);
                }
            } catch (error) {
                alert('An error occurred.');
            }
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

    if(searchBtn) {
        searchBtn.addEventListener('click', () => {
            if(conversationSearchContainer) {
                const isHidden = conversationSearchContainer.style.display === 'none';
                conversationSearchContainer.style.display = isHidden ? 'block' : 'none';
                if(isHidden) conversationSearchInput.focus();
            }
        });
    }

    if (searchIcon) {
        searchIcon.addEventListener('click', () => {
            if(messageSearchContainer) {
                messageSearchContainer.classList.toggle('d-none');
                if (!messageSearchContainer.classList.contains('d-none')) {
                    messageSearchInput.focus();
                }
            }
        });
    }

    if (closeSearchBtn) {
        closeSearchBtn.addEventListener('click', () => {
            if(messageSearchContainer) {
                messageSearchContainer.classList.add('d-none');
                messageSearchInput.value = '';
                document.querySelectorAll('.message-bubble.highlight').forEach(el => {
                    el.classList.remove('highlight', 'active-match');
                });
                searchMatches = [];
                currentMatchIndex = -1;
                if(searchMatchCounter) searchMatchCounter.textContent = '';
            }
        });
    }

    if (messageSearchInput) {
        messageSearchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                executeSearch();
            }
        });
    }

    function executeSearch() {
        const searchTerm = messageSearchInput.value.toLowerCase();
        searchMatches = [];
        currentMatchIndex = -1;
        document.querySelectorAll('.message-bubble.highlight, .message-bubble.active-match').forEach(el => el.classList.remove('highlight', 'active-match'));

        if (searchTerm.length < 2) {
            if(searchMatchCounter) searchMatchCounter.textContent = '';
            return;
        }

        const allMessages = messagesArea.querySelectorAll('.message-bubble');
        allMessages.forEach(bubble => {
            const contentWrapper = bubble.querySelector('.message-content');
            if (contentWrapper && contentWrapper.textContent.toLowerCase().includes(searchTerm)) {
                bubble.classList.add('highlight');
                searchMatches.push(bubble);
            }
        });

        if (searchMatches.length > 0) {
            currentMatchIndex = 0;
            updateSearchUI();
        } else {
            if(searchMatchCounter) searchMatchCounter.textContent = '0/0';
        }
    }

    function updateSearchUI() {
        document.querySelectorAll('.message-bubble.active-match').forEach(el => el.classList.remove('active-match'));
        if (currentMatchIndex !== -1) {
            const activeMatch = searchMatches[currentMatchIndex];
            activeMatch.classList.add('active-match');
            activeMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if(searchMatchCounter) searchMatchCounter.textContent = `${currentMatchIndex + 1}/${searchMatches.length}`;
        }
    }

    if(searchNextBtn) {
        searchNextBtn.addEventListener('click', () => {
            if(searchMatches.length === 0) return;
            currentMatchIndex = (currentMatchIndex + 1) % searchMatches.length;
            updateSearchUI();
        });
    }

    if(searchPrevBtn) {
        searchPrevBtn.addEventListener('click', () => {
            if(searchMatches.length === 0) return;
            currentMatchIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
            updateSearchUI();
        });
    }

    if (notesBtn) {
        notesBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!activeConversationId) return alert('Please select a conversation first.');
            
            try {
                const response = await fetch(`/api/conversations/${activeConversationId}/notes`);
                const data = await response.json();
                customerNotesTextarea.value = data.notes || '';
                notesStatus.textContent = '';
            } catch (error) {
                console.error("Failed to load notes:", error);
                notesStatus.textContent = 'Failed to load notes.';
            }
        });
    }

    if (saveNotesBtn) {
        saveNotesBtn.addEventListener('click', async () => {
            if (!activeConversationId) return;
            const notes = customerNotesTextarea.value;
            notesStatus.textContent = 'Saving...';
            try {
                const response = await fetch(`/api/conversations/${activeConversationId}/notes`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ notes })
                });
                if (response.ok) {
                    notesStatus.textContent = 'Notes saved successfully!';
     
                    setTimeout(() => { notesStatus.textContent = ''; }, 2000);
                } else {
                    notesStatus.textContent = 'Failed to save notes.';
                }
            } catch (error) {
                notesStatus.textContent = 'Connection error.';
            }
        });
    }

        // A smart listener for clicks on the entire message area
        if (messagesArea) {
            messagesArea.addEventListener('click', (e) => {
                // Check if the user clicked on a quoted reply box
                const quotedBox = e.target.closest('.quoted-reply');
                if (quotedBox) {
                    const originalMessageId = quotedBox.dataset.replyId;
                    const originalMessageBubble = document.querySelector(`.message-bubble[data-message-id="${originalMessageId}"]`);
                    
                    if (originalMessageBubble) {
                        // If the original message is found, scroll to it smoothly
                        originalMessageBubble.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        
                        // Add a temporary "flash" effect to highlight it
                        originalMessageBubble.classList.add('flash');
                        setTimeout(() => {
                            originalMessageBubble.classList.remove('flash');
                        }, 1200); // Remove the flash after 1.2 seconds
                    }
                }
            });
        }

        document.body.addEventListener('click', async (e) => {
            if (e.target.matches('.status-change-item')) {
                e.preventDefault();
                if (!activeConversationId) return;

                const newStatus = e.target.dataset.status;
                
                try {
                    await fetch(`/api/conversations/${activeConversationId}/status`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: newStatus })
                    });
                    // الواجهة ستتحدث تلقائيًا بفضل Socket.IO
                } catch (error) {
                    alert('Failed to update status.');
                }
            }
        });

            if (employeesModal) {
        employeesModal.addEventListener('shown.bs.modal', () => {
            loadEmployees(); // تحميل قائمة الموظفين عند فتح النافذة
        });
    }

    // NEW: Listener for Add Employee Form
    if (addEmployeeForm) {
        addEmployeeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('employeeName').value;
            const email = document.getElementById('employeeEmail').value;
            const password = document.getElementById('employeePassword').value;
            
            try {
                const response = await fetch('/api/employees', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, password })
                });
                if (response.ok) {
                    loadEmployees(); // إعادة تحميل القائمة
                    addEmployeeForm.reset();
                } else {
                    const errorData = await response.json();
                    alert('فشل إضافة الموظف: ' + errorData.message);
                }
            } catch (error) {
                alert('حدث خطأ.');
            }
        });
    }

    // NEW: Listener for Deleting Employees
    if (employeesTableBody) {
        employeesTableBody.addEventListener('click', async (e) => {
            if (e.target.classList.contains('btn-outline-danger')) {
                const employeeId = e.target.dataset.id;
                if (confirm('هل أنت متأكد من حذف هذا الموظف؟')) {
                    await fetch(`/api/employees/${employeeId}`, { method: 'DELETE' });
                    loadEmployees(); // إعادة تحميل القائمة
                }
            }
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