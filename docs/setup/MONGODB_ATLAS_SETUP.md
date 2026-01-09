# MongoDB Atlas M0 Setup Guide

**Time Required**: 15 minutes
**Cost**: FREE (M0 tier)

This guide walks you through setting up MongoDB Atlas M0 (free tier) for Tamshai Enterprise AI Phase 1 GCP deployment.

---

## Step 1: Create MongoDB Atlas Account

1. **Open your browser** and go to: https://cloud.mongodb.com/

2. **Sign up** with one of these options:
   - Google account (recommended - fastest)
   - GitHub account
   - Email address

3. **Verify your email** (if using email signup)

4. **Skip** any welcome surveys/tutorials - click "I'll do this later"

---

## Step 2: Create M0 Free Cluster

1. **Click "Build a Database"** (green button on the dashboard)

2. **Select deployment type**:
   - Click **"M0"** under the FREE tier
   - Should show **"FREE"** badge

3. **Configure cluster**:
   - **Cloud Provider**: Select **Google Cloud** (for lower latency with GCP)
   - **Region**: Select **Iowa (us-central1)** (matches your GCP region)
   - **Cluster Name**: `tamshai-prod` (or keep default)

4. **Click "Create Cluster"**
   - Provisioning takes 1-3 minutes
   - You'll see a progress indicator

---

## Step 3: Create Database User

1. **Security Quickstart** will appear automatically
   - If not, go to **Database Access** in left sidebar

2. **Click "Add New Database User"**

3. **Configure user**:
   - **Authentication Method**: Password
   - **Username**: `tamshai_app`
   - **Password**: Click "Autogenerate Secure Password" (SAVE THIS!)
     - OR create your own strong password (min 8 characters)
   - **Copy the password** to a secure location (you'll need it in Step 6)

4. **Database User Privileges**:
   - Select **"Read and write to any database"**

5. **Click "Add User"**

---

## Step 4: Configure Network Access

1. **Go to "Network Access"** in left sidebar

2. **Click "Add IP Address"**

3. **For initial setup** (you'll restrict this later):
   - Click **"Allow Access from Anywhere"**
   - Confirms to `0.0.0.0/0`
   - **Note**: After GCP deployment, you'll update this to Cloud Run's egress IP

4. **Click "Confirm"**

---

## Step 5: Get Connection String

1. **Go to "Database"** in left sidebar

2. **Click "Connect"** button on your cluster

3. **Select "Connect your application"**

4. **Driver configuration**:
   - **Driver**: Node.js
   - **Version**: 5.5 or later

5. **Copy the connection string**:
   ```
   mongodb+srv://tamshai_app:<password>@tamshai-prod.xxxxx.mongodb.net/
   ```

6. **Replace `<password>`** with the actual password from Step 3

7. **Add database name** at the end:
   ```
   mongodb+srv://tamshai_app:YOUR_PASSWORD@tamshai-prod.xxxxx.mongodb.net/tamshai
   ```

---

## Step 6: Save Connection String

**CRITICAL**: Save your connection string securely.

**Option A: Save to environment variable (recommended)**
```bash
# Windows (PowerShell)
$env:MONGODB_ATLAS_URI = "mongodb+srv://tamshai_app:YOUR_PASSWORD@tamshai-prod.xxxxx.mongodb.net/tamshai"

# macOS/Linux (bash/zsh)
export MONGODB_ATLAS_URI="mongodb+srv://tamshai_app:YOUR_PASSWORD@tamshai-prod.xxxxx.mongodb.net/tamshai"
```

**Option B: Save to temporary file**
```bash
echo "mongodb+srv://tamshai_app:YOUR_PASSWORD@tamshai-prod.xxxxx.mongodb.net/tamshai" > mongodb-uri.txt
```

**⚠️ NEVER commit this to git!**

---

## Step 7: Verify Connection

Test the connection string before using it in Terraform:

```bash
# Install MongoDB shell (mongosh) if not already installed
# macOS: brew install mongosh
# Windows: winget install MongoDB.Shell
# Linux: sudo apt-get install -y mongodb-mongosh

# Test connection
mongosh "mongodb+srv://tamshai_app:YOUR_PASSWORD@tamshai-prod.xxxxx.mongodb.net/tamshai"
```

Expected output:
```
Current Mongosh Log ID: 65abc123...
Connecting to: mongodb+srv://...
Using MongoDB: 7.0.x
Using Mongosh: 2.x.x

tamshai>
```

Type `exit` to quit.

---

## Troubleshooting

### "Authentication failed"
- Double-check password is correct
- Ensure you replaced `<password>` in connection string
- Password cannot contain special characters like `@`, `:`, `/` in URI (use URL encoding)

### "Connection timeout"
- Check Network Access allows `0.0.0.0/0`
- Verify cluster is fully provisioned (no "Provisioning..." status)
- Try different region if Iowa is unavailable

### "Cannot connect to cluster"
- Ensure you're using `mongodb+srv://` (not `mongodb://`)
- Verify cluster name matches in connection string
- Check for typos in connection string

---

## Post-Deployment: Restrict Network Access

After deploying to GCP Cloud Run, restrict access:

1. **Get Cloud Run egress IP**:
   ```bash
   # This will be provided after terraform apply
   terraform output utility_vm_ip
   ```

2. **Update Network Access in MongoDB Atlas**:
   - Go to Network Access
   - Delete `0.0.0.0/0` entry
   - Add Cloud Run's NAT IP addresses

---

## Next Steps

✅ You now have:
- MongoDB Atlas M0 cluster running
- Database user `tamshai_app` created
- Connection URI saved

**Continue to**: Configure `terraform.tfvars` with this connection URI

---

*MongoDB Atlas Free Tier Limits*:
- 512MB storage
- Shared RAM
- Shared vCPU
- No backups (upgrade to M2+ for backups)
- Perfect for Phase 1 low-traffic deployment
