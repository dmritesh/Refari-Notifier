import axios from 'axios';
import { encrypt, decrypt } from './encryption';
import prisma from '../db';

const HUBSTAFF_AUTH_URL = 'https://account.hubstaff.com/authorizations/new';
const HUBSTAFF_TOKEN_URL = 'https://account.hubstaff.com/access_tokens';

export class HubstaffOAuthService {
    static getAuthorizationUrl(state: string) {
        const scope = 'openid profile email hubstaff:read hubstaff:write';
        const nonce = Math.random().toString(36).substring(2, 15);
        const params = new URLSearchParams({
            client_id: process.env.HUBSTAFF_CLIENT_ID || '',
            redirect_uri: process.env.HUBSTAFF_REDIRECT_URI || '',
            response_type: 'code',
            scope: scope,
            state: state,
            nonce: nonce
        });
        // Hubstaff/OIDC prefers %20 over + for spaces in scopes
        return `${HUBSTAFF_AUTH_URL}?${params.toString().replace(/\+/g, '%20')}`;
    }

    static async exchangeCodeForToken(orgId: string, code: string) {
        try {
            const response = await axios.post(HUBSTAFF_TOKEN_URL, new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: process.env.HUBSTAFF_REDIRECT_URI || '',
                client_id: process.env.HUBSTAFF_CLIENT_ID || '',
                client_secret: process.env.HUBSTAFF_CLIENT_SECRET || ''
            }).toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            const { access_token, refresh_token, expires_in } = response.data;
            const expiresAt = new Date(Date.now() + expires_in * 1000);

            // Automatically fetch the primary Hubstaff Organization ID
            let hubstaffOrgId = null;
            try {
                const orgsResponse = await axios.get('https://api.hubstaff.com/v2/organizations', {
                    headers: { 'Authorization': `Bearer ${access_token}` }
                });
                if (orgsResponse.data.organizations && orgsResponse.data.organizations.length > 0) {
                    hubstaffOrgId = orgsResponse.data.organizations[0].id.toString();
                    console.log(`Auto-discovered Hubstaff Org ID: ${hubstaffOrgId} for org: ${orgId}`);
                }
            } catch (err) {
                console.error('Error fetching organizations during OAuth exchange:', err);
            }

            await prisma.organization.update({
                where: { id: orgId },
                data: {
                    hubstaff_access_token: encrypt(access_token),
                    hubstaff_refresh_token: encrypt(refresh_token),
                    hubstaff_token_expires_at: expiresAt,
                    hubstaff_org_id: hubstaffOrgId
                }
            });

            return access_token;
        } catch (error) {
            console.error('Error exchanging code for token:', error);
            throw error;
        }
    }

    static async getValidToken(orgId: string) {
        const org = await prisma.organization.findUnique({
            where: { id: orgId }
        });

        if (!org || !org.hubstaff_access_token || !org.hubstaff_refresh_token) {
            throw new Error(`No Hubstaff credentials found for organization ${orgId}`);
        }

        const now = new Date();
        const expiresAt = org.hubstaff_token_expires_at;

        // Refresh if expired or expiring in the next 5 minutes
        if (!expiresAt || expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
            return this.refreshToken(orgId, decrypt(org.hubstaff_refresh_token));
        }

        return decrypt(org.hubstaff_access_token);
    }

    private static async refreshToken(orgId: string, refreshToken: string) {
        try {
            console.log(`Refreshing Hubstaff token for org: ${orgId}`);
            const response = await axios.post(HUBSTAFF_TOKEN_URL, new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: process.env.HUBSTAFF_CLIENT_ID || '',
                client_secret: process.env.HUBSTAFF_CLIENT_SECRET || ''
            }).toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            const { access_token, refresh_token, expires_in } = response.data;
            const expiresAt = new Date(Date.now() + expires_in * 1000);

            await prisma.organization.update({
                where: { id: orgId },
                data: {
                    hubstaff_access_token: encrypt(access_token),
                    hubstaff_refresh_token: encrypt(refresh_token),
                    hubstaff_token_expires_at: expiresAt
                }
            });

            return access_token;
        } catch (error) {
            console.error('Error refreshing token:', error);
            throw error;
        }
    }
}
