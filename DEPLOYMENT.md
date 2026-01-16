# Deployment Guide for Refari Notifier

This guide explains how to deploy the Hubstaff Automation Service to a cloud provider.

## Security Overview (Already Implemented)
- **Data Encryption**: All API keys (Slack, Freshdesk, GitLab, Hubstaff) are encrypted using AES-256 before storage in PostgreSQL.
- **SQL Injection Protection**: The application uses Prisma ORM, which automatically parameterizes queries.
- **Admin Authentication**: The dashboard is protected by Basic Authentication (`admin` / `ADMIN_PASSWORD`).
- **Secure Handling**: Logs strip sensitive data.

## Option 1: Deploy on a DigitalOcean Droplet (Recommended)
This approach gives you full control and is the most cost-effective (~$6/month).

### 1. Create a Droplet
- **Image**: Docker on Ubuntu (DigitalOcean Marketplace) or generic Ubuntu 22.04.
- **Size**: Basic Droplet (1GB RAM is sufficient).

### 2. Prepare the Server
SSH into your server:
```bash
ssh root@your_server_ip
```

Clone your repository (or copy files manually). Ideally, use a private Git repo:
```bash
git clone https://github.com/your-user/hubstaff-automation.git
cd hubstaff-automation
```

### 3. Configure Environment
Create the production `.env` file:
```bash
cp .env.example .env
nano .env
```
**CRITICAL**: Set a strong `ADMIN_PASSWORD` and `MASTER_ENCRYPTION_KEY`.
```env
# ... database url ...
MASTER_ENCRYPTION_KEY=YourSuperStrongRandomString32Chars!
ADMIN_PASSWORD=YourStrongAdminPassword
NODE_ENV=production
```

### 4. Run with Docker Compose
```bash
docker compose up -d --build
```

### 5. Access
- Dashboard: `http://your_server_ip:3000`
- Log in with User: `admin`, Password: `YourStrongAdminPassword`

---

## Option 2: Deploy on Railway (Easier)
Railway manages the infrastructure for you.

1.  **Fork/Upload** this code to a GitHub Repository.
2.  Login to **Railway.app**.
3.  **New Project** -> Deploy from GitHub.
4.  **Add Database**: Add a PostgreSQL service in Railway.
5.  **Variables**: In the "Variables" tab for your App service, add:
    - `DATABASE_URL`: (Railway provides this from the Postgres service)
    - `MASTER_ENCRYPTION_KEY`: (Generate one)
    - `ADMIN_PASSWORD`: (Set one)
    - `NODE_ENV`: `production`
    - `HUBSTAFF_CLIENT_ID`: from Hubstaff
    - `HUBSTAFF_CLIENT_SECRET`: from Hubstaff
    - `PUBLIC_URL`: `https://your-railway-app-url.up.railway.app`
6.  **Build Command**: `npm run build`
7.  **Start Command**: `npm start`

And you are live!
