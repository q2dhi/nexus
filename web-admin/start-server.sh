#!/usr/bin/env bash

# Nexus Enterprise MDM Web Admin - macOS/Linux Startup Script

set -e

# Change to script directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "========================================================"
echo "  🚀 Starting Nexus Enterprise MDM Web Admin Server"
echo "  💻 macOS / Linux Environment"
echo "========================================================"
echo ""

# Find ADB executable
ADB_BIN=""
if command -v adb >/dev/null 2>&1; then
    ADB_BIN="$(command -v adb)"
elif [ -f "$HOME/Library/Android/sdk/platform-tools/adb" ]; then
    ADB_BIN="$HOME/Library/Android/sdk/platform-tools/adb"
elif [ -n "$ANDROID_HOME" ] && [ -f "$ANDROID_HOME/platform-tools/adb" ]; then
    ADB_BIN="$ANDROID_HOME/platform-tools/adb"
elif [ -n "$ANDROID_SDK_ROOT" ] && [ -f "$ANDROID_SDK_ROOT/platform-tools/adb" ]; then
    ADB_BIN="$ANDROID_SDK_ROOT/platform-tools/adb"
elif [ -f "$HOME/Android/Sdk/platform-tools/adb" ]; then
    ADB_BIN="$HOME/Android/Sdk/platform-tools/adb"
fi

if [ -n "$ADB_BIN" ] && [ -x "$ADB_BIN" ]; then
    echo "📱 Found ADB at: $ADB_BIN"
    echo "🔗 Reverse port forwarding 3000 for connected USB devices..."
    "$ADB_BIN" reverse tcp:3000 tcp:3000 2>/dev/null || true
else
    echo "ℹ️  ADB not detected in standard paths (optional if using cloud/LAN sync)."
fi

# Detect Python 3 or Node
if command -v python3 >/dev/null 2>&1; then
    echo "🐍 Starting Web Admin using Python 3 on http://localhost:3000 ..."
    python3 server.py
    exit 0
elif command -v python >/dev/null 2>&1; then
    echo "🐍 Starting Web Admin using Python on http://localhost:3000 ..."
    python server.py
    exit 0
elif command -v node >/dev/null 2>&1; then
    if [ ! -d "node_modules" ]; then
        echo "📦 Installing Node.js dependencies (express, cors)..."
        npm install
    fi
    echo "🟢 Starting Web Admin using Node.js on http://localhost:3000 ..."
    node server.js
    exit 0
fi

echo "❌ [ERROR] Neither Python 3 nor Node.js was found in your PATH."
echo "Please install Python 3 (brew install python) or Node.js (brew install node)."
exit 1
