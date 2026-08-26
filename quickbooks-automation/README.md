# Nature's Way Soil QuickBooks Automation

Automated QuickBooks Online integration scaffold for Nature's Way Soil.

## Goals

- Connect QuickBooks Online using Intuit OAuth 2.0
- Pull marketplace settlement summaries (Amazon/Walmart adapters can be added separately)
- Post summarized accounting entries instead of one invoice per marketplace order
- Preserve a clean audit trail for sales, fees, refunds, advertising, shipping, and net deposits
- Run on Google Cloud Run with secrets stored in Google Secret Manager

## Initial setup

1. Create an Intuit Developer app at the Intuit Developer portal.
2. Add the Cloud Run callback URL as an OAuth redirect URI, for example:
   `https://YOUR-SERVICE-URL/oauth/callback`
3. Store these secrets in Google Secret Manager:
   - `QBO_CLIENT_ID`
   - `QBO_CLIENT_SECRET`
   - `QBO_REDIRECT_URI`
   - `QBO_REALM_ID` (populated after authorization or set manually)
   - `QBO_REFRESH_TOKEN` (populated after authorization)
4. Deploy the service with the included `Dockerfile`.
5. Visit `/oauth/start` once and authorize the QuickBooks company.

## Endpoints

- `GET /health` – health check
- `GET /oauth/start` – begin QuickBooks authorization
- `GET /oauth/callback` – exchange authorization code for tokens
- `GET /qbo/company` – verify the QuickBooks connection
- `POST /qbo/settlement` – post a summarized marketplace settlement journal entry

## Settlement payload

```json
{
  "date": "2026-08-25",
  "source": "Amazon",
  "reference": "AMZ-2026-08-25",
  "productSales": 4850,
  "shippingIncome": 125,
  "refunds": 175,
  "referralFees": 720,
  "fulfillmentFees": 540,
  "advertising": 410,
  "netDeposit": 3130
}
```

The service validates that the accounting entry balances before sending it to QuickBooks.

## Important

The account names/IDs used for journal entries should be configured to match your QuickBooks chart of accounts before production posting begins. Start in sandbox mode first.
