import axios from 'axios';

interface FreshdeskTicket {
    id: number;
    subject: string;
    // Add other fields as needed
}

export class FreshdeskService {
    static async getTicket(domain: string, apiKey: string, ticketId: string | number): Promise<FreshdeskTicket> {
        try {
            const auth = Buffer.from(`${apiKey}:X`).toString('base64');
            const url = `https://${domain}/api/v2/tickets/${ticketId}`;

            const response = await axios.get<FreshdeskTicket>(url, {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                }
            });

            return response.data;
        } catch (error) {
            console.error(`Freshdesk API Error (Ticket ${ticketId}):`, error);
            throw error;
        }
    }

    static getTicketUrl(domain: string, ticketId: number): string {
        return `https://${domain}/a/tickets/${ticketId}`;
    }
}
