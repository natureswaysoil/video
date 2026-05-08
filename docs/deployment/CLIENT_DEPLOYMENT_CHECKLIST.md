# Client Deployment Checklist

Use this checklist before leasing the Product Video Automation Engine to a customer.

## 1. Business approval

- Signed license/subscription agreement is complete
- Setup fee is paid
- First monthly license payment is paid
- Client contact and billing contact are recorded
- Client has confirmed approved product categories and platforms

## 2. Repository and access

- Do not give the client access to the core repository unless the agreement specifically allows it
- Prefer a private deployment repository, private fork, or hosted environment controlled by Nature's Way Soil
- Remove Nature's Way Soil private brand assets from the client deployment
- Confirm no `.env`, API key, generated client videos, or customer spreadsheets are committed
- Set package license to `UNLICENSED`

## 3. Secrets

Store real credentials in a secrets manager only:

- GitHub Actions Secrets
- Google Cloud Secret Manager
- Vercel environment variables
- Cloud Run environment variables
- Another approved secrets vault

Never store credentials in:

- README files
- Screenshots
- Product CSV files
- Source code
- Public GitHub issues
- Public pull requests

## 4. Client product feed

Required feed columns:

- Product ID / SKU
- Brand name
- Product name
- Size / unit count
- Short description
- Main benefits
- Target customer
- Problem solved
- Directions / how to use
- Approved claims
- Restricted claims / avoid words
- Product URL
- Image URL or media folder path
- CTA URL

## 5. Brand configuration

Collect and approve:

- Logo files
- Brand colors
- Website URL
- Product image folder
- Voice/tone rules
- Disclaimers
- Required legal language
- Platform claim restrictions
- Customer support URL/email

## 6. Platform setup

Confirm which outputs are enabled:

- Amazon product video
- Shopify product page video
- Walmart Marketplace video
- TikTok/Reels/Shorts vertical video
- YouTube Shorts
- Facebook/Instagram
- Pinterest
- Website/landing page embed

## 7. Dry run

Run:

```bash
npm install
npm run typecheck
npm run validate
npm run test:e2e:dry
```

Then generate:

- 1 short-form video
- 1 Amazon/product video
- 1 how-to-use video
- 1 product benefit video
- 1 brand-safe caption set

## 8. Client approval

Client must approve:

- Product claims
- Visual style
- CTA
- Platform formats
- Voiceover/avatar style
- Sample captions
- Disclaimers

## 9. Launch controls

Before switching off dry-run mode:

- Confirm posting accounts are correct
- Confirm campaign schedule
- Confirm rate limits
- Confirm fail-safe logging
- Confirm approval workflow if client requires manual approval before posting

## 10. Monthly operations

Each month:

- Review generated output quality
- Update product feed
- Refresh seasonal hooks
- Check failed jobs
- Check platform API changes
- Confirm client account remains paid/current
- Archive old generated assets if needed

## 11. Termination

If client stops paying or cancels:

- Disable access and scheduled jobs
- Remove client API keys from the deployment
- Stop generating/posting content
- Export final approved deliverables only if the agreement allows it
- Keep core software and reusable templates under Nature's Way Soil control
