# Product Video Automation Engine

**Licensed product-catalog-to-video automation system for ecommerce brands.**

This repository turns structured product data into platform-ready product video assets, scripts, captions, and posting workflows for Amazon, Shopify, Walmart Marketplace, TikTok, YouTube Shorts, Instagram, Facebook, Pinterest, and brand websites.

Originally built and tested with Nature's Way Soil products, the engine is designed to support many product categories by swapping in client-specific product data, brand rules, claims language, templates, and media libraries.

## What it does

- Reads product rows from a CSV or Google Sheet export
- Generates product-specific video scripts and hooks
- Produces Amazon/product video and short-form social variants
- Supports HeyGen avatar workflows
- Supports B-roll/media sourcing workflows
- Supports scheduling/export workflows for multi-platform campaigns
- Keeps brand rules, product claims, and platform output formats configurable

## Leasing model

This codebase is intended for **licensed deployments**, not open-source redistribution.

Recommended commercial offer:

- Setup fee: $2,500-$7,500 per client brand
- Monthly license: $799-$2,500 per month
- Agency/white-label license: custom pricing
- Client receives a non-exclusive right to use the system for their own brand/products
- Nature's Way Soil & Vermicompost LLC retains ownership of the core software, templates, workflows, and automation logic

See [`docs/legal/LICENSE_NOTICE.md`](docs/legal/LICENSE_NOTICE.md) and [`docs/sales/LEASE_READY_OFFER.md`](docs/sales/LEASE_READY_OFFER.md).

## Important security note

Do **not** commit API keys, access tokens, customer product sheets, private footage, generated client videos, or `.env` files.

Use `.env.example` as the setup template and store real secrets in environment variables, GitHub Actions secrets, Google Cloud Secret Manager, Vercel environment variables, or another secure secrets manager.

## Quick start

```bash
npm install
cp .env.example .env
npm run typecheck
npm run validate
npm run test:e2e:dry
```

Then configure the product feed and provider keys in `.env`.

## Clean demo product sheet

A polished demo product sheet is included at:

```text
data/demo-products-clean.csv
```

It includes five clean demo products:

1. Hay, Pasture & Lawn Fertilizer
2. Dog Urine Neutralizer & Lawn Revitalizer
3. Liquid Humic & Fulvic Acid with Organic Kelp
4. Liquid Kelp Fertilizer
5. Liquid Biochar with Humates

Use this sheet for buyer demos instead of a messy working product sheet. For local testing, either point `CSV_URL` to a hosted/raw copy of this CSV or upload these columns into a Google Sheet and use the Google Sheet CSV export URL.

## Lease demo command

Use this when showing the system to a potential client or testing that the engine can produce a finished demo video.

Required environment variables:

- `OPENAI_API_KEY`
- `HEYGEN_API_KEY`

Recommended environment variables:

- `CSV_URL` or `GOOGLE_SHEET_CSV_URL`
- `PEXELS_API_KEY`

Run:

```bash
npm run demo:lease
```

The command checks required credentials, reads the product feed, generates a script, starts a HeyGen render, waits for completion, and prints the finished video URL.

## Core scripts

```bash
npm run dev              # Run CLI workflow
npm run demo:lease       # Run one clean lease demo video
npm run one:video        # Generate one good video
npm run amazon:video     # Generate Amazon product video flow
npm run schedule         # Run scheduler
npm run validate         # Validate system configuration
npm run test:all         # CSV + OpenAI + dry E2E checks
```

## Deployment checklist

Before leasing this to a client:

1. Create a private client deployment branch or separate private repo.
2. Replace Nature's Way Soil brand assets with client-approved assets.
3. Configure client product CSV/Google Sheet.
4. Add client-specific claims/disclaimer rules.
5. Add provider API keys through a secrets manager only.
6. Run `npm run validate` and `npm run test:e2e:dry`.
7. Generate 3-5 sample videos for approval.
8. Execute a written license/subscription agreement before production use.

## Existing guides

- [Test Video Campaign Guide](TEST_VIDEO_CAMPAIGN_GUIDE.md)
- [Video Enhancement Plan](docs/guides/VIDEO_ENHANCEMENT_PLAN.md)
- [Deployment Guide](docs/deployment/GCLOUD_DEPLOYMENT.md)
- [Operations Runbook](docs/operations/OPERATIONS_RUNBOOK.md)
- [Testing Guide](docs/development/TESTING_GUIDE.md)
