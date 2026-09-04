@echo off
title Nexus Enterprise Web Admin Console
cd /d "%~dp0"

echo ========================================================
echo   Starting Nexus Enterprise MDM Web Admin Server
echo ========================================================
echo.

if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" (
    echo Linking connected Android devices over USB...
    "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" reverse tcp:3000 tcp:3000 >nul 2>nul
)

where python >nul 2>nul
if %errorlevel% equ 0 (
    echo Starting Web Admin using Python on http://localhost:3000 ...
    python server.py
    goto end
)

where py >nul 2>nul
if %errorlevel% equ 0 (
    echo Starting Web Admin using Py on http://localhost:3000 ...
    py server.py
    goto end
)

where node >nul 2>nul
if %errorlevel% equ 0 (
    if not exist "node_modules\" (
        echo Installing dependencies (express, cors)...
        npm install
    )
    echo Starting Web Admin using Node.js on http://localhost:3000 ...
    node server.js
    goto end
)

echo [ERROR] Neither Python nor Node.js was found in your PATH.
echo Please install Python (from python.org) or Node.js (from nodejs.org).
pause

:end
pause
