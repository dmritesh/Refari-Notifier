# Deployment Guide: Refari Notifier

This application is ready to be deployed to any platform that supports Docker. Below are the two recommended methods.

## Prerequisites
1. **GitHub Repository**: Push your code to a private GitHub repository.
2. **Secrets**: You will need your `.env` values ready.

---

## Method 1: VPS Deployment (Recommended for Cost & Control)
Best for: DigitalOcean (Droplet), AWS (EC2), or Linode.

### 1. Prepare the Server
Launch a Linux server (Ubuntu recommended) and install Docker:
```bash
# Install Docker & Docker Compose
sudo apt-get update
sudo apt-get install docker.io docker-compose -y
```

### 2. Copy the Code
Clone your repository onto the server:
```bash
git clone https://github.com/your-username/hubstaff-automation.git
cd hubstaff-automation
```

### 3. Set Up Environment Variables
Create a production `.env` file:
```bash
nano .env
```
Paste your configuration:
```env
DATABASE_URL=postgresql://postgres:password@postgres:5432/hubstaff_automation?schema=public
MASTER_ENCRYPTION_KEY=your_secure_random_key_here
PORT=3000
NODE_ENV=production
HUBSTAFF_CLIENT_ID=...
HUBSTAFF_CLIENT_SECRET=...
REDIRECT_URI=https://your-domain.com/auth/hubstaff/callback
```

### 4. Deploy
Run the application in the background:
```bash
docker-compose up -d --build
```

---

## Method 2: Platform as a Service (Easiest Setup)
Best for: **Railway.app** or **Render.com**.

### 1. Connect GitHub
Create an account on Railway or Render and connect your GitHub repo.

### 2. Add PostgreSQL
Add a "PostgreSQL" resource to your project. The platform will provide a connection string.

### 3. Configure Service
- **Build Command**: (Automatically handled by Dockerfile)
- **Start Command**: `npm start`
- **Environment Variables**: Add all variables from your `.env` file. 
  - **IMPORTANT**: Set `DATABASE_URL` to the one provided by the platform.

### 4. Public URL
The platform will give you a public URL (e.g., `refari-notifier.up.railway.app`). Update your **Hubstaff App Redirect URI** to match this URL.

---

## Essential Post-Deployment Steps
1. **Hubstaff OAuth**: Visit your public URL `/auth/hubstaff` once to reconnect Hubstaff to the production instance.
2. **Domain**: If using a VPS, set up an A-record pointing to your IP and use Nginx + Certbot for SSL (HTTPS).
