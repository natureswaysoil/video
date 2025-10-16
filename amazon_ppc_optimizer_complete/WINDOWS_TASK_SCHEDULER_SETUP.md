
# Windows Task Scheduler Setup Guide

## 📅 Automate Your PPC Optimizer

This guide shows you how to schedule the Amazon PPC Optimizer to run automatically on Windows 10.

## Method 1: Import XML Template (Easiest)

### Step 1: Edit the XML Template

1. Open `TaskScheduler_Template.xml` in Notepad
2. Find this line:
   ```xml
   <Command>C:\AmazonPPC\run_optimizer.bat</Command>
   ```
3. Change `C:\AmazonPPC` to your actual installation path
4. Save the file

### Step 2: Import to Task Scheduler

1. Press `Win + R`, type `taskschd.msc`, press Enter
2. In Task Scheduler, click **Action** → **Import Task**
3. Select `TaskScheduler_Template.xml`
4. Click **OK**

Done! The optimizer will now run every 2 hours.

## Method 2: Manual Setup (Step-by-Step)

### Step 1: Open Task Scheduler

1. Press `Win + R`
2. Type `taskschd.msc`
3. Press Enter

### Step 2: Create Basic Task

1. Click **"Create Basic Task"** in the right panel
2. Name: `Amazon PPC Optimizer`
3. Description: `Automated PPC campaign optimization`
4. Click **Next**

### Step 3: Set Trigger

1. Select **"Daily"**
2. Click **Next**
3. Start date: Today's date
4. Start time: `08:00:00 AM`
5. Recur every: `1` day
6. Click **Next**

### Step 4: Set Action

1. Select **"Start a program"**
2. Click **Next**
3. Program/script: Browse to `run_optimizer.bat`
   - Example: `C:\AmazonPPC\run_optimizer.bat`
4. Start in: Your installation directory
   - Example: `C:\AmazonPPC`
5. Click **Next**

### Step 5: Configure Repetition

1. Check **"Open the Properties dialog"**
2. Click **Finish**
3. In Properties, go to **Triggers** tab
4. Double-click the trigger
5. Check **"Repeat task every:"**
6. Select **"2 hours"**
7. Duration: **"Indefinitely"**
8. Click **OK**

### Step 6: Configure Settings

1. Go to **Settings** tab
2. Uncheck **"Stop the task if it runs longer than"** (or set to 1 hour)
3. Check **"Run task as soon as possible after a scheduled start is missed"**
4. Check **"If the task fails, restart every"** → Set to 10 minutes, 3 attempts
5. Click **OK**

## 📋 Recommended Schedules

### Every 2 Hours (Recommended)
- **Best for:** Active campaigns, competitive niches
- **Runs:** 12 times per day
- **CPU Impact:** Low (5-10 minutes per run)
- **Settings:** Repeat every 2 hours, indefinitely

### Every 4 Hours (Moderate)
- **Best for:** Stable campaigns, moderate budgets
- **Runs:** 6 times per day
- **CPU Impact:** Very low
- **Settings:** Repeat every 4 hours, indefinitely

### Business Hours Only
- **Best for:** B2B products, office hours sales
- **Runs:** 6 times during 8am-8pm
- **CPU Impact:** Minimal
- **Settings:** 
  - Start: 8:00 AM
  - Repeat every 2 hours
  - Duration: 12 hours
  - Stop at: 8:00 PM

### Night Schedule
- **Best for:** Low-activity accounts, testing
- **Runs:** Once per night at 2 AM
- **CPU Impact:** None during business hours
- **Settings:** 
  - Trigger: Daily at 2:00 AM
  - No repetition

## 🔍 Verify Task is Working

### Check Task History

1. Open Task Scheduler
2. Find your task in the list
3. Click on it
4. Go to **History** tab (enable if needed)
5. Look for successful runs

### Check Log Files

```cmd
cd C:\AmazonPPC\logs
dir /o-d
```

You should see new log files after each run.

### Check Audit Files

```cmd
cd C:\AmazonPPC\audit
dir /o-d
```

Audit CSV files are created when changes are made.

## 🛠️ Troubleshooting

### Task Shows "Running" But Nothing Happens

**Cause:** Working directory not set

**Fix:**
1. Right-click task → Properties
2. Actions tab → Edit action
3. Set "Start in" to `C:\AmazonPPC` (your path)
4. Click OK

### Task Fails Immediately

**Cause:** Python not in PATH or script error

**Fix:**
1. Open Command Prompt as Administrator
2. Navigate to your directory:
   ```cmd
   cd C:\AmazonPPC
   ```
3. Run manually to see error:
   ```cmd
   run_optimizer.bat
   ```
4. Fix any errors shown

### Task Doesn't Run When Computer is Asleep

**Fix:**
1. Right-click task → Properties
2. Conditions tab
3. Check **"Wake the computer to run this task"**
4. Click OK

### Task Runs But No Changes Made

**Cause:** Dry-run mode or insufficient data

**Fix:**
1. Check if you're using `run_optimizer_dryrun.bat`
2. Review logs for "dry-run" messages
3. Ensure campaigns have enough data (clicks, spend)
4. Verify API credentials are correct

## 📊 Monitor Performance

### Daily Checks (First Week)

1. Check log files: `logs\ppc_automation_*.log`
2. Review audit trail: `audit\ppc_audit_*.csv`
3. Monitor Amazon Advertising console for changes
4. Verify ACOS trends

### Weekly Checks (Ongoing)

1. Review summary in logs
2. Check for errors or warnings
3. Analyze performance trends
4. Adjust configuration if needed

## 🎯 Advanced Scheduling

### Multiple Schedules for Different Times

**Morning Boost:**
```
Name: PPC Optimizer - Morning
Schedule: 6 AM, 8 AM, 10 AM
Config: Use aggressive config with high multipliers
```

**Evening Check:**
```
Name: PPC Optimizer - Evening  
Schedule: 6 PM
Config: Use conservative config
```

### Different Configs for Different Days

**Weekday Script:**
```bat
@echo off
if %date:~0,3%==Sat goto weekend
if %date:~0,3%==Sun goto weekend
python amazon_ppc_optimizer.py --config config_weekday.json --profile-id YOUR_ID
goto end
:weekend
python amazon_ppc_optimizer.py --config config_weekend.json --profile-id YOUR_ID
:end
```

## 🔔 Email Notifications (Optional)

To get email notifications after each run, add to your `run_optimizer.bat`:

```bat
@echo off
python amazon_ppc_optimizer.py --config config.json --profile-id YOUR_PROFILE_ID

REM Send email notification (requires email script)
python send_email_notification.py
```

Create `send_email_notification.py` with your email logic.

## 📞 Support

If you encounter issues:
1. Check Task Scheduler History for error codes
2. Review log files in `logs\` directory
3. Verify Python installation: `python --version`
4. Test manual execution first
5. Refer to main README.md troubleshooting section

---

**Next:** Return to [README.md](README.md) for full documentation
