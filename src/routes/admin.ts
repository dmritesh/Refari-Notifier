import { FastifyInstance } from 'fastify';
import prisma from '../db';
import axios from 'axios';
import { encrypt, decrypt } from '../services/encryption';
import { SlackService } from '../services/slack';
import { HubstaffOAuthService } from '../services/hubstaff-oauth';
import { HubstaffService } from '../services/hubstaff';

interface CreateOrgBody {
    name: string;
    freshdesk_api_key: string;
    freshdesk_domain: string;
    slack_webhook_url: string;
    gitlab_domain?: string;
    gitlab_project_path?: string;
    gitlab_api_key?: string;
}

export default async function adminRoutes(fastify: FastifyInstance) {
    fastify.get('/admin/current-org', async (request, reply) => {
        try {
            // Find the first organization
            let org = await prisma.organization.findFirst();

            // If none exists, create a default one
            if (!org) {
                org = await (prisma.organization as any).create({
                    data: {
                        name: 'Refari Default',
                        freshdesk_api_key: encrypt('placeholder'),
                        freshdesk_domain: 'refari.freshdesk.com',
                        slack_webhook_url: encrypt('placeholder'),
                        is_active: true,
                        notification_gap_minutes: 120
                    }
                });
            }

            return { id: org?.id };
        } catch (error) {
            request.log.error(error);
            reply.code(500).send({ error: 'Failed to retrieve current organization' });
        }
    });
    fastify.get('/admin/events', async (request, reply) => {
        try {
            const events = await prisma.processedEvent.findMany({
                take: 50,
                orderBy: { created_at: 'desc' },
                include: {
                    organization: {
                        select: { name: true }
                    }
                }
            });
            return events;
        } catch (error) {
            reply.code(500).send({ error: 'Failed to fetch events' });
        }
    });

    fastify.get('/admin/organizations/:id', async (request, reply) => {
        const { id } = (request.params as any);
        try {
            const org = await prisma.organization.findUnique({ where: { id } });
            if (!org) return reply.code(404).send({ error: 'Org not found' });

            // Return safe object (no secrets decrypted here, just metadata)
            const {
                hubstaff_access_token,
                hubstaff_refresh_token,
                hubstaff_api_key,
                freshdesk_api_key,
                slack_webhook_url,
                gitlab_api_key,
                ...safeOrg
            } = (org as any);

            return {
                ...safeOrg,
                auth_url: `${request.protocol}://${request.hostname}/auth/hubstaff?orgId=${org.id}`
            };
        } catch (error) {
            reply.code(500).send({ error: 'Failed to fetch organization' });
        }
    });

    fastify.get('/admin/stats', async (request, reply) => {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const totalToday = await prisma.processedEvent.count({
                where: { created_at: { gte: today } }
            });

            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            const activeTeamCount = await (prisma as any).userSession.count({
                where: {
                    last_activity_at: { gte: oneHourAgo }
                }
            });

            return {
                total_notifications_today: totalToday,
                active_team_members: activeTeamCount,
                system_status: 'Online'
            };
        } catch (error) {
            reply.code(500).send({ error: 'Failed to fetch stats' });
        }
    });

    fastify.post<{ Body: CreateOrgBody }>('/admin/organizations', async (request, reply) => {
        const { name, freshdesk_api_key, freshdesk_domain, slack_webhook_url, gitlab_domain, gitlab_project_path, gitlab_api_key } = request.body;

        if (!name || !freshdesk_api_key || !freshdesk_domain || !slack_webhook_url) {
            return reply.code(400).send({ error: 'Core fields (name, freshdesk, slack) are required' });
        }

        try {
            const org = await (prisma.organization as any).create({
                data: {
                    name,
                    freshdesk_api_key: encrypt(freshdesk_api_key),
                    freshdesk_domain,
                    slack_webhook_url: encrypt(slack_webhook_url),
                    gitlab_domain,
                    gitlab_project_path,
                    gitlab_api_key: gitlab_api_key ? encrypt(gitlab_api_key) : null
                }
            });

            // Return org with instructions for OAuth
            const { freshdesk_api_key: __, slack_webhook_url: ___, ...safeOrg } = org as any;

            return {
                ...safeOrg,
                message: "Organization created! Next, connect to Hubstaff using the link below.",
                auth_url: `http://localhost:3000/auth/hubstaff?orgId=${org.id}`
            };

        } catch (error) {
            request.log.error(error);
            reply.code(500).send({ error: 'Failed to create organization' });
        }
    });

    fastify.patch<{ Params: { id: string }, Body: any }>('/admin/organizations/:id', async (request, reply) => {
        const { id } = request.params;
        const updates: any = { ...(request.body as any) };

        if (updates.freshdesk_api_key) updates.freshdesk_api_key = encrypt(updates.freshdesk_api_key);
        if (updates.slack_webhook_url) updates.slack_webhook_url = encrypt(updates.slack_webhook_url);
        if (updates.gitlab_api_key) updates.gitlab_api_key = encrypt(updates.gitlab_api_key);

        try {
            const org = await prisma.organization.update({
                where: { id },
                data: updates
            });
            return org;
        } catch (error) {
            reply.code(500).send({ error: 'Failed to update organization' });
        }
    });

    fastify.post<{ Params: { id: string }, Body: { ticketId: string, subject?: string, userName?: string } }>('/admin/organizations/:id/test-notification', async (request, reply) => {
        const { id } = request.params;
        const { ticketId, subject, userName } = request.body;

        try {
            const org = await prisma.organization.findUnique({ where: { id } });
            if (!org) return reply.code(404).send({ error: 'Org not found' });

            const slackWebhookUrl = decrypt(org.slack_webhook_url);

            let finalSubject = subject;
            let finalUrl = "";

            if ((org as any).gitlab_api_key && (org as any).gitlab_project_path) {
                const gitlabApiKey = decrypt((org as any).gitlab_api_key);
                const gitlabDomain = (org as any).gitlab_domain || 'gitlab.com';
                try {
                    const { GitLabService } = await import('../services/gitlab');
                    const issue = await GitLabService.getIssue(gitlabDomain, gitlabApiKey, (org as any).gitlab_project_path, ticketId);
                    finalSubject = issue.title;
                    finalUrl = issue.web_url;
                } catch (err) {
                    console.warn('Test GitLab fetch failed:', err);
                }
            }

            if (!finalUrl) {
                const gitlabDomain = (org as any).gitlab_domain || 'gitlab.com';
                const gitlabProjectPath = (org as any).gitlab_project_path || 'unknown/project';
                finalUrl = `https://${gitlabDomain}/${gitlabProjectPath}/-/issues/${ticketId}`;
            }

            await SlackService.sendNotification(slackWebhookUrl, {
                userName: userName || 'Demo User',
                ticketSubject: finalSubject || 'Demo Issue',
                ticketId: ticketId,
                ticketUrl: finalUrl
            });

            return { success: true, message: 'Notification sent', details: { subject: finalSubject, url: finalUrl } };
        } catch (error) {
            request.log.error(error);
            reply.code(500).send({ error: 'Failed to send notification' });
        }
    });
}
