@echo off
title Old Growth Reclaimed Woods - Inventory System & Live Bridge Supervisor
echo =====================================================================
echo    OLD GROWTH RECLAIMED WOODS - RESILIENT INVENTORY & MOBILE BRIDGE
echo =====================================================================
echo.
cd /d "%~dp0"

echo [1/2] Opening local inventory dashboard in default browser...
start http://localhost:3000

echo [2/2] Launching Self-Healing Supervisor (Node Server + Cloudflare Tunnel)...
echo.
echo   * Local URL:       http://localhost:3000
echo   * Internal Wi-Fi:  http://192.168.1.162:3000
echo   * Mobile Bridge:   Supervised & Auto-Healing (HTTP/2 IPv4)
echo   * Sleep Lock:      Active (Windows will stay awake while running)
echo.
echo Leave this window open while using the system.
echo Press Ctrl+C to cleanly stop all services.
echo =====================================================================
echo.
node supervisor.js
pause
