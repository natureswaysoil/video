
# Quick Start Guide - Amazon PPC Optimizer

## ⚡ Get Running in 5 Minutes

### Step 1: Install Python (if needed)
Download from [python.org](https://www.python.org/downloads/) - Check "Add to PATH"

### Step 2: Run Setup
```cmd
setup.bat
```

### Step 3: Edit config.json
Replace these values:
- `profile_id`: Your Amazon Ads profile ID
- `client_id`: Your API client ID
- `client_secret`: Your API client secret
- `refresh_token`: Your refresh token

### Step 4: Test
```cmd
run_optimizer_dryrun.bat
```

### Step 5: Run Live
```cmd
run_optimizer.bat
```

## 🎯 Key Settings to Adjust

In `config.json`:

- **target_acos**: 0.45 = 45% (adjust based on your margins)
- **peak_hours**: [9-20] = 9am-8pm (adjust for your customer behavior)
- **min_bid / max_bid**: Bid range limits

## 📊 Check Results

- **Logs**: `logs/` directory
- **Audit Trail**: `audit/` directory  
- **Dashboard**: Open `PPC_Dashboard.html`

## 🔄 Automate

Use Windows Task Scheduler to run `run_optimizer.bat` every 2 hours.

## 💡 Pro Tips

1. Start with dry-run mode for 1-2 days
2. Monitor closely for the first week
3. Adjust ACOS thresholds based on your products
4. Enable dayparting for 15-30% ROAS improvement
5. Review audit logs daily initially

That's it! You're optimizing! 🚀
