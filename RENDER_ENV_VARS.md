# Required Environment Variables for Render

## Critical Variables (App will crash without these):

### 1. **MASTER_ENCRYPTION_KEY**
- **Value**: A 32-character random string (for AES-256 encryption)
- **Example**: `abcdef1234567890abcdef1234567890`
- **Generate one**: Run this in terminal:
  ```bash
  openssl rand -hex 16
  ```

### 2. **ADMIN_PASSWORD**
- **Value**: Your admin dashboard password
- **Example**: `your_secure_password_here`

### 3. **HUBSTAFF_CLIENT_ID**
- **Value**: Your Hubstaff OAuth Client ID
- **Get it from**: https://developer.hubstaff.com/

### 4. **HUBSTAFF_CLIENT_SECRET**
- **Value**: Your Hubstaff OAuth Client Secret
- **Get it from**: https://developer.hubstaff.com/

### 5. **HUBSTAFF_REDIRECT_URI**
- **Value**: `https://refari-notifier.onrender.com/auth/hubstaff/callback`

### 6. **BASE_URL**
- **Value**: `https://refari-notifier.onrender.com`

### 7. **DATABASE_URL**
- **Value**: Should be automatically set by Render when you add a PostgreSQL database
- **Format**: `postgresql://user:password@host:port/database`

## Optional Variables:

### 8. **PORT**
- **Value**: `3000` (Render sets this automatically, but you can override)

### 9. **NODE_ENV**
- **Value**: `production`

### 10. **LOG_LEVEL**
- **Value**: `info` or `debug`

---

## How to Add These to Render:

1. Go to https://dashboard.render.com
2. Click on your **refari-notifier** service
3. Go to **Environment** tab
4. For each variable above, click **Add Environment Variable**
5. Enter the **Key** and **Value**
6. Click **Save Changes**

Render will automatically redeploy after you save.

---

## Most Likely Missing:

Based on the 500 errors, you're probably missing:
- ✅ **MASTER_ENCRYPTION_KEY** (causes encryption to fail)
- ✅ **ADMIN_PASSWORD** (causes auth to fail)
- ✅ **HUBSTAFF_CLIENT_ID** and **HUBSTAFF_CLIENT_SECRET** (causes OAuth to fail)

Add these first, then check the logs!
