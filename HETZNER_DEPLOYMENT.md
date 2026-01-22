# Hetzner Cloud Deployment Guide for Refari Notifier

## Step 1: Create a Hetzner Cloud Server

1. **Log in to Hetzner Cloud Console**: https://console.hetzner.cloud/
2. **Create a New Project** (if you haven't already):
   - Click "New Project"
   - Name it "Refari Notifier" or similar
3. **Create a Server**:
   - Click "Add Server"
   - **Location**: Choose closest to your team (e.g., Nuremberg, Helsinki, etc.)
   - **Image**: Select **Ubuntu 22.04** (LTS)
   - **Type**: 
     - For testing: **CX11** (2GB RAM, 1 vCPU) - €4.15/month
     - For production: **CPX11** (2GB RAM, 2 vCPU) - €4.75/month (Recommended)
   - **Networking**: Leave defaults (IPv4 + IPv6)
   - **SSH Keys**: 
     - If you have an SSH key, add it now
     - Or select "Password" (you'll get root password via email)
   - **Firewall**: We'll configure this after
   - **Backups**: Optional (adds 20% cost but recommended for production)
   - **Name**: `refari-notifier-prod`
   - Click **Create & Buy Now**

4. **Wait for Server Creation** (~30 seconds)
5. **Note down**:
   - Server IP address (e.g., `123.45.67.89`)
   - Root password (if you didn't use SSH key)

---

## Step 2: Connect to Your Server

### Option A: Using Password
```bash
ssh root@YOUR_SERVER_IP
# Enter the password when prompted
```

### Option B: Using SSH Key
```bash
ssh root@YOUR_SERVER_IP
```

---

## Step 3: Initial Server Setup

Once connected, run these commands:

### 1. Update the System
```bash
apt update && apt upgrade -y
```

### 2. Install Required Software
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
apt install docker-compose -y

# Install Git
apt install git -y

# Install UFW (Firewall)
apt install ufw -y
```

### 3. Configure Firewall
```bash
# Allow SSH (IMPORTANT: Do this first!)
ufw allow 22/tcp

# Allow HTTP and HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Allow our app port (3000)
ufw allow 3000/tcp

# Enable firewall
ufw enable
# Type 'y' when prompted

# Check status
ufw status
```

---

## Step 4: Clone and Setup Application

### 1. Clone the Repository
```bash
cd /opt
git clone https://github.com/dmritesh/Refari-Notifier.git
cd Refari-Notifier
```

### 2. Create Production Environment File
```bash
cp .env.example .env
nano .env
```

### 3. Update `.env` with Production Values

Replace the values with your actual credentials:

```env
# Database Connection (use Docker internal network)
DATABASE_URL="postgresql://postgres:YOUR_SECURE_DB_PASSWORD@postgres:5432/hubstaff_automation?schema=public"

# Application Config
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# Master Key for Encryption (IMPORTANT: Use the same one from Render!)
MASTER_ENCRYPTION_KEY="85a63fabd1c9dfe51602d2148f4a4a45"

# Hubstaff OAuth
HUBSTAFF_CLIENT_ID="4O1MtKa5b1bbu-VaRVHxwQFP-VF6kMFdMMYfpWTxQwU"
HUBSTAFF_CLIENT_SECRET="RxD71RdP7UICoj1RHyUdSTVj4WRPU--APZHOu4xC9u8SS-P0gAUMBGOq_povqXd_VEJrL9pGjkKrybnZkNJ9zw"
HUBSTAFF_REDIRECT_URI="http://YOUR_SERVER_IP:3000/auth/hubstaff/callback"

# Admin Dashboard Password
ADMIN_PASSWORD="YOUR_SECURE_PASSWORD_HERE"

# Base URL
BASE_URL="http://YOUR_SERVER_IP:3000"
```

**IMPORTANT**: 
- Replace `YOUR_SERVER_IP` with your actual Hetzner server IP (e.g., `123.45.67.89`)
- Replace `YOUR_SECURE_DB_PASSWORD` with a strong password
- Replace `YOUR_SECURE_PASSWORD_HERE` with a strong admin password
- Keep the same `MASTER_ENCRYPTION_KEY` from before!

Save and exit: `Ctrl+X`, then `Y`, then `Enter`

---

## Step 5: Update Hubstaff OAuth Redirect URI

1. Go to https://developer.hubstaff.com/
2. Edit your OAuth application
3. **Update Redirect URI** to: `http://YOUR_SERVER_IP:3000/auth/hubstaff/callback`
4. Save changes

---

## Step 6: Start the Application

### 1. Build and Start
```bash
docker-compose down  # Stop any existing containers
docker-compose build --no-cache
docker-compose up -d
```

### 2. Check Logs
```bash
# Watch all logs
docker-compose logs -f

# Or just app logs
docker-compose logs -f app
```

You should see:
```
Server listening on port 3000
Starting background worker...
Worker tick: Checking for new activities...
```

### 3. Test the Application
```bash
curl http://localhost:3000/health
# Should return: {"status":"ok"}
```

---

## Step 7: Access the Dashboard

1. Open your browser
2. Go to: `http://YOUR_SERVER_IP:3000`
3. Log in with your `ADMIN_PASSWORD`
4. Go to **Settings**
5. Click **Connect Hubstaff** (re-authorize if needed)
6. Enter your Slack Webhook and Freshdesk API keys
7. Click **Save Settings**
8. Click **Send Test Message** to verify Slack works

---

## Step 8: Set Up Auto-Restart (Production)

To ensure the application always restarts after a reboot:

### 1. Enable Docker to Start on Boot
```bash
systemctl enable docker
```

### 2. Update docker-compose.yml
The services already have `restart: always` in our docker-compose.yml, which ensures they auto-restart.

### 3. Test Reboot (Optional)
```bash
reboot
```

Wait 2 minutes, then SSH back in and check:
```bash
docker-compose -f /opt/Refari-Notifier/docker-compose.yml ps
```

All services should be running.

---

## Step 9: Optional - Set Up Domain & SSL

If you want to use a domain (e.g., `notifier.refari.co`) instead of IP:

### 1. Point Domain to Server
- Go to your DNS provider (Cloudflare, etc.)
- Add an **A record**:
  - Name: `notifier` (or `@` for root domain)
  - Value: `YOUR_SERVER_IP`
  - TTL: Auto or 300

### 2. Install Nginx & Certbot
```bash
apt install nginx certbot python3-certbot-nginx -y
```

### 3. Create Nginx Config
```bash
nano /etc/nginx/sites-available/refari-notifier
```

Paste this:
```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN;  # e.g., notifier.refari.co

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Save and exit.

### 4. Enable Site
```bash
ln -s /etc/nginx/sites-available/refari-notifier /etc/nginx/sites-enabled/
nginx -t  # Test config
systemctl restart nginx
```

### 5. Get SSL Certificate
```bash
certbot --nginx -d YOUR_DOMAIN
# Follow prompts, select "Redirect HTTP to HTTPS"
```

### 6. Update Environment Variables
```bash
cd /opt/Refari-Notifier
nano .env
```

Update:
- `BASE_URL="https://YOUR_DOMAIN"`
- `HUBSTAFF_REDIRECT_URI="https://YOUR_DOMAIN/auth/hubstaff/callback"`

Restart:
```bash
docker-compose restart
```

### 7. Update Hubstaff OAuth Again
Go to https://developer.hubstaff.com/ and update redirect URI to `https://YOUR_DOMAIN/auth/hubstaff/callback`

---

## Step 10: Monitoring & Maintenance

### View Logs
```bash
cd /opt/Refari-Notifier
docker-compose logs -f app
```

### Restart Services
```bash
docker-compose restart
```

### Update Application (when you push new code)
```bash
cd /opt/Refari-Notifier
git pull
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Database Backup (Recommended)
```bash
# Backup
docker-compose exec postgres pg_dump -U postgres hubstaff_automation > backup_$(date +%Y%m%d).sql

# Restore (if needed)
docker-compose exec -T postgres psql -U postgres hubstaff_automation < backup_20260120.sql
```

---

## Troubleshooting

### Check if services are running
```bash
docker-compose ps
```

### Check disk space
```bash
df -h
```

### Check memory usage
```bash
free -h
```

### Restart everything
```bash
cd /opt/Refari-Notifier
docker-compose down
docker-compose up -d
```

### View database
```bash
docker-compose exec postgres psql -U postgres -d hubstaff_automation -c "SELECT * FROM \"Organization\";"
```

---

## Cost Estimate

- **Hetzner CPX11**: €4.75/month (~$5.15/month)
- **Backups** (optional): +€0.95/month
- **Total**: ~€5.70/month (~$6.10/month)

**Compared to Render Free Tier**: Your app will run 24/7 without sleeping! 🚀

---

## Security Recommendations

1. **Change SSH Port** (optional but recommended):
   ```bash
   nano /etc/ssh/sshd_config
   # Change Port 22 to Port 2222
   systemctl restart sshd
   ufw allow 2222/tcp
   ufw delete allow 22/tcp
   ```

2. **Set up fail2ban** (prevents brute force attacks):
   ```bash
   apt install fail2ban -y
   systemctl enable fail2ban
   systemctl start fail2ban
   ```

3. **Regular Updates**:
   ```bash
   apt update && apt upgrade -y
   ```

4. **Enable Automatic Security Updates**:
   ```bash
   apt install unattended-upgrades -y
   dpkg-reconfigure -plow unattended-upgrades
   ```

---

## Quick Reference Commands

```bash
# Go to app directory
cd /opt/Refari-Notifier

# View logs
docker-compose logs -f

# Restart app
docker-compose restart app

# Restart everything
docker-compose restart

# Update code
git pull && docker-compose down && docker-compose build --no-cache && docker-compose up -d

# Check running containers
docker-compose ps

# Access database
docker-compose exec postgres psql -U postgres -d hubstaff_automation
```

---

**You're all set!** Your Refari Notifier will now run 24/7 on Hetzner without sleeping. 🎉
