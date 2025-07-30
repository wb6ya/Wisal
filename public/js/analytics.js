document.addEventListener('DOMContentLoaded', () => {
    // --- 1. Element Selectors ---
    const loadingDiv = document.getElementById('analytics-loading');
    const contentDiv = document.getElementById('analytics-content');

    // Chart Canvases
    const statusChartCtx = document.getElementById('statusDistributionChart')?.getContext('2d');
    const ratingsChartCtx = document.getElementById('ratingsSummaryChart')?.getContext('2d');
    const peakHoursChartCtx = document.getElementById('peakHoursChart')?.getContext('2d');
    const messagesChartCtx = document.getElementById('messagesChart')?.getContext('2d');
    
    // --- 2. Chart Objects (to prevent re-creation) ---
    let statusChart, ratingsChart, peakHoursChart, messagesChart;

    // --- 3. Main Data Loading Function ---
    async function loadAnalyticsData() {
        try {
            // Fetch all data points in parallel for speed
            const [summaryRes, statusRes, peakHoursRes, ratingsRes, messagesOverTimeRes] = await Promise.all([
                fetch('/api/analytics/summary'),
                fetch('/api/analytics/status-distribution'),
                fetch('/api/analytics/peak-hours'),
                fetch('/api/analytics/ratings-summary'),
                fetch('/api/analytics/messages-over-time') // Fetch data for the 7-day chart
            ]);

            // Check if all responses are OK
            if (!summaryRes.ok || !statusRes.ok || !peakHoursRes.ok || !ratingsRes.ok || !messagesOverTimeRes.ok) {
                throw new Error('Failed to fetch one or more analytics endpoints.');
            }

            // Parse all data
            const summaryData = await summaryRes.json();
            const statusData = await statusRes.json();
            const peakHoursData = await peakHoursRes.json();
            const ratingsData = await ratingsRes.json();
            const messagesOverTimeData = await messagesOverTimeRes.json();
            
            // --- Update UI ---
            updateSummaryCards(summaryData);
            createStatusDistributionChart(statusData);
            createPeakHoursChart(peakHoursData);
            createRatingsSummaryChart(ratingsData);
            createMessagesOverTimeChart(messagesOverTimeData); // Call the function for the 7-day chart

            // Show content and hide loader
            loadingDiv.classList.add('d-none');
            contentDiv.classList.remove('d-none');

        } catch (error) {
            console.error(error);
            loadingDiv.innerHTML = '<p class="text-center text-danger">فشل تحميل بيانات التحليلات.</p>';
        }
    }

    // --- 4. UI Update Functions ---

    function updateSummaryCards(data) {
        document.getElementById('totalConversationsStat').textContent = data.totalConversations || 0;
        document.getElementById('totalMessagesStat').textContent = data.totalMessages || 0;
        document.getElementById('messageBreakdownStat').textContent = `${data.incomingMessages || 0} واردة / ${data.outgoingMessages || 0} صادرة`;
        document.getElementById('newConversationsStat').textContent = data.newConversationsLast7Days || 0;
        document.getElementById('avgMessagesStat').textContent = data.avgMessagesPerConversation || 0;
    }
    
    function createStatusDistributionChart(data) {
        if (!statusChartCtx) return;
        if (statusChart) statusChart.destroy();

        const statusTranslations = {
            'new': 'جديدة',
            'in_progress': 'قيد التنفيذ',
            'resolved': 'تم حلها',
            'null': 'غير محدد'
        };
        const labels = data.map(item => statusTranslations[item._id] || item._id);
        const counts = data.map(item => item.count);

        statusChart = new Chart(statusChartCtx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    label: 'توزيع الحالات',
                    data: counts,
                    backgroundColor: ['#0d6efd', '#ffc107', '#198754'],
                    hoverOffset: 4
                }]
            },
            options: { 
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: 'white' } } }
            }
        });
    }

    function createRatingsSummaryChart(data) {
        if (!ratingsChartCtx) return;
        if (ratingsChart) ratingsChart.destroy();

        const labels = data.map(item => item._id);
        const counts = data.map(item => item.count);

        ratingsChart = new Chart(ratingsChartCtx, {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    label: 'ملخص التقييمات',
                    data: counts,
                    backgroundColor: ['#28a745', '#ffc107', '#dc3545'],
                    hoverOffset: 4
                }]
            },
            options: { 
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: 'white' } } }
            }
        });
    }

    function createPeakHoursChart(data) {
        if (!peakHoursChartCtx) return;
        if (peakHoursChart) peakHoursChart.destroy();

        const labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
        const counts = Array(24).fill(0);
        data.forEach(item => {
            counts[item._id] = item.count;
        });

        peakHoursChart = new Chart(peakHoursChartCtx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'عدد الرسائل الواردة',
                    data: counts,
                    backgroundColor: 'rgba(74, 114, 255, 0.6)',
                    borderColor: 'rgba(74, 114, 255, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { 
                        beginAtZero: true, 
                        ticks: { stepSize: 1, color: 'white' },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' }
                    },
                    x: {
                        ticks: { color: 'white' },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' }
                    }
                },
                plugins: {
                    legend: { labels: { color: 'white' } }
                }
            }
        });
    }
    
    function createMessagesOverTimeChart(data) {
        if (!messagesChartCtx) return;
        if (messagesChart) messagesChart.destroy();

        const labels = [];
        const dateMap = new Map();
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateString = d.toISOString().split('T')[0]; // "YYYY-MM-DD"
            labels.push(d.toLocaleDateString('ar-EG', { weekday: 'short' }));
            dateMap.set(dateString, 6 - i);
        }

        const counts = Array(7).fill(0);
        data.forEach(item => {
            if (dateMap.has(item._id)) {
                const index = dateMap.get(item._id);
                counts[index] = item.count;
            }
        });

        messagesChart = new Chart(messagesChartCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'عدد الرسائل',
                    data: counts,
                    borderColor: 'rgba(0, 168, 132, 1)',
                    backgroundColor: 'rgba(0, 168, 132, 0.2)',
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    y: { beginAtZero: true, ticks: { color: 'white', stepSize: 1 }, grid: { color: 'rgba(255, 255, 255, 0.1)' } },
                    x: { ticks: { color: 'white' }, grid: { color: 'rgba(255, 255, 255, 0.1)' } }
                },
                plugins: { legend: { labels: { color: 'white' } } }
            }
        });
    }

    // --- 5. Initial Load ---
    loadAnalyticsData();
});