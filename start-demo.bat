@echo off
title Laurel - Demo Launcher
cd /d "%~dp0frontend"

echo ============================================
echo   LAUREL - Token-Based Success Award
echo   Demo launcher (Polygon Amoy / live)
echo ============================================
echo.

echo [Laurel] Clearing any old server still running on port 5173...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1
echo.

if not exist "node_modules" (
  echo [Laurel] First run detected - installing dependencies...
  echo [Laurel] This happens only once and may take a minute.
  call npm install
  echo.
)

echo [Laurel] Starting the app on http://localhost:5173
echo [Laurel] Your browser will open automatically in a few seconds.
echo [Laurel] KEEP THIS WINDOW OPEN during the demo. Press Ctrl+C to stop.
echo.

start "" cmd /c "timeout /t 5 >nul & start http://localhost:5173"
call npm run dev
