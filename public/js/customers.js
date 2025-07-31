// public/js/customers.js
document.addEventListener('DOMContentLoaded', () => {
    const loadingSpinner = document.getElementById('customers-loading');
    const contentArea = document.getElementById('customers-content');
    const customersTableBody = document.getElementById('customersTableBody');
    const searchInput = document.getElementById('customerSearchInput');
    const tableBody = document.getElementById('customersTableBody');
    const loadingDiv = document.getElementById('customers-loading');
    const contentDiv = document.getElementById('customers-content');

    let allCustomers = [];

    function formatRelativeDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    function generateHSLColor(str) {
        if (!str) return 'hsl(210, 50%, 60%)';
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = hash % 360;
        return `hsl(${h}, 40%, 50%)`;
    }

    function formatRelativeTime(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.round((now - date) / 1000);
    const minutes = Math.round(seconds / 60);
    const hours = Math.round(minutes / 60);
    const days = Math.round(hours / 24);

    if (seconds < 60) return `الآن`;
    if (minutes === 1) return `منذ دقيقة واحدة`;
    if (minutes < 60) return `منذ ${minutes} دقائق`;
    if (hours === 1) return `منذ ساعة واحدة`;
    if (hours < 24) return `منذ ${hours} ساعات`;
    if (days === 1) return `منذ يوم واحد`;
    return `منذ ${days} أيام`;
}

        /**
     * Renders a list of customers into the table.
     * @param {Array} customers - The array of customer objects to render.
     */
    function renderTable(customers) {
        tableBody.innerHTML = ''; 

        if (customers.length === 0) {
            const searchTerm = searchInput.value;
            const message = searchTerm ? 'No customers match your search.' : 'No customers to display.';
            tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted p-5">${message}</td></tr>`;
            return;
        }

        const statusMap = {
            'new': { text: 'New', class: 'bg-primary' },
            'in_progress': { text: 'In Progress', class: 'bg-warning text-dark' },
            'resolved': { text: 'Resolved', class: 'bg-success' }
        };
        
        const rowsHTML = customers.map(customer => {
            const customerName = customer.name || 'Unknown';
            const firstLetter = customerName.charAt(0).toUpperCase();
            const avatarColor = generateHSLColor(customerName);
            const statusInfo = statusMap[customer.status] || { text: 'Unknown', class: 'bg-secondary' };

            // When a row is clicked, it will navigate to the conversation
            return `
                <tr onclick="window.location.href='/dashboard?convId=${customer.conversationId}'">
                    <td>
                        <div class="d-flex align-items-center">
                            <div class="avatar-circle me-3" style="background-color: ${avatarColor};">
                                <span>${firstLetter}</span>
                            </div>
                            <div>
                                <div class="customer-name">${customerName}</div>
                                <div class="customer-phone">${customer.phone}</div>
                            </div>
                        </div>
                    </td>
                    <td>${formatRelativeTime(customer.lastInteraction)}</td>
                    <td>${customer.totalMessages}</td>
                    <td><span class="badge ${statusInfo.class}">${statusInfo.text}</span></td>
                    <td class="text-end">
                        <a href="/dashboard?convId=${customer.conversationId}" class="btn btn-sm btn-outline-primary">
                            View
                        </a>
                    </td>
                </tr>
            `;
        }).join('');

        tableBody.innerHTML = rowsHTML;
    }

    /**
     * Filters the customer list based on the search input and re-renders the table.
     */
    function handleSearch() {
        const searchTerm = searchInput.value.toLowerCase().trim();
        const filteredCustomers = allCustomers.filter(customer => {
            const nameMatch = customer.name.toLowerCase().includes(searchTerm);
            const phoneMatch = customer.phone.includes(searchTerm);
            return nameMatch || phoneMatch;
        });
        renderTable(filteredCustomers);
    }

    async function loadCustomers() {
        try {
            const response = await fetch('/api/customers');
            if (!response.ok) throw new Error('Failed to fetch customer data.');
            
            allCustomers = await response.json(); // Store the master list
            renderTable(allCustomers); // Render the full list initially
            
            loadingDiv.classList.add('d-none');
            contentDiv.classList.remove('d-none');

        } catch (error) {
            console.error(error);
            loadingDiv.innerHTML = `<div class="text-center p-4 text-danger">Error loading customers.</div>`;
        }
    }

    searchInput.addEventListener('input', handleSearch);

    loadCustomers();
});