// public/js/analytics.js
document.addEventListener('DOMContentLoaded', () => {
    const loadingSpinner = document.getElementById('analytics-loading');
    const contentArea = document.getElementById('analytics-content');
    const messagesChartCanvas = document.getElementById('messagesChart');

    async function loadAnalytics() {
        try {
            // Fetch both sets of data concurrently
            const [summaryRes, chartRes] = await Promise.all([
                fetch('/api/analytics/summary'),
                fetch('/api/analytics/messages-over-time')
            ]);

            if (!summaryRes.ok || !chartRes.ok) {
                throw new Error('Failed to fetch analytics data');
            }

            const summaryData = await summaryRes.json();
            const chartData = await chartRes.json();

            // Populate Stat Cards
            document.getElementById('totalConversationsStat').textContent = summaryData.totalConversations;
            document.getElementById('totalMessagesStat').textContent = summaryData.totalMessages;
            document.getElementById('messageBreakdownStat').textContent = `${summaryData.incomingMessages} واردة / ${summaryData.outgoingMessages} صادرة`;
            document.getElementById('newConversationsStat').textContent = summaryData.newConversationsLast7Days;
            document.getElementById('avgMessagesStat').textContent = summaryData.avgMessagesPerConversation;
            
            // Prepare data for the chart
            const labels = [];
            const dataPoints = [];
            const dateMap = new Map(chartData.map(item => [item._id, item.count]));

            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dateString = d.toISOString().split('T')[0];
                labels.push(dateString);
                dataPoints.push(dateMap.get(dateString) || 0);
            }

            // Render the Chart
            new Chart(messagesChartCanvas, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'عدد الرسائل',
                        data: dataPoints,
                        borderColor: '#0d6efd',
                        backgroundColor: 'rgba(13, 110, 253, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });

            // Hide spinner and show content
            loadingSpinner.classList.add('d-none');
            contentArea.classList.remove('d-none');

        } catch (error) {
            console.error('Failed to load analytics:', error);
            loadingSpinner.innerHTML = '<p class="text-danger">Failed to load analytics data.</p>';
        }
    }

    loadAnalytics();
});