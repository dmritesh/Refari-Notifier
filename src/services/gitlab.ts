import axios from 'axios';

interface GitLabIssue {
    id: number;
    iid: number;
    project_id: number;
    title: string;
    description: string;
    web_url: string;
}

export class GitLabService {
    static async getIssue(domain: string, apiKey: string, projectPath: string, issueIid: string | number): Promise<GitLabIssue> {
        try {
            // GitLab API version 4
            // Project path needs to be URL encoded (e.g., refari/widget -> refari%2Fwidget)
            const encodedPath = encodeURIComponent(projectPath);
            const url = `https://${domain}/api/v4/projects/${encodedPath}/issues/${issueIid}`;

            const response = await axios.get<GitLabIssue>(url, {
                headers: {
                    'PRIVATE-TOKEN': apiKey
                }
            });

            return response.data;
        } catch (error) {
            console.error(`GitLab API Error (Issue ${issueIid}):`, error);
            throw error;
        }
    }
}
