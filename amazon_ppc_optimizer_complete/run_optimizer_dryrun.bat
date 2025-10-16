
@echo off
REM Amazon PPC Optimizer - Dry Run Test Script for Windows
REM This will simulate changes without actually modifying campaigns

echo ============================================================
echo Amazon PPC Optimizer - DRY RUN MODE
echo ============================================================
echo This will test the optimizer without making actual changes
echo.

REM Set your profile ID here
set PROFILE_ID=YOUR_PROFILE_ID_HERE

REM Run in dry-run mode
python amazon_ppc_optimizer.py --config config.json --profile-id %PROFILE_ID% --dry-run

echo.
echo ============================================================
echo Dry run complete!
echo Review the output above to see what changes would be made
echo ============================================================
pause
