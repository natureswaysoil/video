
@echo off
REM Amazon PPC Optimizer - Windows Setup Script
REM This script will install all dependencies and configure the optimizer

echo ============================================================
echo Amazon PPC Optimizer - Windows 10 Setup
echo ============================================================
echo.

REM Check if Python is installed
echo [1/5] Checking Python installation...
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.7 or higher from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation
    pause
    exit /b 1
)
python --version
echo Python is installed!
echo.

REM Check pip
echo [2/5] Checking pip installation...
python -m pip --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: pip is not installed
    echo Installing pip...
    python -m ensurepip --default-pip
)
python -m pip --version
echo pip is installed!
echo.

REM Install dependencies
echo [3/5] Installing Python dependencies...
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)
echo Dependencies installed successfully!
echo.

REM Create logs directory
echo [4/5] Creating logs directory...
if not exist "logs" mkdir logs
echo Logs directory created!
echo.

REM Create audit directory
echo [5/5] Creating audit directory...
if not exist "audit" mkdir audit
echo Audit directory created!
echo.

echo ============================================================
echo Setup Complete!
echo ============================================================
echo.
echo Next Steps:
echo 1. Edit config.json with your Amazon API credentials
echo 2. Run: python amazon_ppc_optimizer.py --help
echo 3. Test with dry-run: python amazon_ppc_optimizer.py --config config.json --profile-id YOUR_PROFILE_ID --dry-run
echo 4. Schedule regular runs with Windows Task Scheduler
echo.
echo For detailed instructions, see README.md
echo.
pause
