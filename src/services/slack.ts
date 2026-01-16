import axios from 'axios';

interface SlackNotificationData {
    userName: string;
    ticketSubject: string;
    ticketId: string;
    ticketUrl: string;
}

interface SlackMessage {
    text?: string;
    blocks?: any[];
    username?: string;
    icon_url?: string;
}

export class SlackService {
    static async sendNotification(
        webhookUrl: string,
        data: SlackNotificationData
    ): Promise<void> {
        const { userName, ticketSubject, ticketId, ticketUrl } = data;

        // Formatting exact message as requested:
        // *{Hubstaff User Name}* has started working on *{Freshdesk Ticket Subject}*
        // *Ticket ID:* {Freshdesk Ticket ID}
        // *Ticket URL:* {Freshdesk Ticket URL}

        const message = `*${userName}* has started working on *${ticketSubject}*\n*Ticket ID:* ${ticketId}\n*Ticket URL:* ${ticketUrl}`;

        const payload: SlackMessage = {
            text: message, // Fallback
            username: 'Refari Notifier',
            icon_url: 'https://www.refari.co/favicon-32x32.png',
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: `${message}`
                    }
                }
            ]
        };

        try {
            await axios.post(webhookUrl, payload);
        } catch (error) {
            console.error('Slack API Error:', error);
            throw error;
        }
    }
}
