// App State
let currentOrgId = null;
let autoRefreshInterval;

// DOM Elements
const pages = document.querySelectorAll('.page');
const navLinks = document.querySelectorAll('.nav-links li');
const settingsForm = document.getElementById('settings-form');
const toast = document.getElementById('toast');

// Navigation
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        const pageId = link.getAttribute('data-page');
        showPage(pageId);
    });
});

function showPage(pageId) {
    pages.forEach(p => p.classList.remove('active'));
    navLinks.forEach(l => l.classList.remove('active'));

    document.getElementById(pageId).classList.add('active');
    document.querySelector(`[data-page="${pageId}"]`).classList.add('active');

    if (pageId === 'dashboard') loadDashboardData();
    if (pageId === 'settings' && currentOrgId) loadSettings();
    if (pageId === 'logs') loadFullLogs();
}

// Initial Load
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Fetch valid Org ID from server
        const res = await fetch('/admin/current-org');
        const data = await res.json();
        if (data.id) {
            currentOrgId = data.id;
            console.log('Connected to Org:', currentOrgId);
        }
    } catch (e) {
        console.error('Could not fetch current org:', e);
    }

    loadDashboardData();
    startAutoRefresh();
});

function startAutoRefresh() {
    autoRefreshInterval = setInterval(() => {
        if (document.getElementById('dashboard').classList.contains('active')) {
            loadDashboardData();
        }
    }, 15000); // 15s refresh
}

// Data Loading
async function loadDashboardData() {
    try {
        const statsRes = await fetch('/admin/stats');
        const stats = await statsRes.json();

        document.getElementById('stat-today').innerText = stats.total_notifications_today;
        document.getElementById('stat-active').innerText = stats.active_team_members;

        const logsRes = await fetch('/admin/events');
        const logs = await logsRes.json();
        renderRecentActivity(logs.slice(0, 10));
    } catch (err) {
        console.error('Failed to load dashboard data', err);
    }
}

function renderRecentActivity(logs) {
    const list = document.getElementById('recent-activity-list');
    list.innerHTML = logs.map(log => `
        <div class="activity-item">
            <span class="activity-time">${new Date(log.created_at).toLocaleString()}</span>
            <span class="activity-text">Activity detected for User <b>${log.hubstaff_user_id}</b> on Task <b>${log.hubstaff_task_id}</b></span>
            <span class="activity-status">Sent</span>
        </div>
    `).join('');
}

async function loadSettings() {
    try {
        const res = await fetch(`/admin/organizations/${currentOrgId}`);
        const org = await res.json();

        // Fill form
        document.getElementById('is_active').checked = org.is_active;
        document.getElementById('notification_gap_minutes').value = org.notification_gap_minutes;
        document.getElementById('gitlab_project_path').value = org.gitlab_project_path || '';
        document.getElementById('gitlab_domain').value = org.gitlab_domain || 'gitlab.com';
        document.getElementById('freshdesk_domain').value = org.freshdesk_domain || '';

        // Passwords stay empty for security
    } catch (err) {
        showToast('Failed to load settings', true);
    }
}

async function loadFullLogs() {
    try {
        const res = await fetch('/admin/events');
        const logs = await res.json();
        const tbody = document.querySelector('#logs-table tbody');

        tbody.innerHTML = logs.map(log => `
            <tr>
                <td>${new Date(log.created_at).toLocaleString()}</td>
                <td>${log.hubstaff_user_id}</td>
                <td>${log.hubstaff_task_id}</td>
                <td style="color: var(--success)">Processed</td>
            </tr>
        `).join('');
    } catch (err) {
        showToast('Failed to load logs', true);
    }
}

// Form Handling
settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const updates = {
        is_active: document.getElementById('is_active').checked,
        notification_gap_minutes: parseInt(document.getElementById('notification_gap_minutes').value),
        gitlab_project_path: document.getElementById('gitlab_project_path').value,
        gitlab_domain: document.getElementById('gitlab_domain').value,
        freshdesk_domain: document.getElementById('freshdesk_domain').value,
    };

    // Only include passwords if they were changed (not just placeholder)
    const glApiKey = document.getElementById('gitlab_api_key').value;
    if (glApiKey) updates.gitlab_api_key = glApiKey;

    const fdApiKey = document.getElementById('freshdesk_api_key').value;
    if (fdApiKey) updates.freshdesk_api_key = fdApiKey;

    const slackUrl = document.getElementById('slack_webhook_url').value;
    if (slackUrl) updates.slack_webhook_url = slackUrl;

    try {
        const res = await fetch(`/admin/organizations/${currentOrgId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });

        if (res.ok) {
            showToast('Settings saved successfully!');
            // Update bot status dot immediately
            const statusBadge = document.getElementById('bot-status-badge');
            const statusText = document.getElementById('bot-status-text');
            if (updates.is_active) {
                statusBadge.style.color = 'var(--success)';
                statusBadge.style.background = 'rgba(16, 185, 129, 0.1)';
                statusText.innerText = 'Bot Online';
            } else {
                statusBadge.style.color = 'var(--danger)';
                statusBadge.style.background = 'rgba(239, 68, 68, 0.1)';
                statusText.innerText = 'Bot Paused';
            }
        } else {
            throw new Error();
        }
    } catch (err) {
        showToast('Error saving settings', true);
    }
});

// Test Notification
document.getElementById('test-notify-btn').addEventListener('click', async () => {
    const ticketId = prompt('Enter a Ticket/Issue ID to test:', '3341');
    if (!ticketId) return;

    try {
        const res = await fetch(`/admin/organizations/${currentOrgId}/test-notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticketId, userName: 'Admin Test' })
        });

        if (res.ok) {
            showToast('Test notification sent!');
        } else {
            throw new Error();
        }
    } catch (err) {
        showToast('Test failed', true);
    }
});

// Refresh button
document.getElementById('refresh-logs').addEventListener('click', async () => {
    const btn = document.getElementById('refresh-logs');
    const originalText = btn.innerText;

    btn.disabled = true;
    btn.innerText = 'Refreshing...';
    btn.style.opacity = '0.7';

    await loadDashboardData();

    showToast('Dashboard data refreshed');

    btn.innerText = originalText;
    btn.disabled = false;
    btn.style.opacity = '1';
});

// Utilities
function showToast(message, isError = false) {
    toast.innerText = message;
    toast.classList.remove('error');
    if (isError) toast.classList.add('error');

    toast.classList.add('active');
    setTimeout(() => {
        toast.classList.remove('active');
    }, 3000);
}
