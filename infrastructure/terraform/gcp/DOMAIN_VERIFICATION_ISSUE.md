# Static Website Bucket - Domain Verification Issue

**Status**: ❌ BLOCKED - After 8+ hours and enabling Site Verification API
**Error**: `Error 403: Another user owns the domain prod.tamshai.com or a parent domain`

---

## Root Cause Analysis

The issue is **NOT** propagation delay. After enabling `siteverification.googleapis.com` API, the error persists. This points to a Search Console configuration problem.

---

## Diagnostic Checklist

### ✅ Step 1: Verify Correct Google Account
1. Go to: https://search.google.com/search-console
2. Check top-right corner - should show: **jcore3@gmail.com**
3. If different account, sign out and sign in with jcore3@gmail.com

### ✅ Step 2: Check Property Type (CRITICAL)
**Issue**: Must be "Domain" property, NOT "URL prefix"

**How to check**:
1. In Search Console, look at your properties list
2. Find `tamshai.com` entry
3. Check the icon:
   - ✅ **Domain icon** (globe/planet symbol) = CORRECT
   - ❌ **URL icon** (chain link symbol) = WRONG

**If you see URL prefix (`https://tamshai.com`)**:
1. Delete the URL prefix property
2. Click "+ Add property"
3. Select "Domain" (not URL prefix)
4. Enter: `tamshai.com`
5. Copy the TXT record
6. Add to Cloudflare DNS:
   ```
   Type: TXT
   Name: @
   Value: google-site-verification=xxxxxxxxxxxxx
   ```
7. Wait 5 minutes, then click "Verify"

### ✅ Step 3: Check Verification Status
1. In Search Console, click on `tamshai.com` property
2. Go to "Settings" (gear icon)
3. Check "Ownership verification" section
4. Should show: **Verified** with green checkmark
5. Verification method should be: **DNS record**

### ✅ Step 4: Check DNS TXT Record
Verify the TXT record exists in Cloudflare:

```bash
nslookup -type=TXT tamshai.com
# Should show: google-site-verification=xxxxxxxxxxxxx
```

Or use online tool: https://mxtoolbox.com/SuperTool.aspx?action=txt%3atamshai.com

### ✅ Step 5: Re-verify in Search Console
Even if it shows "Verified", try re-verifying:

1. Settings > Ownership verification
2. Click on "DNS record" verification method
3. Click "Verify" again
4. Should confirm verification success

---

## Alternative Solutions (If Above Fails)

### Option A: Use Different Subdomain
Instead of `prod.tamshai.com`, use one of these:
- `www.tamshai.com`
- `app.tamshai.com`
- `static.tamshai.com`
- `web.tamshai.com`

**In terraform.tfvars**:
```hcl
static_website_domain = "www.tamshai.com"  # or app, static, web
```

### Option B: Cloud Run Static Hosting (Recommended Alternative)
Deploy static files via nginx container on Cloud Run (no domain verification needed):

**Pros**:
- No Search Console verification required
- Automatic HTTPS with custom domains
- Better performance (Cloud CDN)
- Easier to manage

**Implementation**:
1. Create `Dockerfile` with nginx serving static files
2. Deploy to Cloud Run
3. Map `prod.tamshai.com` directly to Cloud Run URL

### Option C: Cloud Storage + Load Balancer
Use regular (non-website) bucket + HTTP(S) Load Balancer:
- No domain verification needed
- Better for production anyway (Cloud CDN, SSL, DDoS protection)
- More expensive (~$18/month vs free bucket)

---

## What We've Already Tried

- ✅ Enabled `siteverification.googleapis.com` API
- ✅ Waited 8+ hours (ruled out propagation)
- ✅ Verified jcore3@gmail.com owns GCP project
- ✅ Confirmed bucket name doesn't exist globally
- ✅ Checked claude-deployer SA has storage.admin role

---

## Next Steps

**Immediate**:
1. Complete the diagnostic checklist above
2. Report findings (especially Step 2 - property type)

**If blocked on verification**:
- **Option A** (easiest): Use `www.tamshai.com` instead
- **Option B** (best): Deploy static site via Cloud Run (no verification needed)

---

## Debugging Commands

```bash
# Check if bucket exists globally
gcloud storage buckets describe gs://prod.tamshai.com

# List all GCP-verified domains
gcloud domains list-user-verified --project=gen-lang-client-0553641830

# Check DNS TXT record
nslookup -type=TXT tamshai.com
```

---

*Created: 2026-01-09*
*Issue Duration: 8+ hours*
