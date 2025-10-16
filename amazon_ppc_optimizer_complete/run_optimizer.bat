
@echo off
REM Amazon PPC Optimizer - Quick Run Script for Windows
REM Edit this file to set your profile ID and options

echo ============================================================
echo Amazon PPC Optimizer - Running...
echo ============================================================
echo Time: %date% %time%
echo.

REM Set your profile ID here
set PROFILE_ID=YOUR_PROFILE_ID_HERE

REM Set environment variables if not in config.json
REM set AMAZON_CLIENT_ID=your_client_id
REM set AMAZON_CLIENT_SECRET=your_client_secret
REM set AMAZON_REFRESH_TOKEN=your_refresh_token

REM Run the optimizer
python amazon_ppc_optimizer.py --config config.json --profile-id %PROFILE_ID%

echo.
echo ============================================================
echo Optimizer run complete!
echo Check logs directory for detailed output
echo ============================================================
pause
