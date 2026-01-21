import { CronJob } from 'cron';
import prisma from '../db';
import { encrypt, decrypt } from '../services/encryption';
import { HubstaffService } from '../services/hubstaff';
import { HubstaffOAuthService } from '../services/hubstaff-oauth';
import { FreshdeskService } from '../services/freshdesk';

import { SlackService } from '../services/slack';

const POLL_INTERVAL_SECONDS = 60;
// Note: SESSION_GAP_MS is now derived from org settings

export const startWorker = () => {
    console.log('Starting background worker...');

    // Run every 60 seconds
    const job = new CronJob(`*/${POLL_INTERVAL_SECONDS} * * * * *`, async () => {
        console.log('Worker tick: Checking for new activities...');
        await processAllOrganizations();
    });

    job.start();
};

async function processAllOrganizations() {
    try {
        const orgs = await prisma.organization.findMany();

        for (const org of orgs) {
            await processOrganization(org);
        }
    } catch (error) {
        console.error('Error in worker loop:', error);
    }
}

async function processOrganization(org: any) {
    try {
        if (!org.is_active) {
            console.log(`Automation is paused for Org: ${org.name}`);
            return;
        }
        console.log(`Processing Org: ${org.name} (${org.id})`);

        // 1. Get valid Hubstaff OAuth token (refreshes if needed)
        let hubstaffToken: string;
        try {
            hubstaffToken = await HubstaffOAuthService.getValidToken(org.id);
        } catch (err: any) {
            console.error(`Skipping org ${org.name} due to missing/invalid Hubstaff credentials:`, err.message);
            return;
        }

        // Decrypt other secrets
        const freshdeskApiKey = decrypt(org.freshdesk_api_key);
        const slackWebhookUrl = decrypt(org.slack_webhook_url);
        const freshdeskDomain = org.freshdesk_domain;


        // Determine start time for polling
        // Hubstaff API has a delay of 10-15 minutes.
        // We ALWAYS look back 45 minutes to ensure we catch delayed activities.
        // Our 'Strict Deduplication' logic (checking ProcessedEvent) prevents spam.
        const startTimeDate = new Date(Date.now() - 45 * 60 * 1000);

        // Hubstaff API expects ISO string
        const startTimeISO = startTimeDate.toISOString();

        if (!org.hubstaff_org_id) {
            console.warn(`Organization ${org.name} has no Hubstaff Org ID. Please connect via OAuth.`);
            return;
        }

        const activities = await HubstaffService.getRecentActivities(
            hubstaffToken,
            org.hubstaff_org_id,
            startTimeISO
        );

        console.log(`Found ${activities.length} activities for ${org.name} since ${startTimeISO}`);

        for (const activity of activities) {
            await processActivity(org, activity, hubstaffToken);
        }

        // Update last_checked_at to now
        await prisma.organization.update({
            where: { id: org.id },
            data: { last_checked_at: new Date() }
        });

    } catch (error) {
        console.error(`Error processing org ${org.name}:`, error);
    }
}

async function processActivity(
    org: any,
    activity: any,
    hubstaffToken: string
) {
    const hubstaffUserId = activity.user_id;
    const hubstaffTaskId = activity.task_id;
    const activityTime = new Date(activity.time_slot);
    const sessionGapMs = (org.notification_gap_minutes || 120) * 60 * 1000;
    const timeEntryId = activity.id.toString();

    console.log(`Checking activity ${activity.id}: User ${hubstaffUserId}, Task ${hubstaffTaskId} at ${activity.time_slot}`);

    // 0. STRICT DEDUPLICATION: Have we processed this specific time entry ID before?
    // This catches the "Overlap Buffer" reprocessing.
    const alreadyProcessed = await (prisma as any).processedEvent.findFirst({
        where: {
            hubstaff_time_entry_id: timeEntryId
        }
    });

    if (alreadyProcessed) {
        console.log(`Activity ${activity.id} already processed. Skipping.`);
        return;
    }

    // 1. Get current session state for this user/org
    const session = await (prisma as any).userSession.findUnique({
        where: {
            org_id_hubstaff_user_id: {
                org_id: org.id,
                hubstaff_user_id: hubstaffUserId
            }
        }
    });

    // NEW: Skip activities older than current session
    // This prevents duplicate notifications when old tasks reappear in the 45-min overlap window
    if (session && activityTime.getTime() < session.last_activity_at.getTime()) {
        console.log(`Activity ${activity.id} is older than current session (${activityTime} < ${session.last_activity_at}). Skipping.`);
        return;
    }

    let shouldNotify = false;

    if (!session) {
        // First time we see this user
        shouldNotify = true;
    } else {
        const gap = activityTime.getTime() - session.last_activity_at.getTime();
        const taskChanged = session.last_task_id !== hubstaffTaskId;
        const timeGapExceeded = gap > sessionGapMs;

        if (taskChanged || timeGapExceeded) {
            shouldNotify = true;

            // NEW: Anti-Flip-Flop Check
            // If the user just switched tasks, check if they were working on THIS task 
            // recently (within the gap window). If so, it's just toggling, not a "new" start.
            if (taskChanged && !timeGapExceeded) {
                const gapLimitDate = new Date(Date.now() - sessionGapMs);
                const recentNotification = await (prisma as any).processedEvent.findFirst({
                    where: {
                        org_id: org.id,
                        hubstaff_user_id: hubstaffUserId,
                        hubstaff_task_id: hubstaffTaskId,
                        created_at: {
                            gte: gapLimitDate
                        }
                    }
                });

                if (recentNotification) {
                    console.log(`User ${hubstaffUserId} toggled back to recent task ${hubstaffTaskId}. Suppressing notification.`);
                    shouldNotify = false;
                }
            }
        }
    }

    try {
        // Always update session to reflect current activity as the latest point in time
        // This is CRITIES: If this fails, we "forget" what the user is doing, causing false "Task Change" alerts next time.
        await (prisma as any).userSession.upsert({
            where: {
                org_id_hubstaff_user_id: {
                    org_id: org.id,
                    hubstaff_user_id: hubstaffUserId
                }
            },
            create: {
                org_id: org.id,
                hubstaff_user_id: hubstaffUserId,
                last_task_id: hubstaffTaskId,
                last_activity_at: activityTime,
                notified_at: shouldNotify ? new Date() : (session?.notified_at || null)
            },
            update: {
                last_task_id: hubstaffTaskId,
                last_activity_at: activityTime,
                ...(shouldNotify ? { notified_at: new Date() } : {})
            }
        });
    } catch (err: any) {
        console.error(`Failed to update session for user ${hubstaffUserId}:`, err.message);
        // If we can't save state, we must NOT notify to avoid spam loops
        return;
    }

    if (!shouldNotify) {
        // console.log(`Activity ${activity.id} is part of the same continuous session. Skipping notification.`);
        return;
    }

    try {
        // 3. Resolve Ticket ID
        let ticketId: string | null = null;

        // Fetch full task data to get all possible IDs and Project info
        const taskData = await HubstaffService.getTask(hubstaffToken, hubstaffTaskId);

        // Try 1: Check remote_alternate_id (often holds the short Freshdesk ID or GitLab IID)
        if (taskData.remote_alternate_id) {
            const match = String(taskData.remote_alternate_id).match(/\d+/);
            if (match && match[0].length < 8) {
                ticketId = match[0];
            }
        }

        // Try 2: Check remote_id
        if (!ticketId && taskData.remote_id) {
            const match = String(taskData.remote_id).match(/\d+/);
            if (match && match[0].length < 8) {
                ticketId = match[0];
            }
        }

        // Try 3: Check Task Name as fallback (e.g. "Fix [#1234]")
        if (!ticketId && taskData.name) {
            const nameMatch = taskData.name.match(/\[#?(\d+)\]/);
            if (nameMatch) {
                ticketId = nameMatch[1];
            }
        }

        if (!ticketId) {
            console.log(`Activity ${activity.id}: Could not find Ticket/Issue ID in task details. Skipping.`);
            return;
        }

        // 4. Resolve Source & Details (GitLab vs Freshdesk)
        let ticketSubject = taskData.name;
        let ticketUrl = "";

        // Detect if it's a GitLab task
        const gitlabProjectPath = org.gitlab_project_path;
        const normalizedProjectName = taskData.projectName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const normalizedGitlabPath = gitlabProjectPath ? gitlabProjectPath.toLowerCase().replace(/[^a-z0-9]/g, '') : null;

        const isGitLab = (normalizedGitlabPath && normalizedProjectName.includes(normalizedGitlabPath)) ||
            taskData.projectName.toLowerCase().includes('gitlab') ||
            (taskData.remote_id && taskData.remote_id.includes('gitlab')) ||
            (taskData.remote_alternate_id && taskData.remote_alternate_id.includes('gitlab'));

        if (isGitLab) {
            console.log(`Detected GitLab task for activity ${activity.id}`);
            const gitlabDomain = org.gitlab_domain || 'gitlab.com';
            const gitlabProjectPath = org.gitlab_project_path;

            // Try to fetch real info from GitLab if we have a key
            if (org.gitlab_api_key && gitlabProjectPath) {
                try {
                    const { GitLabService } = await import('../services/gitlab');
                    const gitlabApiKey = decrypt(org.gitlab_api_key);
                    const issue = await GitLabService.getIssue(gitlabDomain, gitlabApiKey, gitlabProjectPath, ticketId);
                    ticketSubject = issue.title;
                    ticketUrl = issue.web_url;
                } catch (glError) {
                    console.warn(`Failed to fetch real GitLab issue data for ${ticketId}, using fallback.`);
                }
            }

            if (!ticketUrl) {
                // Determine URL fallback
                if (taskData.remote_id && taskData.remote_id.startsWith('http')) {
                    ticketUrl = taskData.remote_id;
                } else if (taskData.remote_alternate_id && taskData.remote_alternate_id.startsWith('http')) {
                    ticketUrl = taskData.remote_alternate_id;
                } else if (gitlabProjectPath) {
                    // Construct URL from path and ID
                    ticketUrl = `https://${gitlabDomain}/${gitlabProjectPath}/-/issues/${ticketId}`;
                } else {
                    // Fallback: search or generic URL
                    ticketUrl = `https://${gitlabDomain}/search?search=${ticketId}`;
                }
            }
        } else {
            // Default to Freshdesk
            const freshdeskDomain = org.freshdesk_domain;
            const freshdeskApiKey = decrypt(org.freshdesk_api_key);
            try {
                const ticket = await FreshdeskService.getTicket(freshdeskDomain, freshdeskApiKey, ticketId);
                ticketSubject = ticket.subject;
                ticketUrl = FreshdeskService.getTicketUrl(freshdeskDomain, ticket.id);
            } catch (fdError) {
                console.warn(`Failed to fetch Freshdesk ticket ${ticketId}, using task name as fallback.`);
                ticketSubject = taskData.name;
                ticketUrl = `https://${freshdeskDomain}/a/tickets/${ticketId}`;
            }
        }

        // 5. Get Hubstaff User Name
        const userName = await HubstaffService.getUserName(hubstaffToken, hubstaffUserId);
        const slackWebhookUrl = decrypt(org.slack_webhook_url);

        console.log(`Sending notification for ${userName} on ${isGitLab ? 'GitLab' : 'Freshdesk'} ID ${ticketId}`);

        // 6. Send Slack Notification
        await SlackService.sendNotification(slackWebhookUrl, {
            userName: userName,
            ticketSubject: ticketSubject,
            ticketId: ticketId.toString(),
            ticketUrl: ticketUrl
        });

        // 6. Still log to ProcessedEvent for historical record details
        try {
            await (prisma as any).processedEvent.create({
                data: {
                    org_id: org.id,
                    hubstaff_user_id: hubstaffUserId,
                    hubstaff_task_id: hubstaffTaskId,
                    bucket: Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 10000), // Random jitter to force uniqueness
                    hubstaff_time_entry_id: activity.id.toString()
                }
            });
        } catch (err: any) {
            if (err.code !== 'P2002') {
                console.warn('Failed to log processed event:', err.message);
            }
        }
    } catch (error) {
        console.error(`Error processing activity ${activity.id}:`, error);
    }
}
