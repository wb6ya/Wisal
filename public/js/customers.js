// public/js/customers.js
document.addEventListener('DOMContentLoaded', () => {
    const loadingSpinner = document.getElementById('customers-loading');
    const contentArea = document.getElementById('customers-content');
    const customersTableBody = document.getElementById('customersTableBody');

    function formatRelativeDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    function generateHSLColor(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = hash % 360;
        return `hsl(${h}, 50%, 60%)`;
    }

    async function loadCustomers() {
        try {
            const response = await fetch('/api/customers');
            if (!response.ok) throw new Error('Failed to fetch customer data');
            const customers = await response.json();

            customersTableBody.innerHTML = '';

            if (customers.length === 0) {
                contentArea.innerHTML = '<p class="text-center text-muted">لا يوجد عملاء لعرضهم.</p>';
            } else {
                customers.forEach(customer => {
                    const customerName = customer.name || 'Unknown';
                    const firstLetter = customerName.charAt(0).toUpperCase();
                    const avatarColor = generateHSLColor(customerName);

                    const statusMap = {
                        'new': { text: 'جديدة', class: 'status-new' },
                        'in_progress': { text: 'قيد التنفيذ', class: 'status-in_progress' },
                        'resolved': { text: 'تم حلها', class: 'status-resolved' }
                    };
                    const statusInfo = statusMap[customer.status] || { text: customer.status, class: '' };

                    const row = `
                        <tr>
                            <td>
                                <div class="customer-info">
                                    <div class="avatar" style="background-color: ${avatarColor};">${firstLetter}</div>
                                    <div>
                                        <div class="customer-name">${customerName}</div>
                                        <div class="customer-phone">${customer.phone}</div>
                                    </div>
                                </div>
                            </td>
                            <td>${formatRelativeDate(customer.lastInteraction)}</td>
                            <td>${customer.totalMessages}</td>
                            <td><span class="status-badge ${statusInfo.class}">${statusInfo.text}</span></td>
                        </tr>
                    `;
                    customersTableBody.insertAdjacentHTML('beforeend', row);
                });
            }

            loadingSpinner.classList.add('d-none');
            contentArea.classList.remove('d-none');

        } catch (error) {
            console.error('Failed to load customers:', error);
            loadingSpinner.innerHTML = '<p class="text-danger">Failed to load customer data.</p>';
        }
    }

    loadCustomers();
});