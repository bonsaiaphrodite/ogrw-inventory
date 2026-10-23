/**
 * Old Growth Reclaimed Woods - System Supervisor & Watchdog
 * ==========================================================
 * Automatically supervises and self-heals:
 * 1. Node.js Inventory API & Web Server (restarts on crash/freeze)
 * 2. Cloudflare Live Bridge Tunnel (restarts on disconnect, uses stable HTTP/2 over IPv4)
 * 3. Prevents Windows System Sleep while server is active
 * 4. Automatically syncs live tunnel URL into Squarespace embed code and tunnel_info.json
 */

const { spawn, exec } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const INVENTORY_DIR = __dirname;
const WEBSITE_DIR = path.resolve(INVENTORY_DIR, '..', 'website');
const CLOUDFLARED_BIN = path.join(INVENTORY_DIR, 'cloudflared.exe');
const TUNNEL_LOG_FILE = path.join(INVENTORY_DIR, 'tunnel.log');
const TUNNEL_INFO_FILE = path.join(INVENTORY_DIR, 'tunnel_info.json');
const EMBED_HTML_FILE = path.join(WEBSITE_DIR, 'squarespace_inventory_embed.html');
const ENV_FILE = path.join(INVENTORY_DIR, '.env');

let serverProc = null;
let tunnelProc = null;
let isShuttingDown = false;
let currentTunnelUrl = null;
let healthFailures = 0;

// Read optional .env
function loadEnv() {
  if (fs.existsSync(ENV_FILE)) {
    try {
      const content = fs.readFileSync(ENV_FILE, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const [k, ...v] = trimmed.split('=');
        if (k && v.length) {
          process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
        }
      }
    } catch (e) {}
  }
}
loadEnv();

// Prevent Windows Sleep using SetThreadExecutionState (ES_CONTINUOUS | ES_SYSTEM_REQUIRED)
function keepSystemAwake() {
  if (process.platform === 'win32') {
    const psCmd = `
      Add-Type -TypeDefinition @"
      using System;
      using System.Runtime.InteropServices;
      public class SysSleep {
        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern uint SetThreadExecutionState(uint esFlags);
      }
"@ -ErrorAction SilentlyContinue
      [SysSleep]::SetThreadExecutionState(0x80000001) | Out-Null
    `;
    exec(`powershell -NoProfile -NonInteractive -Command "${psCmd.replace(/\r?\n/g, ' ')}"`, (err) => {
      if (err) {
        // Fallback: benign error
      }
    });
  }
}

// Update Squarespace embed HTML with the active tunnel URL
function updateSquarespaceEmbed(tunnelUrl) {
  if (!fs.existsSync(EMBED_HTML_FILE)) return;
  try {
    let content = fs.readFileSync(EMBED_HTML_FILE, 'utf8');
    const updated = content.replace(
      /src="https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com"/g,
      `src="${tunnelUrl}"`
    );
    if (updated !== content) {
      fs.writeFileSync(EMBED_HTML_FILE, updated, 'utf8');
      console.log(`[Supervisor] Synced live tunnel URL into Squarespace embed code: ${path.basename(EMBED_HTML_FILE)}`);
    }
  } catch (err) {
    console.error('[Supervisor] Failed to update Squarespace embed file:', err.message);
  }
}

// Save tunnel status to tunnel_info.json
function saveTunnelInfo(url, status = 'active') {
  currentTunnelUrl = url;
  const data = {
    url,
    status,
    updated_at: new Date().toISOString(),
    protocol: 'http2-ipv4',
    pid: tunnelProc ? tunnelProc.pid : null
  };
  try {
    fs.writeFileSync(TUNNEL_INFO_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
  if (url) {
    updateSquarespaceEmbed(url);
  }
}

// -----------------------------------------------------------------------------
// 1. NODE SERVER SUPERVISOR
// -----------------------------------------------------------------------------
function startServer() {
  if (isShuttingDown) return;
  console.log('[Supervisor] Starting Inventory Server (server.js)...');

  serverProc = spawn(process.execPath, ['server.js'], {
    cwd: INVENTORY_DIR,
    stdio: 'inherit',
    env: { ...process.env, PORT: process.env.PORT || 3000 }
  });

  serverProc.on('exit', (code, signal) => {
    if (isShuttingDown) return;
    console.warn(`[Supervisor] Inventory Server exited (code ${code}, signal ${signal}). Restarting in 1s...`);
    setTimeout(startServer, 1000);
  });

  serverProc.on('error', (err) => {
    console.error('[Supervisor] Failed to spawn Inventory Server:', err);
  });
}

// -----------------------------------------------------------------------------
// 2. CLOUDFLARE TUNNEL SUPERVISOR
// -----------------------------------------------------------------------------
function startTunnel() {
  if (isShuttingDown) return;

  // Clear or touch tunnel.log
  try {
    fs.writeFileSync(TUNNEL_LOG_FILE, '', 'utf8');
  } catch (e) {}

  const tunnelToken = process.env.CLOUDFLARE_TUNNEL_TOKEN || process.env.TUNNEL_TOKEN;
  let args = [];

  if (tunnelToken) {
    console.log('[Supervisor] Launching Cloudflare Named Tunnel using configured token...');
    args = ['tunnel', 'run', '--token', tunnelToken, '--logfile', TUNNEL_LOG_FILE];
  } else {
    console.log('[Supervisor] Launching Cloudflare Quick Tunnel (HTTP/2 TCP over IPv4)...');
    args = [
      'tunnel',
      '--protocol', 'http2',
      '--edge-ip-version', '4',
      '--url', 'http://localhost:3000',
      '--logfile', TUNNEL_LOG_FILE
    ];
  }

  tunnelProc = spawn(CLOUDFLARED_BIN, args, {
    cwd: INVENTORY_DIR,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let foundUrl = false;

  const checkLogForUrl = () => {
    if (!fs.existsSync(TUNNEL_LOG_FILE)) return;
    try {
      const content = fs.readFileSync(TUNNEL_LOG_FILE, 'utf8');

      // Check for quick tunnel URL
      const match = content.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match && match[0] !== currentTunnelUrl) {
        foundUrl = true;
        const newUrl = match[0];
        console.log('\n=============================================================');
        console.log(`[Supervisor] Live Cloudflare Mobile URL: ${newUrl}`);
        console.log('=============================================================\n');
        saveTunnelInfo(newUrl, 'active');
      }

      // Check for expired/dead tunnel errors
      if (content.includes('Unauthorized: Tunnel not found')) {
        console.warn('[Supervisor] Cloudflare Tunnel session expired. Recycling tunnel...');
        recycleTunnel();
      }
    } catch (e) {}
  };

  const logInterval = setInterval(checkLogForUrl, 2000);

  tunnelProc.stdout.on('data', (d) => {
    const text = d.toString();
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match) {
      saveTunnelInfo(match[0], 'active');
    }
  });

  tunnelProc.stderr.on('data', (d) => {
    const text = d.toString();
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match) {
      saveTunnelInfo(match[0], 'active');
    }
  });

  tunnelProc.on('exit', (code, signal) => {
    clearInterval(logInterval);
    if (isShuttingDown) return;
    console.warn(`[Supervisor] Cloudflare Tunnel exited (code ${code}). Restarting in 3s...`);
    saveTunnelInfo(null, 'reconnecting');
    setTimeout(startTunnel, 3000);
  });

  tunnelProc.on('error', (err) => {
    clearInterval(logInterval);
    console.error('[Supervisor] Failed to launch cloudflared:', err);
  });
}

function recycleTunnel() {
  if (tunnelProc && !tunnelProc.killed) {
    try {
      tunnelProc.kill('SIGTERM');
    } catch (e) {
      try { tunnelProc.kill('SIGKILL'); } catch (e2) {}
    }
  }
}

// -----------------------------------------------------------------------------
// 3. PERIODIC HEALTH & AWAKE WATCHDOG
// -----------------------------------------------------------------------------
function checkHealth() {
  if (isShuttingDown) return;
  keepSystemAwake();

  const req = http.get('http://localhost:3000/api/health', { timeout: 4000 }, (res) => {
    if (res.statusCode === 200) {
      healthFailures = 0;
    } else {
      healthFailures++;
    }
    res.resume();
  });

  req.on('error', () => {
    healthFailures++;
    if (healthFailures >= 3) {
      console.warn('[Supervisor] Health check failed 3 times. Recycling server.js...');
      healthFailures = 0;
      if (serverProc && !serverProc.killed) {
        try { serverProc.kill('SIGTERM'); } catch (e) {}
      }
    }
  });

  req.on('timeout', () => {
    req.destroy();
  });
}

// -----------------------------------------------------------------------------
// 4. CLEAN SHUTDOWN
// -----------------------------------------------------------------------------
function cleanup() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('\n[Supervisor] Shutting down Old Growth Inventory services gracefully...');

  saveTunnelInfo(null, 'stopped');

  if (serverProc) {
    try { serverProc.kill('SIGINT'); } catch (e) {}
  }
  if (tunnelProc) {
    try { tunnelProc.kill('SIGINT'); } catch (e) {}
  }

  setTimeout(() => {
    process.exit(0);
  }, 1000);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// START EVERYTHING
console.log('=============================================================');
console.log(' OLD GROWTH RECLAIMED WOODS — SYSTEM SUPERVISOR & LIVE BRIDGE');
console.log('=============================================================');
keepSystemAwake();
startServer();

// Delay tunnel start by 1.5s to let local server bind first
setTimeout(startTunnel, 1500);

// Run health & sleep prevention every 15s
setInterval(checkHealth, 15000);
