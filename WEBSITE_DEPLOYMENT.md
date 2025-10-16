# Nature's Way Soil Website Deployment Guide

## 🎨 What's Been Updated

### ✅ Completed Redesigns
1. **Homepage** (`pages/index.tsx`)
   - ✅ Light professional overlays (50-75% opacity vs 80-90% dark)
   - ✅ Text in white boxes with backdrop-blur for perfect readability
   - ✅ Removed heavy dark overlays
   - ✅ Clean, modern aesthetic

2. **Product Listing Page** (`pages/products.tsx`)
   - ✅ Complete Tailwind CSS rewrite
   - ✅ Professional card grid layout
   - ✅ Hover effects and transitions
   - ✅ Clean shadows and spacing

### 🎬 Video Integration
- Product videos from WaveSpeed system
- 15 products with video paths mapped

---

## 🚀 Deployment Options

### Option 1: Vercel (Recommended - Easiest)

**Prerequisites:**
- Vercel account connected to GitHub
- `natureswaysoil/coplit-built` repository access

**Steps:**

1. **Via Vercel Dashboard:**
   ```
   1. Go to https://vercel.com
   2. Click "Add New Project"
   3. Select "natureswaysoil/coplit-built" repository
   4. Click "Deploy"
   ```

2. **Via CLI:**
   ```bash
   cd /workspaces/coplit-built
   npm install -g vercel
   vercel login
   vercel --prod
   ```

**Configuration:**
- Framework: Next.js
- Build Command: `npm run build`
- Output Directory: `.next`
- Node Version: 18.x or higher

---

### Option 2: GitHub Actions (Automated)

Create `.github/workflows/deploy.yml` in coplit-built repo:

```yaml
name: Deploy Website

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Build
        run: npm run build
        
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          working-directory: ./
```

---

### Option 3: Google Cloud Run (Similar to Blog System)

**Steps:**

1. **Create Dockerfile** in coplit-built repo:
   ```dockerfile
   FROM node:18-alpine AS deps
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --only=production

   FROM node:18-alpine AS builder
   WORKDIR /app
   COPY --from=deps /app/node_modules ./node_modules
   COPY . .
   RUN npm run build

   FROM node:18-alpine AS runner
   WORKDIR /app
   ENV NODE_ENV production
   COPY --from=builder /app/next.config.js ./
   COPY --from=builder /app/public ./public
   COPY --from=builder /app/.next/standalone ./
   COPY --from=builder /app/.next/static ./.next/static
   EXPOSE 3000
   ENV PORT 3000
   CMD ["node", "server.js"]
   ```

2. **Deploy to Cloud Run:**
   ```bash
   cd /workspaces/coplit-built
   
   gcloud run deploy natureswaysoil-website \
     --source . \
     --project=natureswaysoil-video \
     --region=us-east1 \
     --allow-unauthenticated \
     --port=3000 \
     --memory=1Gi
   ```

---

### Option 4: Netlify

**Via CLI:**
```bash
cd /workspaces/coplit-built
npm install -g netlify-cli
netlify login
netlify init
netlify deploy --prod
```

**Manual:**
1. Go to https://app.netlify.com
2. Click "Add new site" → "Import an existing project"
3. Connect GitHub → Select `natureswaysoil/coplit-built`
4. Build command: `npm run build`
5. Publish directory: `.next`
6. Click "Deploy"

---

## 📋 Pre-Deployment Checklist

Before deploying, verify:

- [ ] All environment variables are set (if needed)
- [ ] Product images are accessible
- [ ] Video paths are correct
- [ ] SSL certificate is configured
- [ ] Custom domain is ready (if applicable)
- [ ] Analytics tracking is set up
- [ ] SEO metadata is complete

---

## 🔧 Required Environment Variables

If your site uses these, add them to your deployment platform:

```bash
# Shopify (if using)
NEXT_PUBLIC_SHOPIFY_DOMAIN=
SHOPIFY_STOREFRONT_ACCESS_TOKEN=

# Analytics (if using)
NEXT_PUBLIC_GA_ID=

# Any other API keys
```

---

## 🌐 Custom Domain Setup

### Vercel:
1. Go to Project Settings → Domains
2. Add your domain: `naturesway soil.com`
3. Update DNS records as instructed

### Cloud Run:
```bash
gcloud run domain-mappings create \
  --service=natureswaysoil-website \
  --domain=www.natureswaysoil.com \
  --region=us-east1
```

---

## 🧪 Testing Before Production

**Local Build Test:**
```bash
cd /workspaces/coplit-built
npm run build
npm start
# Visit http://localhost:3000
```

**Check These Pages:**
- [ ] Homepage: Professional overlays and text readability
- [ ] Products listing: Grid layout, hover effects
- [ ] Individual product pages: Video integration
- [ ] Mobile responsiveness
- [ ] Browser compatibility (Chrome, Safari, Firefox)

---

## 📊 Post-Deployment Monitoring

### Vercel:
- Check deployment logs: https://vercel.com/dashboard
- Analytics: Vercel Analytics dashboard

### Cloud Run:
```bash
# View logs
gcloud run services logs read natureswaysoil-website \
  --region=us-east1 \
  --limit=50

# Service status
gcloud run services describe natureswaysoil-website \
  --region=us-east1
```

---

## 🚨 Rollback Plan

### Vercel:
1. Go to Deployments tab
2. Find previous working deployment
3. Click "..." → "Promote to Production"

### Cloud Run:
```bash
# List revisions
gcloud run revisions list \
  --service=natureswaysoil-website \
  --region=us-east1

# Rollback to specific revision
gcloud run services update-traffic natureswaysoil-website \
  --to-revisions=REVISION_NAME=100 \
  --region=us-east1
```

---

## 💡 Recommended: Vercel Deployment

**Why Vercel:**
- ✅ Built for Next.js (zero config)
- ✅ Automatic HTTPS
- ✅ Global CDN
- ✅ Free SSL certificates
- ✅ Preview deployments for every PR
- ✅ Edge functions support
- ✅ Easy rollbacks

**Deploy Now:**
1. Push your code to GitHub (coplit-built repo)
2. Go to https://vercel.com/new
3. Import `natureswaysoil/coplit-built`
4. Click Deploy
5. Done! Your site is live in ~2 minutes

---

## 📞 Need Help?

- Vercel Docs: https://vercel.com/docs
- Next.js Docs: https://nextjs.org/docs
- Cloud Run Docs: https://cloud.google.com/run/docs

---

**Current Status**: ✅ Code ready for deployment  
**Recommended Platform**: Vercel  
**Estimated Deploy Time**: 2-5 minutes
