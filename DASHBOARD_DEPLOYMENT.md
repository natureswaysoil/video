# Amazon PPC Dashboard Deployment

## Current Status

✅ **Dashboard file deployed** to `docs/index.html` in the main branch
⚠️ **Cloud Run service** is running but hitting rate limits (HTTP 429)

## Dashboard Access

### Option 1: GitHub Pages (Recommended)
1. Go to https://github.com/natureswaysoil/video/settings/pages
2. Under "Build and deployment":
   - Source: Deploy from a branch
   - Branch: `main`
   - Folder: `/docs`
3. Click **Save**
4. Wait 1-2 minutes for deployment
5. Access at: **https://natureswaysoil.github.io/video/**

### Option 2: Local Access
Open the file directly in your browser:
```
file:///workspaces/video/docs/index.html
```

Or on Windows (your current path):
```
file:///C:/Users/User/Desktop/amazon_magic_optimizer.py/PPC_Dashboard.html
```

## Dashboard Details

⚠️ **Important**: The current dashboard shows **sample/static data** only. It does not connect to the Cloud Run service.

The dashboard displays:
- Campaign performance metrics (static)
- Keyword optimization stats (static)
- Budget utilization charts (static)
- Recent activity log (static)

## Cloud Run Service Issues

The amazon-ppc-optimizer service is experiencing:

1. **Rate Limiting (429 errors)**
   - Amazon Ads API has strict rate limits
   - Service is hitting these limits frequently

2. **Instance Availability**
   - Logs show "no available instance" warnings
   - May need to increase min instances

3. **API Errors**
   - Amazon Ads API returning 400 Bad Request
   - Could be authentication or request format issues

## Next Steps to Fix Service

### 1. Check Service Configuration
```bash
gcloud run services describe amazon-ppc-optimizer \
  --region=us-central1 \
  --project=amazon-ppc-474902 \
  --format="yaml(spec.template.spec.containers[0].resources,spec.template.scaling)"
```

### 2. Update Instance Scaling
```bash
gcloud run services update amazon-ppc-optimizer \
  --region=us-central1 \
  --project=amazon-ppc-474902 \
  --min-instances=1 \
  --max-instances=5
```

### 3. Check Recent Logs for Errors
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=amazon-ppc-optimizer" \
  --project=amazon-ppc-474902 \
  --limit=50 \
  --format=json \
  --freshness=1h
```

### 4. Review Amazon Ads API Credentials
- Verify refresh token is valid
- Check if API rate limits have been exceeded
- Confirm profile ID and marketplace settings

## Making Dashboard Dynamic (Future Enhancement)

To connect the dashboard to real data, you would need to:

1. **Add API endpoints** to the Python service to expose metrics
2. **Update dashboard JavaScript** to fetch from these endpoints instead of static data
3. **Handle authentication** between dashboard and service
4. **Implement caching** to reduce API calls to Amazon

Would you like me to:
- Enable live data in the dashboard?
- Fix the rate limiting issues?
- Add API endpoints to expose real metrics?
