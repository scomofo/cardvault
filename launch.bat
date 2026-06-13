@echo off
setlocal
title CardVault

cd /d "%~dp0"

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm ci
  if errorlevel 1 goto :error
)

echo Starting CardVault...
call npm run start
if errorlevel 1 goto :error

exit /b 0

:error
echo.
echo CardVault launch failed. See the messages above.
pause
exit /b 1
