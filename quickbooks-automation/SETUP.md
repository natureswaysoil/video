# QuickBooks Online connection checklist

## 1. Create the Intuit app

Create an app in the Intuit Developer portal for QuickBooks Online Accounting.

Start with **Sandbox** keys, not Production.

Set the redirect URI to:

`https://YOUR-CLOUD-RUN-URL/oauth/callback`

## 2. Deploy the service

From the repository root:

```bash
cd quickbooks-automation
bash deploy-cloud-run.sh
```

The script prints the Cloud Run URL.

## 3. Configure Cloud Run secrets/environment

Required values:

- `QBO_CLIENT_ID`
- `QBO_CLIENT_SECRET`
- `QBO_REDIRECT_URI`
- `QBO_ENV=sandbox`
- `QBO_WRITE_ENABLED=false`

The OAuth callback stores the QuickBooks company realm ID and rotating refresh token in Google Secret Manager as:

- `qbo-realm-id`
- `qbo-refresh-token`

The Cloud Run runtime service account needs Secret Manager access plus permission to create secret versions.

## 4. Authorize QuickBooks once

Open:

`https://YOUR-CLOUD-RUN-URL/oauth/start`

Sign into Intuit, select the correct QuickBooks company, and approve access.

Then verify:

`https://YOUR-CLOUD-RUN-URL/qbo/company`

## 5. Map the chart of accounts

The default mappings are placeholders. Confirm the exact QuickBooks account names or IDs before enabling writes:

- Clearing/bank account for marketplace payouts
- Product sales income
- Shipping income
- Refunds/allowances
- Marketplace/referral fees
- Fulfillment fees
- Advertising

## 6. Test a settlement without writing

Keep `QBO_WRITE_ENABLED=false` and POST a settlement to `/qbo/settlement`. The endpoint will return the exact journal entry it would create.

Use `/qbo/settlement/preview` if you only want balance validation and no QuickBooks account lookup.

## 7. Enable production writes only after review

After sandbox entries and account mappings are correct:

- move the Intuit app to Production credentials
- set `QBO_ENV=production`
- authorize the production QuickBooks company again
- set `QBO_WRITE_ENABLED=true`

## Recommended accounting model

Do not create one QuickBooks invoice for every Amazon/Walmart order. Create one balanced summary entry per marketplace settlement/deposit so the QuickBooks clearing/bank amount matches the actual payout while fees, refunds, advertising, and revenue remain visible on the P&L.
