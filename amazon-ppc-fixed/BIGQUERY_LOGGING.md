# BigQuery Audit Logging for Amazon PPC Optimizer

## Overview

The Amazon PPC Optimizer now includes BigQuery audit logging to track all optimizer runs, errors, and events in a centralized BigQuery table for analysis and auditing.

## Configuration

### BigQuery Settings

The following configuration is used in `bigquery_logger.py`:

```python
PROJECT_ID = "amazon-ppc-474902"   # GCP Project ID
DATASET_ID = "amazon_ppc"          # BigQuery Dataset
TABLE_ID = "optimizer_run_events"  # BigQuery Table
```

### Table Schema

The `optimizer_run_events` table has the following schema:

| Column | Type | Mode | Description |
|--------|------|------|-------------|
| `run_timestamp` | TIMESTAMP | REQUIRED | When the event occurred |
| `status` | STRING | REQUIRED | Event status (INFO, ERROR, WARNING, SUCCESS) |
| `details` | STRING | REQUIRED | Event details/message |
| `run_id` | STRING | NULLABLE | Unique run identifier |
| `job_name` | STRING | NULLABLE | Name of the optimizer job (e.g., "Bid Optimizer") |

## Prerequisites

### 1. Install Dependencies

Add the BigQuery client library to your Python environment:

```bash
pip install google-cloud-bigquery>=3.11.0
```

Or install from requirements.txt:

```bash
pip install -r requirements.txt
```

### 2. Set Up GCP Authentication

The BigQuery logger uses Application Default Credentials (ADC). Set up authentication:

#### Option A: Service Account Key (Recommended for Production)

1. Create a service account in GCP Console
2. Grant the "BigQuery Data Editor" role
3. Download the JSON key file
4. Set the environment variable:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
```

#### Option B: User Credentials (For Development)

```bash
gcloud auth application-default login
```

### 3. Create BigQuery Table

#### Option A: Using the Python Script

Run the table creation function:

```python
from bigquery_logger import create_table_if_not_exists

create_table_if_not_exists()
```

#### Option B: Using bq Command Line

```bash
bq mk --table \
  amazon-ppc-474902:amazon_ppc.optimizer_run_events \
  run_timestamp:TIMESTAMP,status:STRING,details:STRING,run_id:STRING,job_name:STRING
```

#### Option C: Using BigQuery Console

1. Go to BigQuery Console: https://console.cloud.google.com/bigquery?project=amazon-ppc-474902
2. Create dataset `amazon_ppc` if it doesn't exist
3. Create table `optimizer_run_events` with the schema above

## Usage

### Automatic Logging (Integrated in main.py)

The optimizer automatically logs events when you run it:

```python
from main import run_optimizer

# Run the optimizer - it will automatically log to BigQuery
result = run_optimizer()
```

Events logged automatically:
- **Optimizer Start**: When optimization begins
- **Optimizer Complete**: When optimization finishes successfully
- **Optimizer Error**: When optimization encounters an error

### Manual Logging

You can also log custom events:

```python
from bigquery_logger import log_to_bigquery

# Log a simple event
log_to_bigquery(
    message="Custom event occurred",
    level="INFO",
    run_id="my-run-123",
    job_name="Custom Job"
)

# Log with additional details
log_to_bigquery(
    message="Bid adjustment completed",
    level="SUCCESS",
    run_id="my-run-123",
    job_name="Bid Optimizer",
    additional_details={
        'keywords_updated': 42,
        'average_bid_change': 0.15
    }
)
```

### Helper Functions

```python
from bigquery_logger import (
    log_optimizer_start,
    log_optimizer_complete,
    log_optimizer_error
)

import uuid

run_id = str(uuid.uuid4())

# Log start
log_optimizer_start(run_id, config={'dry_run': False})

# ... run optimization ...

# Log completion
log_optimizer_complete(
    run_id,
    results={'keywords_optimized': 100},
    duration_seconds=45.2
)

# Or log error
log_optimizer_error(
    run_id,
    error_message="API rate limit exceeded",
    error_details={'status_code': 429}
)
```

## Querying Logs

### View Recent Events

```sql
SELECT
  run_timestamp,
  status,
  details,
  run_id,
  job_name
FROM `amazon-ppc-474902.amazon_ppc.optimizer_run_events`
ORDER BY run_timestamp DESC
LIMIT 100;
```

### View Errors Only

```sql
SELECT
  run_timestamp,
  details,
  run_id
FROM `amazon-ppc-474902.amazon_ppc.optimizer_run_events`
WHERE status = 'ERROR'
ORDER BY run_timestamp DESC;
```

### View Specific Run

```sql
SELECT
  run_timestamp,
  status,
  details,
  job_name
FROM `amazon-ppc-474902.amazon_ppc.optimizer_run_events`
WHERE run_id = 'your-run-id-here'
ORDER BY run_timestamp ASC;
```

### Aggregate Statistics

```sql
SELECT
  DATE(run_timestamp) as date,
  status,
  COUNT(*) as event_count
FROM `amazon-ppc-474902.amazon_ppc.optimizer_run_events`
GROUP BY date, status
ORDER BY date DESC, status;
```

## Troubleshooting

### BigQuery Logging Disabled

If you see this warning:

```
BigQuery logging not available: No module named 'google.cloud'
```

Install the required package:

```bash
pip install google-cloud-bigquery>=3.11.0
```

### Permission Denied

If you get a permission error:

```
403 Permission denied on resource project amazon-ppc-474902
```

Make sure your service account or user has the following IAM roles:
- `BigQuery Data Editor` (to insert rows)
- `BigQuery Job User` (to run queries)

Grant permissions:

```bash
# For service account
gcloud projects add-iam-policy-binding amazon-ppc-474902 \
  --member="serviceAccount:YOUR_SERVICE_ACCOUNT@amazon-ppc-474902.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataEditor"

gcloud projects add-iam-policy-binding amazon-ppc-474902 \
  --member="serviceAccount:YOUR_SERVICE_ACCOUNT@amazon-ppc-474902.iam.gserviceaccount.com" \
  --role="roles/bigquery.jobUser"
```

### Table Does Not Exist

If the table doesn't exist, create it using one of the methods in the "Create BigQuery Table" section above.

### Silent Failures

The BigQuery logger is designed to fail gracefully. If logging fails, the optimizer will continue to run. Check the application logs for error messages:

```
Error logging to BigQuery: <error details>
```

## Testing

Test the BigQuery logger standalone:

```bash
cd amazon-ppc-fixed
python bigquery_logger.py
```

Expected output:

```
Testing BigQuery Logger...
Project: amazon-ppc-474902
Dataset: amazon_ppc
Table: optimizer_run_events
Full Reference: amazon-ppc-474902.amazon_ppc.optimizer_run_events
Test Run ID: 12345678-1234-1234-1234-123456789abc
✅ Successfully logged to BigQuery
```

## Migration from Old Configuration

If you previously had:

```python
PROJECT_ID = "natureswaysoil-video"
DATASET_ID = "amazon_ppc"
TABLE_ID = "audit_logs"
```

The configuration has been updated to:

```python
PROJECT_ID = "amazon-ppc-474902"   # ✅ Updated
DATASET_ID = "amazon_ppc"          # ✅ Same
TABLE_ID = "optimizer_run_events"  # ✅ Updated
```

If you have data in the old `audit_logs` table, you can migrate it:

```sql
INSERT INTO `amazon-ppc-474902.amazon_ppc.optimizer_run_events`
  (run_timestamp, status, details, run_id, job_name)
SELECT
  timestamp as run_timestamp,
  level as status,
  message as details,
  NULL as run_id,
  'Legacy Import' as job_name
FROM `natureswaysoil-video.amazon_ppc.audit_logs`;
```

## Best Practices

1. **Always include run_id**: Use a UUID for each optimizer run to correlate related events
2. **Use appropriate log levels**: INFO for normal operations, ERROR for failures, SUCCESS for completions
3. **Add context in details**: Include relevant information to help with debugging
4. **Monitor your logs**: Set up alerts for ERROR status events
5. **Rotate old logs**: Consider archiving logs older than 90 days to reduce storage costs

## Cost Considerations

BigQuery charges for:
- **Storage**: $0.02 per GB per month
- **Query processing**: $5 per TB processed

Estimated costs for typical usage:
- 100 events/day ≈ 1 MB/day ≈ 30 MB/month
- Storage cost: ~$0.0006/month (negligible)
- Query costs depend on usage

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review application logs for error details
3. Verify IAM permissions in GCP Console
4. Check BigQuery table exists and has correct schema

## References

- [BigQuery Python Client Documentation](https://cloud.google.com/python/docs/reference/bigquery/latest)
- [BigQuery Pricing](https://cloud.google.com/bigquery/pricing)
- [Application Default Credentials](https://cloud.google.com/docs/authentication/application-default-credentials)
