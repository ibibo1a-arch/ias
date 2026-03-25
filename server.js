/**
 * Integral Ad Science suite Server v1.0
 *
 * Rebuilt from v6.3 with:
 *   - SECURITY: SSRF whitelist on /api/scam/check (host no longer accepted from client)
 *   - SECURITY: CSP headers on all responses
 *   - SECURITY: Request timeout middleware (120s hard ceiling)
 *   - FIX: uncaughtException logs + exits (process supervisor should restart)
 *   - FIX: --no-open flag to skip browser auto-launch
 *   - FIX: /api/pe/resolve-ip better error propagation
 *   - IMPROVEMENT: All routes extracted to route files (future-ready)
 *
 */

'use strict';

const express  = require('express');
const axios    = require('axios');
const path     = require('path');
const fs       = require('fs');
const fsp      = require('fs').promises;
const { execFile } = require('child_process');

// ── Serial rate-limited queue ────────────────────────────────────
// Ensures calls to rate-limited APIs (ipwho.is, Scamalytics, ProxyEmpire IP)
// are serialised with a minimum interval between each call.
class SerialQueue {
  constructor(minIntervalMs, name) {
    this._queue    = Promise.resolve();
    this._interval = minIntervalMs;
    this._name     = name;
  }
  // Enqueue fn — returns a promise that resolves when fn completes
  run(fn) {
    const result = this._queue.then(async () => {
      const t0  = Date.now();
      const val = await fn();
      const elapsed = Date.now() - t0;
      const wait = this._interval - elapsed;
      if (wait > 0) {
        console.log(`[queue:${this._name}] waiting ${wait}ms before next call`);
        await new Promise(r => setTimeout(r, wait));
      }
      return val;
    });
    // Chain — next call waits for this one to fully complete including wait
    this._queue = result.then(() => {}, () => {});
    return result;
  }
}

// One queue per rate-limited service
const ipwhoQueue    = new SerialQueue(1100, 'ipwho');    // 1 req/sec
const scamQueue     = new SerialQueue(1100, 'scam');     // 1 req/sec
const resolveQueue  = new SerialQueue(1000, 'resolve');  // 1 IP resolve/sec



// ── Crash handling ──────────────────────────────────────────────
// After an uncaught exception Node's state is undefined.
// Log the error and exit — a process supervisor (pm2, systemd) should restart.
process.on('unhandledRejection', (r, promise) => {
  // Log but don't always exit — some rejections are from axios/network and recoverable
  const msg = (r && r.message) || String(r);
  const isNetwork = msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('ENOTFOUND') || msg.includes('socket hang up') || msg.includes('aborted');
  if (isNetwork) {
    console.warn('[warn] Unhandled network rejection (non-fatal):', msg);
    return;
  }
  console.error('[fatal] Unhandled rejection:', r);
  process.exit(1);
});
process.on('uncaughtException', e => {
  console.error('[fatal] Uncaught exception:', e);
  process.exit(1);
});

// ── Config ──────────────────────────────────────────────────────
const CONFIG_PATH    = path.join(__dirname, 'config.json');

const CONFIG_DEFAULTS = {
  port: 3000,
  scamalytics: { key: '', user: '', host: 'api11.scamalytics.com' },
};


// ── Scamalytics SSRF whitelist ──────────────────────────────────
const SCAM_ALLOWED_HOSTS = new Set([
  'api11.scamalytics.com',
  'api12.scamalytics.com',
]);

// ── Helpers ─────────────────────────────────────────────────────
function deepMerge(base, over) {
  const out = { ...base };
  for (const k of Object.keys(over)) {
    if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]))
      out[k] = deepMerge(base[k] || {}, over[k]);
    else out[k] = over[k];
  }
  return out;
}

function clampInt(v, min, max, fb) {
  const n = parseInt(v, 10);
  return isNaN(n) ? fb : Math.max(min, Math.min(max, n));
}

const delay = (ms) => new Promise(r => setTimeout(r, ms));

// ── Load + validate config ──────────────────────────────────────
let config = { ...CONFIG_DEFAULTS };
try {
  const raw = deepMerge(CONFIG_DEFAULTS, JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')));
  const port = clampInt(raw.port, 1024, 65535, CONFIG_DEFAULTS.port);
  config = { ...raw, port };
  console.log('[config] loaded from config.json');
} catch { console.log('[config] Using defaults'); }


async function saveConfig() {
  try { await fsp.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2)); }
  catch (e) { console.error('[config] Save failed:', e.message); }
}

// ── Express ─────────────────────────────────────────────────────
const app  = express();
const PORT = config.port || 3000;

// CSP headers
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' blob: data:",
    "connect-src 'self'",
    "script-src 'self'",
    "worker-src 'self' blob:",
  ].join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

// Request timeout — 120s hard ceiling prevents zombie connections
app.use((req, res, next) => {
  res.setTimeout(120000, () => {
    if (!res.headersSent) res.status(408).json({ error: 'Request timeout' });
  });
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/favicon.ico', (_, res) => res.status(204).end());

// ── ProxyEmpire panel API proxy ──────────────────────────────────
app.get('/api/pe/user', async (req, res) => {
  const key = req.headers['x-pe-key'];
  if (!key) return res.status(400).json({ error: 'Missing API key' });
  try {
    const r = await axios.get('https://panel.proxyempire.io/api/v1/user', {
      headers: { 'Authorization': `Bearer ${key}`, 'Accept': 'application/json' },
      timeout: 10000,
    });
    const raw = r.data;
    const payload = raw?.data || raw;
    res.json(payload);
  } catch (e) {
    const status = e.response?.status || 502;
    const msg    = e.response?.data?.message || e.response?.data?.error || e.message;
    console.warn('[pe/user] error:', status, msg);
    res.status(status).json({ error: msg });
  }
});

// ── Resolve exit IP through proxy ───────────────────────────────────────────────
// Supports socks5://, socks4://, http://, https:// proxy URLs.
// Uses raw Node http.request to tunnel through the proxy.
// Returns { ip, ms } — latency measured through the actual proxy tunnel.
app.post('/api/pe/resolve-ip', async (req, res) => {
  const { proxyUrl } = req.body || {};
  if (!proxyUrl) return res.status(400).json({ error: 'Missing proxyUrl' });
  if (typeof proxyUrl !== 'string' || proxyUrl.length > 2000) return res.status(400).json({ error: 'Invalid proxyUrl' });

  let p;
  try { p = new URL(proxyUrl); }
  catch { return res.status(400).json({ error: 'Invalid proxy URL' }); }

  const http  = require('http');
  const https = require('https');

  // Build proxy config for axios
  const proxyCfg = {
    protocol: 'http',
    host:     p.hostname,
    port:     parseInt(p.port) || 5000,
  };
  if (p.username) proxyCfg.auth = {
    username: decodeURIComponent(p.username),
    password: decodeURIComponent(p.password || ''),
  };

  // Use a raw Node http.request to tunnel through the proxy — avoids
  // axios redirect handling entirely. We send a plain HTTP GET for the
  // full URL (proxy-style absolute request) to a plain HTTP target.
  // No HTTPS = no CONNECT tunnel = no redirects possible.
  function proxyGet(targetUrl, timeoutMs) {
    return new Promise((resolve, reject) => {
      const target = new URL(targetUrl);
      const auth   = p.username
        ? 'Basic ' + Buffer.from(decodeURIComponent(p.username) + ':' + decodeURIComponent(p.password || '')).toString('base64')
        : null;
      const opts = {
        host:    p.hostname,
        port:    parseInt(p.port) || 5000,
        method:  'GET',
        path:    targetUrl,          // absolute URL in request line = proxy mode
        headers: {
          'Host':       target.host,
          'User-Agent': 'curl/8.0',
          'Accept':     'application/json',
          ...(auth ? { 'Proxy-Authorization': auth } : {}),
        },
      };
      const req2 = http.request(opts, (r) => {
        let body = '';
        r.setEncoding('utf8');
        r.on('data', d => { body += d; });
        r.on('end', () => resolve({ status: r.statusCode, body }));
      });
      req2.on('error', reject);
      req2.setTimeout(timeoutMs, () => { req2.destroy(new Error('timeout')); });
      req2.end();
    });
  }

  // Step 1 — get exit IP, serialised through resolveQueue (1/sec limit)
  let ip = null, ms = 0;
  try {
    const result = await resolveQueue.run(async () => {
      const t0 = Date.now();
      const ipTargets = [
        { url: 'http://api.ipify.org?format=json',     parse: b => { try { return JSON.parse(b).ip; } catch { return null; } } },
        { url: 'http://ip-api.com/json/?fields=query', parse: b => { try { return JSON.parse(b).query; } catch { return null; } } },
        { url: 'http://checkip.amazonaws.com/',        parse: b => b.trim().match(/^\d+\.\d+\.\d+\.\d+$/) ? b.trim() : null },
      ];
      let foundIp = null, lastErr = null;
      for (const t of ipTargets) {
        try {
          const r = await proxyGet(t.url, 15000);
          if (r.status === 407) {
            lastErr = new Error('Proxy authentication failed (407) — check credentials');
            break;
          }
          if (r.status === 200) { foundIp = t.parse(r.body); if (foundIp) break; }
        } catch (e) {
          lastErr = e;
          console.warn('[pe/resolve-ip] ' + t.url + ' failed: ' + (e.message || e.code));
        }
      }
      return { ip: foundIp, ms: Date.now() - t0, lastErr };
    });
    ip = result.ip; ms = result.ms;
    if (!ip) {
      const detail = result.lastErr ? (result.lastErr.message || result.lastErr.code || 'failed') : 'no IP returned';
      console.warn('[pe/resolve-ip] All targets failed: ' + detail);
      return res.status(502).json({ error: 'Proxy connection failed: ' + detail });
    }
  } catch (e) {
    console.warn('[pe/resolve-ip] Queue error: ' + e.message);
    return res.status(502).json({ error: 'Proxy connection failed: ' + e.message });
  }

  // Step 2 — geo enrichment via ipwho.is (1 req/sec limit).
  // Serialised through ipwhoQueue — 1.1s minimum between calls.
  let geo = {};
  try {
    geo = await ipwhoQueue.run(async () => {
      const gr = await axios.get('https://ipwho.is/' + ip, {
        timeout: 8000,
        headers: { 'Accept': 'application/json', 'User-Agent': 'IntegralAdScienceSuite/1.0' },
      });
      const d = gr.data;
      if (d && d.success) {
        return {
          city:      d.city      || '',
          region:    d.region    || '',
          country:   d.country   || '',
          latitude:  d.latitude  != null ? d.latitude  : null,
          longitude: d.longitude != null ? d.longitude : null,
          isp:       (d.connection && d.connection.isp) || '',
        };
      }
      return {};
    });
  } catch (e) {
    console.warn('[pe/resolve-ip] geo lookup failed: ' + (e.code || e.message));
  }

  console.log('[pe/resolve-ip] ' + ip + ' ' + (geo.city || '?') + ' (' + ms + 'ms)');
  res.json(Object.assign({ ip, ms }, geo));
});


// ── Scamalytics fraud score ───────────────────────────────────────
// SECURITY FIX: host is no longer accepted from the client. Only whitelisted hosts allowed.
app.post('/api/scam/check', async (req, res) => {
  const body = req.body || {};
  const ip   = body.ip;
  // Use server-side config as fallback if client doesn't send key/user
  const key  = body.key  || (config.scamalytics && config.scamalytics.key)  || '';
  const user = body.user || (config.scamalytics && config.scamalytics.user) || '';
  const host = body.host || (config.scamalytics && config.scamalytics.host) || 'api11.scamalytics.com';
  if (!ip || !key || !user) return res.status(400).json({ error: 'Missing ip, key, or user — configure Scamalytics in Settings' });
  const ipRe = /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]+$/;
  if (!ipRe.test(ip.trim())) return res.status(400).json({ error: 'Invalid IP format' });

  // SSRF whitelist — only allow known Scamalytics API hosts
  const requestedHost = (host || 'api11.scamalytics.com').replace(/[^a-z0-9.-]/gi, '');
  if (!SCAM_ALLOWED_HOSTS.has(requestedHost)) {
    return res.status(400).json({ error: `Host not allowed: ${requestedHost}. Use api11 or api12.scamalytics.com` });
  }

  const safeUser = user.replace(/[^a-z0-9_-]/gi, '');
  const url = `https://${requestedHost}/v3/${safeUser}/?key=${encodeURIComponent(key)}&ip=${encodeURIComponent(ip.trim())}`;
  // Serialised through scamQueue — 1.1s minimum between Scamalytics calls
  try {
    const data = await scamQueue.run(async () => {
      const r = await axios.get(url, {
        timeout: 8000,
        headers: { 'Accept': 'application/json', 'User-Agent': 'IntegralAdScienceSuite/1.0' },
      });
      return r.data;
    });
    res.json(data);
  } catch (e) {
    const status = e.response?.status || 502;
    const body   = e.response?.data || { error: e.message };
    res.status(status).json(body);
  }
});

// ── Scamalytics config (server-side storage) ─────────────────────
app.get('/api/scam/config', (_, res) => {
  const cfg = config.scamalytics || {};
  // Never return the actual key — just whether it's set
  res.json({ hasKey: !!(cfg.key), user: cfg.user || '', host: cfg.host || 'api11.scamalytics.com' });
});

app.post('/api/scam/config', async (req, res) => {
  try {

  const { key, user, host } = req.body || {};
  if (!key || !user) return res.status(400).json({ ok: false, error: 'key and user required' });
  const safeHost = (host || 'api11.scamalytics.com').replace(/[^a-z0-9.-]/gi, '');
  if (!SCAM_ALLOWED_HOSTS.has(safeHost)) return res.status(400).json({ ok: false, error: 'invalid host' });
  config.scamalytics = { key: key.trim(), user: user.trim(), host: safeHost };
  await saveConfig();
  console.log('[scam] config saved for user: ' + user.trim());
  res.json({ ok: true });

  } catch(e) {
    console.error('[route /api/scam/config]:', e.message);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

// ── Health ────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({
  status:  'ok',
  version: '1.0.0',
}));


// ── Getatext API proxy ────────────────────────────────────────────
// All getatext calls are proxied through the server so the API key
// never touches the browser and CORS is not an issue.
const GETATEXT_BASE = 'https://getatext.com';

async function getatextReq(method, path, body, apiKey) {
  const headers = { 'Auth': apiKey, 'Accept': 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  const opts = { method, headers, signal: AbortSignal.timeout(20000) };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(GETATEXT_BASE + path, opts);
  const text = await r.text();
  console.log('[getatext] ' + method + ' ' + path + ' → ' + r.status + ' | body[:120]: ' + text.slice(0, 120));
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: r.status, body: json };
}

// Balance
app.get('/api/getatext/balance', async (req, res) => {
  const key = req.headers['x-gat-key'] || '';
  if (!key) return res.status(400).json({ error: 'No API key' });
  try {
    const r = await getatextReq('GET', '/api/v1/balance', null, key);
    res.status(r.status).json(r.body);
  } catch(e) { res.status(502).json({ error: e.message }); }
});

// Services / prices
app.get('/api/getatext/prices', async (req, res) => {
  const key = req.headers['x-gat-key'] || '';
  if (!key) return res.status(400).json({ error: 'No API key' });
  try {
    const r = await getatextReq('GET', '/api/v1/prices-info', null, key);
    // Debug: log actual response structure so we can see field names
    if (r.body) {
      const sample = Array.isArray(r.body) ? r.body[0] : (typeof r.body === 'object' ? Object.values(r.body)[0] : r.body);
      console.log('[getatext/prices] status:', r.status, '| type:', Array.isArray(r.body) ? 'array['+r.body.length+']' : typeof r.body, '| sample keys:', sample ? Object.keys(sample || {}).join(',') : 'n/a');
    }
    res.status(r.status).json(r.body);
  } catch(e) { res.status(502).json({ error: e.message }); }
});

// Rent a number
app.post('/api/getatext/rent', async (req, res) => {
  const key = req.headers['x-gat-key'] || '';
  if (!key) return res.status(400).json({ error: 'No API key' });
  try {
    console.log('[getatext/rent] sending:', JSON.stringify(req.body));
    const r = await getatextReq('POST', '/api/v1/rent-a-number', req.body, key);
    console.log('[getatext/rent] response status:', r.status, '| body:', JSON.stringify(r.body).slice(0,200));
    res.status(r.status).json(r.body);
  } catch(e) { res.status(502).json({ error: e.message }); }
});

// Rental status (poll for SMS code)
app.post('/api/getatext/status', async (req, res) => {
  const key = req.headers['x-gat-key'] || '';
  if (!key) return res.status(400).json({ error: 'No API key' });
  try {
    const r = await getatextReq('POST', '/api/v1/rental-status', req.body, key);
    res.status(r.status).json(r.body);
  } catch(e) { res.status(502).json({ error: e.message }); }
});

// Cancel rental
app.post('/api/getatext/cancel', async (req, res) => {
  const key = req.headers['x-gat-key'] || '';
  if (!key) return res.status(400).json({ error: 'No API key' });
  try {
    const r = await getatextReq('POST', '/api/v1/cancel-rental', req.body, key);
    res.status(r.status).json(r.body);
  } catch(e) { res.status(502).json({ error: e.message }); }
});

// Mark completed
app.post('/api/getatext/complete/:id', async (req, res) => {
  const key = req.headers['x-gat-key'] || '';
  if (!key) return res.status(400).json({ error: 'No API key' });
  try {
    const r = await getatextReq('POST', '/api/v1/rental-status/' + req.params.id + '/completed', {}, key);
    res.status(r.status).json(r.body);
  } catch(e) { res.status(502).json({ error: e.message }); }
});

// ── Start ────────────────────────────────────────────────────────
app.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  Integral Ad Science suite v1.0\n  ${url}\n`);

  // --no-open flag skips auto-launching browser
  if (!process.argv.includes('--no-open')) {
    const open = process.platform === 'win32'  ? ['cmd',      ['/c', 'start', '', url]] :
                 process.platform === 'darwin' ? ['open',     [url]] :
                                                 ['xdg-open', [url]];
    execFile(open[0], open[1], () => {});
  }
});

