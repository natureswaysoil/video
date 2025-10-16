# Amazon PPC Optimizer - Automatic Keyword Discovery & Negative Keywords

## Overview

Your PPC optimizer now includes **fully automatic** keyword discovery and negative keyword management that runs every 2 hours.

## New Features

### 1. 🔍 Automatic Keyword Discovery

**What it does:**
- Analyzes your ad groups to find high-potential keywords Amazon recommends
- Automatically adds new keywords to your campaigns
- Avoids duplicate keywords
- Uses intelligent bid suggestions from Amazon (capped to your limits)

**Configuration:**
```json
"keyword_discovery": {
  "enabled": true,
  "auto_add": true,
  "max_ad_groups_per_run": 10,
  "max_recommendations_per_ad_group": 20,
  "min_bid": 0.50,
  "max_bid": 2.00
}
```

**How it works:**
1. Gets Amazon's keyword recommendations for your ad groups
2. Checks against existing keywords to avoid duplicates
3. Uses Amazon's suggested bids (within your min/max limits)
4. Automatically adds keywords in batches of 100
5. Logs detailed information about what was added

**Example Results:**
```json
{
  "keyword_discovery": {
    "ad_groups_analyzed": 10,
    "keywords_discovered": 150,
    "keywords_added": 85
  }
}
```

### 2. 🚫 Automatic Negative Keyword Management

**What it does:**
- Identifies poor-performing keywords automatically
- Adds them as negative keywords to stop wasting ad spend
- Analyzes both keywords and search terms
- Supports manual negative keyword lists

**Configuration:**
```json
"negative_keywords": {
  "enabled": true,
  "auto_add": true,
  "min_spend_threshold": 10.0,
  "max_acos_threshold": 100.0,
  "min_clicks_threshold": 20,
  "negative_match_type": "NEGATIVE_PHRASE",
  "lookback_days": 30,
  "manual_negative_keywords": ["unwanted", "free", "cheap"]
}
```

**Identification Criteria:**
- **No conversions**: Keywords with 20+ clicks, $10+ spend, but zero sales
- **High ACOS**: Keywords with ACOS > 100% (spending more than earning)
- **Search terms**: Bad search queries triggering your ads
- **Manual list**: Keywords you specify in config

**How it works:**
1. Fetches performance data for last 30 days
2. Analyzes each keyword and search term
3. Identifies poor performers based on thresholds
4. Checks against existing negatives to avoid duplicates
5. Automatically adds negative keywords to campaigns
6. Logs detailed reasons for each negative addition

**Example Results:**
```json
{
  "negative_keywords": {
    "keywords_analyzed": 1000,
    "existing_negatives": 45,
    "poor_performers_found": 12,
    "negative_keywords_added": 12
  }
}
```

## Configuration Guide

### Enable/Disable Features

You can control features via the `PPC_CONFIG` environment variable in Cloud Run:

```json
{
  "keyword_discovery": {
    "enabled": true,  // Turn on/off keyword discovery
    "auto_add": true  // Set false for dry-run (discover but don't add)
  },
  "negative_keywords": {
    "enabled": true,  // Turn on/off negative keyword management
    "auto_add": true  // Set false for dry-run (identify but don't add)
  }
}
```

### Adjust Thresholds

**Keyword Discovery:**
- `max_ad_groups_per_run`: How many ad groups to analyze each run (default: 10)
- `max_recommendations_per_ad_group`: Max keywords to get per ad group (default: 20)
- `min_bid` / `max_bid`: Bid limits for new keywords (default: $0.50 - $2.00)

**Negative Keywords:**
- `min_spend_threshold`: Minimum spend before considering negative (default: $10)
- `max_acos_threshold`: Maximum ACOS % allowed (default: 100%)
- `min_clicks_threshold`: Minimum clicks before considering negative (default: 20)
- `lookback_days`: Days of performance data to analyze (default: 30)
- `negative_match_type`: Type of negative match (`NEGATIVE_PHRASE` or `NEGATIVE_EXACT`)

### Manual Negative Keywords

Add words you always want negative across all campaigns:

```json
{
  "negative_keywords": {
    "manual_negative_keywords": [
      "free",
      "cheap",
      "discount",
      "coupon",
      "wholesale",
      "bulk"
    ]
  }
}
```

These will be added as phrase match negatives to all campaigns.

## Current Schedule

The optimizer runs **every 2 hours** (12 times per day):
- **0:00, 2:00, 4:00, 6:00, 8:00, 10:00, 12:00, 14:00, 16:00, 18:00, 20:00, 22:00**

Each run:
1. ✅ Optimizes bids on existing keywords
2. ✅ Discovers and adds new keywords (up to 10 ad groups)
3. ✅ Identifies and adds negative keywords
4. ✅ Manages campaign states
5. ✅ Applies dayparting (if enabled)

## API Endpoints Used

### Keyword Discovery
- `POST /sp/adGroups/list` - Get ad groups
- `POST /sp/keywords/list` - Get existing keywords
- `POST /sp/keywords/recommendations` - Get Amazon's suggestions
- `POST /sp/keywords` - Add new keywords

### Negative Keywords
- `POST /sp/keywords/report` - Get keyword performance
- `POST /sp/targets/report` - Get search term data
- `POST /sp/negativeKeywords/list` - Get existing negatives
- `POST /sp/negativeKeywords` - Add new negatives

## Performance Data

The negative keyword system uses Amazon's Reporting API to get:
- **Clicks**: Number of times keyword was clicked
- **Cost**: Total spend on keyword
- **Conversions**: Number of sales attributed
- **Sales**: Revenue attributed (7-day attribution)
- **ACOS**: Advertising Cost of Sale percentage

## Safety Features

1. **Duplicate Prevention**: Checks existing keywords/negatives before adding
2. **Batch Processing**: Adds keywords in batches of 100 (API limit)
3. **Rate Limiting**: Respects Amazon's API rate limits (0.5 req/sec)
4. **Error Handling**: Continues on errors, logs details
5. **Dry Run Mode**: Test without making changes (`auto_add: false`)

## Monitoring

Check logs in Cloud Run to see:
- How many keywords were discovered and added
- Which keywords were identified as negative candidates
- Reasons for each negative keyword decision
- Any errors or warnings

Example log output:
```
2025-01-15 20:00:00 - INFO - Ad group 123456: 15 recommendations, 8 new keywords
2025-01-15 20:00:05 - INFO - Identified negative candidate: 'cheap organic soil' - No conversions after 25 clicks, $15.50 spent
2025-01-15 20:00:10 - INFO - Added batch 1 (8 keywords)
2025-01-15 20:00:15 - INFO - Added negative keyword batch 1 (5 keywords)
```

## Testing

### Test Keyword Discovery
```bash
curl -X POST https://amazon-ppc-optimizer-1009540130231.us-central1.run.app
```

Look for `keyword_discovery` section in response.

### Test with Dry Run
Set `auto_add: false` in config to see what would be added without making changes:
```json
{
  "keyword_discovery": {"enabled": true, "auto_add": false},
  "negative_keywords": {"enabled": true, "auto_add": false}
}
```

## Troubleshooting

### "No recommendations retrieved"
- Check that ad groups have products associated
- Ensure campaigns are enabled and have budget
- Amazon may not have suggestions for all ad groups

### "Could not fetch performance data"
- Reporting API requires additional permissions
- Check that `AMAZON_REFRESH_TOKEN` has reporting scopes
- Performance-based negatives will be skipped, manual list still works

### "Keywords already exist"
- This is normal - the system avoids duplicates
- You'll see `keywords_discovered` but lower `keywords_added`

### Keywords not being added
- Check `auto_add` is `true` in config
- Review logs for errors
- Verify bid limits aren't excluding all suggestions

## Best Practices

1. **Start Conservative**: Begin with higher thresholds and gradually lower them
   - `min_spend_threshold: 20` → `15` → `10`
   - `min_clicks_threshold: 30` → `25` → `20`

2. **Monitor First Week**: Check what keywords are being added/negated
   - Adjust thresholds based on your ACOS goals
   - Add any problem keywords to manual negative list

3. **Review Search Terms**: Look at search term reports in Amazon Seller Central
   - Add common poor performers to manual negative list
   - These will be added across all campaigns

4. **Bid Limits**: Set appropriate bid limits for your margins
   - `min_bid`: Don't go too low (won't get impressions)
   - `max_bid`: Cap to protect profit margins

5. **ACOS Threshold**: Adjust based on your target
   - Break-even ACOS: 30% → set threshold to 40-50%
   - Profitable ACOS goal: 20% → set threshold to 30-40%

## Future Enhancements

Potential additions:
- [ ] Product-specific negative keywords
- [ ] Competitor brand exclusions
- [ ] Seasonal keyword adjustments
- [ ] Performance-based bid multipliers for new keywords
- [ ] A/B testing different match types
- [ ] Automatic keyword graduation (broad → phrase → exact)

## Support

Your current configuration:
- **Profile ID**: 1780498399290938
- **Region**: US (North America)
- **Campaigns**: 253 active campaigns
- **Keywords**: ~1000 active keywords
- **Schedule**: Every 2 hours

All features are now deployed and active! 🚀
