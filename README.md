# Hubstaff-Freshdesk-Slack Automation

This service automates the workflow of tracking Hubstaff timers, linking them to Freshdesk tickets, and notifying Slack. It replaces a legacy Zapier workflow.

## Features
- **Polling**: Checks Hubstaff activites every 60 seconds.
- **Deduplication**: Uses a "Time Bucket" strategy (2-hour buckets) to prevent duplicate alerts for the same task.
- **Integration**: Fetches Freshdesk ticket details and posts formatted Slack messages.
- **Secure**: All API tokens are encrypted in the database.

## Architecture
- **Language**: TypeScript (Node.js)
- **Web Framework**: Fastify
- **Database**: PostgreSQL (Prisma ORM)
- **Worker**: Cron-based background worker

## Setup

### Prerequisites
- Docker and Docker Compose
- Node.js v20+ (for local dev)

### Environment Variables
Copy `.env.example` to `.env` and fill in:
- `MASTER_ENCRYPTION_KEY`: A 32-character random string.
- `DATABASE_URL`: Connection string.

### Running Locally
```bash
docker-compose up --build
```

## Deduplication Logic (Zapier Replication)
The service replicates the Zapier specific logic:
1. **Bucket Calculation**: `floor(current_timestamp / 7200)` (2-hour buckets).
2. **Unique Request**: A unique key is formed by `(org_id, hubstaff_user_id, hubstaff_task_id, bucket)`.
3. If this key exists in `processed_events`, the action is skipped.
# Refari-Notifier
