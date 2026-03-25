@echo off
:: ImageScrub v7.0 launcher
:: Requires Node.js 22.5 or newer — https://nodejs.org

echo.
echo  IMAGESCRUB v7.0
echo  ---------------

:: Check Node is available
where node >nul 2>&1
if errorlevel 1 (
  echo  ERROR: Node.js not found.
  echo  Download and install from: https://nodejs.org
  echo  Then re-run this file.
  pause
  exit /b 1
)

:: Read Node version
for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo  Node: %NODE_VER%

:: Hard-block if below 22.5
for /f "tokens=*" %%r in ('node -e "const [maj,min]=process.versions.node.split('.').map(Number);const ok=maj>22||(maj===22&&min>=5);process.stdout.write(ok?'ok':'fail')"') do set NODE_OK=%%r

if "%NODE_OK%" NEQ "ok" (
  echo.
  echo  ERROR: Node.js %NODE_VER% is too old.
  echo  ImageScrub requires Node.js 22.5 or newer for cookie extraction.
  echo  Download the latest LTS from: https://nodejs.org
  echo.
  pause
  exit /b 1
)

:: Check for express specifically
node -e "require('express')" >nul 2>&1
if errorlevel 1 (
  echo  Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo  ERROR: npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

echo  Starting server...
echo.
node server.js
pause
