@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed or not in PATH.
  echo Install Node.js and try again.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo npm is not available in PATH.
  echo Reinstall Node.js and try again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo Failed to install dependencies.
    pause
    exit /b 1
  )
)

echo Starting local dev server at http://localhost:5173
call npm run dev -- --host localhost --open

if errorlevel 1 (
  echo Failed to start local dev server.
  pause
  exit /b 1
)

endlocal
