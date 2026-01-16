import axios from 'axios';

// Interfaces for Hubstaff API responses
interface HubstaffActivity {
    id: number;
    user_id: number;
    task_id: number;
    task?: {
        id: number;
        summary: string;
        remote_id: string | null;
        remote_alternate_id?: string | null;
    };
    time_slot: string;
}

interface HubstaffResponse {
    activities: HubstaffActivity[];
    pagination?: {
        next_page_start_id?: number;
    };
}

export class HubstaffService {
    private static BASE_URL = 'https://api.hubstaff.com/v2';
    private static userCache: Map<number, string> = new Map();
    private static taskCache: Map<number, { name: string, remote_id: string | null }> = new Map();

    static async getRecentActivities(
        token: string,
        hubstaffOrgId: string,
        startTime: string,
        cursor?: number
    ): Promise<HubstaffActivity[]> {
        try {
            const url = `${this.BASE_URL}/organizations/${hubstaffOrgId}/activities`;
            const response = await axios.get<HubstaffResponse>(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
                params: {
                    'time_slot[start]': startTime,
                    'time_slot[stop]': new Date().toISOString(),
                    'page_start_id': cursor
                }
            });

            return response.data.activities || [];
        } catch (error) {
            console.error('Hubstaff API Error:', error);
            throw error;
        }
    }

    static async getUserName(token: string, userId: number): Promise<string> {
        if (this.userCache.has(userId)) {
            return this.userCache.get(userId)!;
        }

        try {
            const response = await axios.get(`${this.BASE_URL}/users/${userId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                }
            });

            const userName = response.data.user.name;
            this.userCache.set(userId, userName);
            return userName;
        } catch (error) {
            console.error(`Failed to fetch user name for ${userId}:`, error);
            return `User ${userId}`;
        }
    }

    static async getTask(token: string, taskId: number): Promise<{ name: string, remote_id: string | null, remote_alternate_id: string | null, projectId: number, projectName: string }> {
        if (this.taskCache.has(taskId)) {
            return this.taskCache.get(taskId)! as any;
        }

        try {
            const response = await axios.get(`${this.BASE_URL}/tasks/${taskId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                }
            });

            const task = response.data.task;
            let projectName = 'Unknown Project';
            let projectId = task.project_id || 0;

            if (projectId) {
                try {
                    const projectResp = await axios.get(`${this.BASE_URL}/projects/${projectId}`, {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                        }
                    });
                    projectName = projectResp.data.project?.name || 'Unknown Project';
                } catch (pErr) {
                    console.error(`Failed to fetch project ${projectId} for task ${taskId}`);
                }
            }

            const taskData = {
                name: task.summary || `Task ${taskId}`,
                remote_id: task.remote_id || null,
                remote_alternate_id: task.remote_alternate_id || null,
                projectId: projectId,
                projectName: projectName
            };
            this.taskCache.set(taskId, taskData);
            return taskData;
        } catch (error) {
            console.error(`Failed to fetch task ${taskId}:`, error);
            return { name: `Task ${taskId}`, remote_id: null, remote_alternate_id: null, projectId: 0, projectName: 'Unknown Project' };
        }
    }
}
