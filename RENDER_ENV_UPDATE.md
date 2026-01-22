# Render Environment Variable Update

## Add BASE_URL to Render

The Connect Hubstaff button requires the `BASE_URL` environment variable to generate the correct OAuth redirect URL.

### Steps:

1. Go to https://dashboard.render.com
2. Click on your **refari-notifier** service
3. Go to **Environment** tab
4. Click **Add Environment Variable**
5. Add:
   - **Key**: `BASE_URL`
   - **Value**: `https://refari-notifier.onrender.com`
6. Click **Save Changes**
7. Render will automatically redeploy with the new environment variable

### Why this is needed:

The backend needs to know its own public URL to generate the Hubstaff OAuth callback URL. Without this, it tries to use `request.hostname` which may not include the protocol or may be incorrect on Render's infrastructure.

Once this is added, the `/admin/organizations/:id` endpoint will return the correct `auth_url` and the Connect Hubstaff button will appear!
