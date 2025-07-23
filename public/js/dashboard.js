alert("This is the correct dashboard.js file!");
document.addEventListener('DOMContentLoaded', () => {

    // --- 1. Element Selectors & Initial State ---
    const convListDiv = document.getElementById('conv-list');
    const messagesArea = document.querySelector('.messages-area');
    const replyForm = document.getElementById('replyForm');
    const replyMessageInput = document.getElementById('replyMessage');
    const replyButton = document.getElementById('replyButton');
    const chatHeaderContent = document.getElementById('chat-header-content');
    const chatHeaderAvatar = document.getElementById('chat-header-avatar');
    const chatHeaderName = document.getElementById('chat-header-name');
    const chatHeaderPhone = document.getElementById('chat-header-phone');
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
    const searchIcon = document.getElementById('searchIcon');
    const messageSearchContainer = document.getElementById('messageSearchContainer');
    const messageSearchInput = document.getElementById('messageSearchInput');
    const closeSearchBtn = document.getElementById('closeSearchBtn');
    const searchNextBtn = document.getElementById('searchNextBtn');
    const searchPrevBtn = document.getElementById('searchPrevBtn');
    const searchMatchCounter = document.getElementById('searchMatchCounter');
    const notesBtn = document.getElementById('notesBtn');
    const customerNotesTextarea = document.getElementById('customerNotes');
    const saveNotesBtn = document.getElementById('saveNotesBtn');
    const notesStatus = document.getElementById('notesStatus');
    const employeesModal = document.getElementById('employeesModal');
    const addEmployeeForm = document.getElementById('addEmployeeForm');
    const employeesTableBody = document.getElementById('employeesTableBody');
    const welcomeEnabled = document.getElementById('welcomeEnabled');
    const welcomeTypeText = document.getElementById('welcomeTypeText');
    const welcomeTypeInteractive = document.getElementById('welcomeTypeInteractive');
    const welcomeText = document.getElementById('welcomeText');
    const welcomeButtonsContainer = document.getElementById('welcomeButtonsContainer');
    const welcomeButton1 = document.getElementById('welcomeButton1');
    const welcomeButton2 = document.getElementById('welcomeButton2');
    const welcomeButton3 = document.getElementById('welcomeButton3');

    // --- Socket.IO & State Initialization ---
    const socket = io();
    const notificationSound = new Audio('/sounds/notification.mp3');
    let activeConversationId = null;
    let messageToReplyToId = null;
    let searchMatches = [];
    let currentMatchIndex = -1;
    let currentPage = 1;
    let isLoadingMessages = false;
    let allMessagesLoaded = false;

    // --- 2. Helper Functions ---
    function formatRelativeTime(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.round((now - date) / 1000);
        const minutes = Math.round(seconds / 60);
        const hours = Math.round(minutes / 60);
        if (seconds < 60) return `الآن`;
        if (minutes < 60) return `منذ ${minutes} دقيقة`;
        if (hours < 24) return `منذ ${hours} ساعة`;
        return new Date(dateString).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
    }
    
    function generateHSLColor(str) {
        if (!str) return 'hsl(210, 50%, 60%)';
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = hash % 360;
        return `hsl(${h}, 50%, 60%)`;
    }

    function isUserNearBottom() {
        const threshold = 150;
        return messagesArea.scrollTop + messagesArea.clientHeight >= messagesArea.scrollHeight - threshold;
    }

    function scrollToBottom() {
        messagesArea.scrollTop = messagesArea.scrollHeight;
    }

    // --- 3. Core Application Logic ---
    function appendMessage(msg, isPrepending) {
        if (document.querySelector(`.message-bubble[data-message-id="${msg._id}"]`)) return;

        const placeholder = messagesArea.querySelector('.placeholder');
        if (placeholder) placeholder.remove();

        const msgBubble = document.createElement('div');
        msgBubble.className = 'message-bubble';
        msgBubble.dataset.messageId = msg._id;
        
        let replyHTML = '';
        if (msg.repliedToMessageContent) {
            replyHTML = `<div class="quoted-reply" data-reply-id="${msg.repliedToMessageId}"><strong>${msg.repliedToMessageSender}</strong><p class="mb-0 text-truncate">${msg.repliedToMessageContent}</p></div>`;
        }
        let contentHTML = '';
        switch (msg.messageType) {
            case 'image': case 'sticker':
                contentHTML = `<a href="${msg.content}" target="_blank"><img src="${msg.content}" class="message-media-img"></a>`; break;
            case 'video':
                contentHTML = `<div class="message-media-video-wrapper"><video controls src="${msg.content}" class="message-media-video"></video></div>`; break;
            case 'audio':
                contentHTML = `<audio controls src="${msg.content}" class="message-media-audio"></audio>`; break;
            case 'document': case 'raw':
                contentHTML = `<a href="/api/download/${msg._id}" target="_blank" class="text-decoration-none d-flex align-items-center"><i class="bi bi-file-earmark-text-fill fs-3 me-2"></i><span>${msg.filename || 'Download File'}</span></a>`; break;
            default:
                contentHTML = document.createTextNode(msg.content).textContent; break;
        }
        const formattedTime = new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        let statusTicksHTML = '';
        if (msg.sender === 'agent') {
            statusTicksHTML = `<span class="status-ticks" data-status="${msg.status}">✓</span>`;
        }
        msgBubble.innerHTML = `${replyHTML}<div class="message-content">${contentHTML}</div><div class="timestamp">${formattedTime}${statusTicksHTML}</div>`;
        msgBubble.classList.add(msg.sender === 'customer' ? 'customer-message' : 'agent-message');
        
        if (isPrepending) {
            // Adds the new message to the TOP of the chat area
            messagesArea.prepend(msgBubble);
        } else {
            // Adds the new message to the BOTTOM of the chat area
            messagesArea.appendChild(msgBubble);
        }
    }

    async function loadMessages(conversationId) {
        if (isLoadingMessages || allMessagesLoaded) return;
        isLoadingMessages = true;

        const loadMoreContainer = messagesArea.querySelector('.load-more-container');
        const spinner = loadMoreContainer?.querySelector('.spinner-border');
        if (spinner) spinner.style.display = 'block';

        try {
            const response = await fetch(`/api/conversations/${conversationId}/messages?page=${currentPage}`);
            if (!response.ok) throw new Error("Failed to fetch messages");
            
            const messages = await response.json();

            if (conversationId !== activeConversationId) {
                console.log("Stale messages loaded. Discarding.");
                return; 
            }

            
            if (messages.length > 0) {
                const previousScrollHeight = messagesArea.scrollHeight;
                const placeholder = messagesArea.querySelector('.placeholder');
                if (placeholder) placeholder.remove();

                // --- هذا هو المنطق الجديد والمهم ---
                if (currentPage === 1) {
                    // للصفحة الأولى: اعكس الترتيب وأضف الرسائل في الأسفل (append)
                    messages.reverse().forEach(msg => appendMessage(msg, false)); // "false" = append
                } else {
                    // للصفحات القديمة: اعكس الترتيب وأضف الرسائل في الأعلى (prepend)
                    messages.reverse().forEach(msg => appendMessage(msg, true)); // "true" = prepend
                    
                    // حافظ على مكان التمرير فقط عند تحميل الرسائل القديمة
                    messagesArea.scrollTop = messagesArea.scrollHeight - previousScrollHeight;
                }
                
                currentPage++;
            } else {
                allMessagesLoaded = true;
                if (loadMoreContainer) loadMoreContainer.style.display = 'none';
            }
        } catch (error) {
            console.error("Error loading messages:", error);
            if (loadMoreContainer) loadMoreContainer.innerHTML = `<span class="text-danger">Failed to load</span>`;
        } finally {
            isLoadingMessages = false;
            if (spinner) spinner.style.display = 'none';
        }
    }

    async function initializeConversation(conversationId, convElement) {
        activeConversationId = conversationId;
        currentPage = 1;
        isLoadingMessages = false;
        allMessagesLoaded = false;
        messageToReplyToId = null;

        document.querySelectorAll('.list-group-item').forEach(el => el.classList.remove('active'));
        convElement.classList.add('active');
        
        const customerName = convElement.dataset.customerName;
        const customerPhone = convElement.dataset.customerPhone;
        const firstLetter = customerName ? customerName.charAt(0).toUpperCase() : '#';
        
        if(chatHeaderAvatar) chatHeaderAvatar.textContent = firstLetter;
        if(chatHeaderAvatar) chatHeaderAvatar.style.backgroundColor = generateHSLColor(customerName);
        if(chatHeaderName) chatHeaderName.textContent = customerName;
        if(chatHeaderPhone) chatHeaderPhone.textContent = customerPhone;
        if(chatHeaderContent) chatHeaderContent.style.visibility = 'visible';
        
        messagesArea.innerHTML = `
            <div class="load-more-container text-center py-3">
                <div class="spinner-border spinner-border-sm text-secondary" style="display: none;"></div>
            </div>
            <div class="placeholder d-flex justify-content-center align-items-center h-100"><h4>Loading messages...</h4></div>
        `;
        
        await loadMessages(conversationId);
        
        scrollToBottom();
        
        if(replyForm) replyForm.classList.remove('d-none');
    }

    async function loadConversations() {
        // ... (The loadConversations function you fixed and preferred)
        console.log("Step 2: loadConversations() function was called.");
        if (!convListDiv) return;
        try {
            const response = await fetch('/api/conversations');
            if(!response.ok) throw new Error('Failed to fetch conversations');
            const conversations = await response.json();
            const activeConvId = document.querySelector('.list-group-item.active')?.dataset.id;
            convListDiv.innerHTML = '';
            if (conversations.length === 0) {
                convListDiv.innerHTML = `<p class="text-center text-secondary p-4">لا توجد محادثات.</p>`;
                return;
            }
            conversations.forEach(conv => {
                const customerName = conv.customerName || conv.customerPhone;
                const firstLetter = customerName.charAt(0).toUpperCase();
                const convItem = document.createElement('a');
                convItem.href = '#';
                convItem.className = 'list-group-item list-group-item-action';
                convItem.dataset.id = conv._id;
                convItem.dataset.customerName = customerName;
                convItem.dataset.customerPhone = conv.customerPhone;
                const unreadBadge = conv.unreadCount > 0 ? `<span class="unread-badge ms-auto">${conv.unreadCount}</span>` : '';
                convItem.innerHTML = `<div class="d-flex align-items-center"><div class="status-indicator status-${conv.status}"></div><div class="avatar me-3" style="background-color: ${generateHSLColor(customerName)};"><span>${firstLetter}</span></div><div class="conv-item-details"><div class="d-flex w-100 justify-content-between"><span class="customer-name text-truncate">${customerName}</span><small class="text-nowrap text-muted">${formatRelativeTime(conv.lastMessageTimestamp)}</small></div><div class="d-flex align-items-center"><p class="last-message text-muted text-truncate mb-0 flex-grow-1">${conv.lastMessage || '...'}</p>${unreadBadge}</div></div></div>`;
                if (conv._id === activeConvId) convItem.classList.add('active');
                convItem.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (activeConversationId !== conv._id) {
                         initializeConversation(conv._id, convItem);
                    }
                });
                convListDiv.appendChild(convItem);
            });
        } catch (error) {
            console.error("Failed to load conversations:", error);
            if(convListDiv) convListDiv.innerHTML = `<p class="text-danger p-3">Failed to load conversations.</p>`;
        }
    }
    async function loadEmployees() {
    if (!employeesTableBody) return; // تأكد من وجود الجدول قبل المتابعة

    try {
        const response = await fetch('/api/employees');
        if (!response.ok) throw new Error('Failed to fetch employees');
        
        const employees = await response.json();

        employeesTableBody.innerHTML = ''; // قم بتفريغ الجدول أولاً

        if (employees.length === 0) {
            employeesTableBody.innerHTML = '<tr><td colspan="3" class="text-center text-secondary">لا يوجد موظفون حاليًا.</td></tr>';
            return;
        }

        employees.forEach(employee => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${employee.name}</td>
                <td>${employee.email}</td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-danger btn-delete-employee" data-id="${employee._id}">حذف</button>
                </td>
            `;
            employeesTableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading employees:', error);
        employeesTableBody.innerHTML = '<tr><td colspan-="3" class="text-center text-danger">فشل تحميل الموظفين.</td></tr>';
    }
}
    // --- 3. EVENT LISTENERS ---
// في ملف public/js/dashboard.js
    if (replyForm) {
        replyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const messageText = replyMessageInput.value;
            if (!messageText.trim() || !activeConversationId) return;

            const originalButtonContent = replyButton.innerHTML;
            replyButton.disabled = true;
            replyButton.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;

            try {
                const response = await fetch(`/api/conversations/${activeConversationId}/reply`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: messageText, contextMessageId: messageToReplyToId })
                });

                if (response.ok) {
                    replyMessageInput.value = '';
                    if (replyPreviewContainer) replyPreviewContainer.classList.add('d-none');
                    messageToReplyToId = null;
                } else {
                    const errorData = await response.json();
                    alert('Failed to send message: ' + (errorData.message || 'Unknown error'));
                }
            } catch (error) {
                alert('An unexpected error occurred.');
            } finally {
                replyButton.disabled = false;
                replyButton.innerHTML = originalButtonContent;
                replyMessageInput.focus();
            }
        });
    }
    
    if (messagesArea) {
        messagesArea.addEventListener('scroll', () => {
            if (messagesArea.scrollTop === 0 && !isLoadingMessages && !allMessagesLoaded && activeConversationId) {
                loadMessages(activeConversationId);
            }
        });
    }

    // --- 3. EVENT LISTENERS ---
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            const messageEl = document.getElementById('loginMessage');
            try {
                const response = await fetch('/api/auth/login', {
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

            // جمع بيانات واتساب القديمة
            const accessToken = document.getElementById('accessToken').value;
            const phoneNumberId = document.getElementById('phoneNumberId').value;
            const verifyToken = document.getElementById('verifyToken').value;

            // --- جمع بيانات الرسالة الترحيبية الجديدة ---
            const welcomeMessageSettings = {
                enabled: welcomeEnabled.checked,
                type: welcomeTypeInteractive.checked ? 'interactive' : 'text',
                text: welcomeText.value,
                buttons: [
                    welcomeButton1.value,
                    welcomeButton2.value,
                    welcomeButton3.value
                ].filter(btn => btn.trim() !== '') // تجاهل الأزرار الفارغة
            };
            // ------------------------------------------

            try {
                const response = await fetch('/api/auth/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        accessToken, 
                        phoneNumberId, 
                        verifyToken,
                        welcomeMessage: welcomeMessageSettings // إرسال الإعدادات الجديدة
                    })
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
    
    if (welcomeTypeText) {
        welcomeTypeText.addEventListener('change', () => {
            if (welcomeTypeText.checked) {
                welcomeButtonsContainer.classList.add('d-none');
            }
        });
    }
    if (welcomeTypeInteractive) {
        welcomeTypeInteractive.addEventListener('change', () => {
            if (welcomeTypeInteractive.checked) {
                welcomeButtonsContainer.classList.remove('d-none');
            }
        });
    }
    // --- 4. SOCKET.IO REAL-TIME LISTENERS ---
    socket.on('new_message', (message) => {
        // أولاً، قم بتحديث قائمة المحادثات لتعكس الرسالة الأخيرة والوقت
        loadConversations(); 
        
        // ثانيًا، تحقق مما إذا كانت الرسالة تخص المحادثة النشطة
        if (message.conversationId === activeConversationId) {
            // إذا كانت كذلك، قم بتشغيل الصوت وعرض الرسالة
            notificationSound.play().catch(e => console.error("Error playing sound:", e));
            
            const wasNearBottom = isUserNearBottom();
            appendMessage(message, false);
            if (wasNearBottom) {
                scrollToBottom();
            }

            // --- هذا هو الجزء الجديد والمهم ---
            // أرسل طلبًا فوريًا للخادم لتصفير العداد
            fetch(`/api/conversations/${activeConversationId}/mark-as-read`, {
                method: 'POST'
            }).catch(err => console.error("Failed to mark as read:", err));
            // ------------------------------------

        } else {
            // إذا كانت المحادثة غير نشطة، فقط قم بتشغيل الصوت
            notificationSound.play().catch(e => console.error("Error playing sound:", e));
        }
    });
    
    socket.on('message_status_update', (data) => {
        const messageBubble = document.querySelector(`.message-bubble[data-message-id="${data.messageId}"]`);
        if (messageBubble) {
            const statusTicks = messageBubble.querySelector('.status-ticks');
            if (statusTicks) statusTicks.dataset.status = data.status;
        }
    });

    socket.on('conversation_updated', (updatedConv) => {
        // ببساطة، أعد تحميل قائمة المحادثات بالكامل لضمان تحديث كل شيء
        // (الرسالة الأخيرة، الوقت، الحالة، وعدد الرسائل غير المقروءة)
        console.log('Conversation updated event received, reloading conversation list...');
        loadConversations();
    });

    const dropdownElementList = [].slice.call(document.querySelectorAll('[data-bs-toggle="dropdown"]'));
    dropdownElementList.map(function (dropdownToggleEl) {
        return new bootstrap.Dropdown(dropdownToggleEl);
    });

    // --- 7. Initial Page Load ---
    function init() {
         console.log("Step 1: init() function was called.")
        if (document.getElementById('conv-list')) {
            loadConversations();
            // loadAnalytics(); // Assuming you have this function
            if ('Notification' in window && Notification.permission !== 'granted') {
                // You might want to ask for permission on a user action, not on page load
                // Notification.requestPermission();
            }
        }
    }
    
    init();
});