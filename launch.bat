@echo off
setlocal
title CardVault

cd /d "%~dp0"

rem Reinstall dependencies when node_modules is missing or package.json has
rem changed since the last install (a copy is stamped into node_modules).
set "STAMP=node_modules\.cardvault-package.json"
set "NEED_INSTALL="
if not exist "node_modules\" set "NEED_INSTALL=1"
if not exist "%STAMP%" set "NEED_INSTALL=1"
if not defined NEED_INSTALL (
  fc /b "package.json" "%STAMP%" >nul 2>&1
  if errorlevel 1 set "NEED_INSTALL=1"
)

if defined NEED_INSTALL (
  echo Installing dependencies...
  call npm ci
  if errorlevel 1 goto :error
  copy /y "package.json" "%STAMP%" >nul
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
