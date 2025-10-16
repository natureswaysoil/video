
# Configuration Guide - Amazon PPC Optimizer

## 📋 Complete Configuration Reference

This guide explains every configuration option in `config.json`.

## 🔧 Configuration Structure

### Amazon API Settings

```json
"amazon_api": {
  "region": "NA",              // API region: "NA", "EU", or "FE"
  "profile_id": "1234567890",  // Your Amazon Ads profile ID
  "client_id": "...",          // API client ID
  "client_secret": "...",      // API client secret
  "refresh_token": "..."       // OAuth refresh token
}
```

**Region Codes:**
- `NA` - North America (US, Canada, Mexico)
- `EU` - Europe (UK, Germany, France, Italy, Spain)
- `FE` - Far East (Japan, Australia, India)

---

### Bid Optimization Settings

```json
"optimization_rules": {
  "lookback_days": 14,
  "min_clicks": 10,
  "min_spend": 5.0,
  "target_acos": 0.45,
  "high_acos": 0.60,
  "low_acos": 0.25,
  "min_ctr": 0.003,
  "up_pct": 0.15,
  "down_pct": 0.20,
  "min_bid": 0.25,
  "max_bid": 5.00
}
```

| Setting | Description | Recommended Range | Example |
|---------|-------------|-------------------|---------|
| `lookback_days` | Days of historical data to analyze | 7-30 | 14 |
| `min_clicks` | Minimum clicks before optimizing | 5-25 | 10 |
| `min_spend` | Minimum spend ($) before optimizing | 5-20 | 5.0 |
| `target_acos` | Target ACOS (% as decimal) | 0.20-0.50 | 0.45 (45%) |
| `high_acos` | Threshold to decrease bids | 0.40-0.80 | 0.60 (60%) |
| `low_acos` | Threshold to increase bids | 0.15-0.35 | 0.25 (25%) |
| `min_ctr` | Minimum CTR threshold | 0.002-0.01 | 0.003 (0.3%) |
| `up_pct` | Bid increase percentage | 0.10-0.30 | 0.15 (15%) |
| `down_pct` | Bid decrease percentage | 0.10-0.30 | 0.20 (20%) |
| `min_bid` | Minimum allowed bid ($) | 0.20-0.50 | 0.25 |
| `max_bid` | Maximum allowed bid ($) | 3.00-10.00 | 5.00 |

**How Bid Optimization Works:**

1. **Gather Data:** Analyze keywords with at least `min_clicks` or `min_spend`
2. **Calculate ACOS:** ACOS = Cost / Sales
3. **Decision Logic:**
   - If ACOS > `high_acos` → Decrease bid by `down_pct`
   - If ACOS < `low_acos` → Increase bid by `up_pct`
   - If CTR < `min_ctr` → Decrease bid by `down_pct`
   - If no sales after `min_clicks` → Decrease bid by `down_pct`
4. **Apply Limits:** Clamp bid between `min_bid` and `max_bid`

---

### Dayparting Settings

```json
"dayparting": {
  "enabled": true,
  "peak_hours": [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
  "peak_multiplier": 1.20,
  "off_peak_multiplier": 0.85,
  "day_multipliers": {
    "MONDAY": 1.0,
    "TUESDAY": 1.0,
    "WEDNESDAY": 1.0,
    "THURSDAY": 1.0,
    "FRIDAY": 1.1,
    "SATURDAY": 1.2,
    "SUNDAY": 1.15
  },
  "min_multiplier": 0.4,
  "max_multiplier": 1.8
}
```

| Setting | Description | Example |
|---------|-------------|---------|
| `enabled` | Turn dayparting on/off | true |
| `peak_hours` | Array of peak hours (0-23) | [9-20] = 9am-8pm |
| `peak_multiplier` | Bid multiplier during peak | 1.20 = +20% |
| `off_peak_multiplier` | Bid multiplier off-peak | 0.85 = -15% |
| `day_multipliers` | Per-day multipliers | Saturday: 1.2 = +20% |
| `min_multiplier` | Minimum allowed multiplier | 0.4 = -60% |
| `max_multiplier` | Maximum allowed multiplier | 1.8 = +80% |

**Dayparting Strategies:**

**Strategy 1: Business Hours Focus**
```json
"peak_hours": [8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
"peak_multiplier": 1.30,
"off_peak_multiplier": 0.70
```
*Use for B2B products or office supplies*

**Strategy 2: Evening Focus**
```json
"peak_hours": [18, 19, 20, 21, 22],
"peak_multiplier": 1.25,
"off_peak_multiplier": 0.90
```
*Use for entertainment products or home goods*

**Strategy 3: Weekend Boost**
```json
"day_multipliers": {
  "MONDAY": 0.9,
  "TUESDAY": 0.9,
  "WEDNESDAY": 0.9,
  "THURSDAY": 0.9,
  "FRIDAY": 1.1,
  "SATURDAY": 1.4,
  "SUNDAY": 1.3
}
```
*Use for hobby or recreational products*

---

### Campaign Management

```json
"campaign_management": {
  "enabled": true,
  "acos_threshold": 0.45,
  "min_spend": 20.0,
  "auto_activate": true,
  "auto_pause": true
}
```

| Setting | Description | Recommended | Notes |
|---------|-------------|-------------|-------|
| `enabled` | Enable campaign management | true | |
| `acos_threshold` | ACOS limit before pausing | 0.45 (45%) | Match your margins |
| `min_spend` | Min spend before pausing | $20 | Avoid premature pausing |
| `auto_activate` | Auto-reactivate good campaigns | true | Recommended |
| `auto_pause` | Auto-pause poor campaigns | true | Use with caution |

**Important:** Setting `acos_threshold` too low may pause campaigns prematurely. Consider your product margins.

---

### Keyword Discovery

```json
"keyword_discovery": {
  "enabled": true,
  "min_clicks": 5,
  "max_acos": 0.40,
  "initial_bid": 0.75,
  "max_keywords_per_run": 50
}
```

| Setting | Description | Range | Notes |
|---------|-------------|-------|-------|
| `enabled` | Enable keyword discovery | true/false | |
| `min_clicks` | Min clicks for search term | 3-10 | Lower = more aggressive |
| `max_acos` | Max ACOS to add keyword | 0.30-0.50 | Only add winners |
| `initial_bid` | Starting bid for new keywords | $0.50-$1.50 | |
| `max_keywords_per_run` | Limit per execution | 20-100 | Avoid overwhelming |

**How It Works:**
1. Analyze search term reports
2. Find terms with `min_clicks` and ACOS < `max_acos`
3. Add as new keywords (exact match)
4. Set initial bid to `initial_bid`

---

### Negative Keyword Management

```json
"negative_keywords": {
  "enabled": true,
  "min_spend": 10.0,
  "max_acos": 1.0,
  "auto_add": true
}
```

| Setting | Description | Range | Example |
|---------|-------------|-------|---------|
| `enabled` | Enable negative keyword management | true/false | true |
| `min_spend` | Min spend before blocking | $5-$20 | $10 |
| `max_acos` | Max ACOS before blocking | 0.80-2.0 | 1.0 (100%) |
| `auto_add` | Auto-add negatives | true/false | true |

**Logic:**
- Search terms with spend > `min_spend` and ACOS > `max_acos` are added as negative keywords
- Prevents wasted spend on non-converting terms

---

### Budget Optimization

```json
"budget_optimization": {
  "enabled": true,
  "increase_threshold_acos": 0.30,
  "decrease_threshold_acos": 0.60,
  "budget_change_pct": 0.20,
  "min_daily_budget": 5.0,
  "max_daily_budget": 100.0
}
```

| Setting | Description | Purpose |
|---------|-------------|---------|
| `enabled` | Enable budget optimization | Control budget |
| `increase_threshold_acos` | ACOS to increase budget | Scale winners |
| `decrease_threshold_acos` | ACOS to decrease budget | Limit losers |
| `budget_change_pct` | Percentage change | 0.20 = 20% |
| `min_daily_budget` | Minimum budget | Prevent too low |
| `max_daily_budget` | Maximum budget | Cap spending |

---

### Placement Bid Adjustments

```json
"placement_bids": {
  "enabled": true,
  "top_of_search_multiplier": 1.50,
  "product_pages_multiplier": 0.80
}
```

**Placement Types:**
- **Top of Search**: First page search results (premium placement)
- **Product Pages**: On competitor product pages

**Strategy:**
- Top of Search: Higher multiplier (1.30-1.80) for brand awareness
- Product Pages: Lower multiplier (0.70-0.90) for cost efficiency

---

### Features Control

```json
"features": {
  "enabled": [
    "bid_optimization",
    "dayparting",
    "campaign_management",
    "keyword_discovery",
    "negative_keywords"
  ]
}
```

**Available Features:**
- `bid_optimization` - Adjust keyword bids
- `dayparting` - Time-based adjustments
- `campaign_management` - Pause/activate campaigns
- `keyword_discovery` - Add new keywords
- `negative_keywords` - Block poor terms

**Selective Execution:**
```cmd
python amazon_ppc_optimizer.py --features bid_optimization dayparting
```

---

### Logging Configuration

```json
"logging": {
  "level": "INFO",
  "output_dir": "./logs",
  "audit_trail": true
}
```

**Log Levels:**
- `DEBUG` - Detailed technical info (verbose)
- `INFO` - General information (recommended)
- `WARNING` - Warnings only
- `ERROR` - Errors only

---

## 🎯 Configuration Templates

### Conservative Template (Low Risk)

```json
{
  "optimization_rules": {
    "min_clicks": 25,
    "up_pct": 0.10,
    "down_pct": 0.10,
    "target_acos": 0.50
  },
  "campaign_management": {
    "acos_threshold": 0.60,
    "auto_pause": false
  },
  "keyword_discovery": {
    "max_keywords_per_run": 20
  }
}
```

### Aggressive Template (High Performance)

```json
{
  "optimization_rules": {
    "min_clicks": 10,
    "up_pct": 0.25,
    "down_pct": 0.30,
    "target_acos": 0.35
  },
  "campaign_management": {
    "acos_threshold": 0.40,
    "auto_pause": true
  },
  "keyword_discovery": {
    "max_keywords_per_run": 100
  }
}
```

### Balanced Template (Recommended)

```json
{
  "optimization_rules": {
    "min_clicks": 15,
    "up_pct": 0.15,
    "down_pct": 0.20,
    "target_acos": 0.45
  },
  "campaign_management": {
    "acos_threshold": 0.50,
    "auto_pause": true
  },
  "keyword_discovery": {
    "max_keywords_per_run": 50
  }
}
```

---

## 💡 Best Practices

1. **Start Conservative** - Use higher `min_clicks` and smaller `up_pct`/`down_pct` initially
2. **Monitor First Week** - Check audit logs daily to understand changes
3. **Adjust ACOS** - Set `target_acos` based on your actual profit margins
4. **Use Dayparting** - Analyze your traffic patterns and adjust accordingly
5. **Limit Keywords** - Don't add too many keywords at once
6. **Test Dry-Run** - Always test configuration changes in dry-run mode first

---

**Next:** [Back to README](README.md) or [API Setup Guide](API_SETUP_GUIDE.md)
