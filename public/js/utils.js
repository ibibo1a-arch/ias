/**
 * utils.js — Shared utilities for ImageScrub
 * Zero dependencies, no DOM manipulation beyond toast.
 */
'use strict';

const $ = id => document.getElementById(id);

function esc(s) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(s));
  return d.innerHTML;
}

function fmt(b) {
  return b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
}

function showToast(m, d) {
  const t = $('toast');
  t.textContent = m;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), d || 3000);
}

function dl(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// ── Debug logger ─────────────────────────────────────────────────
const debugLog = [];

function dbg(msg, cls) {
  const entry = { time: new Date().toLocaleTimeString(), msg, cls: cls || '' };
  debugLog.push(entry);
  const body = $('debugBody');
  if (body) {
    if (debugLog.length > 200) { debugLog.shift(); if (body.firstChild) body.removeChild(body.firstChild); }
    const el = document.createElement('div');
    el.className = 'debug-entry' + (entry.cls ? ' ' + entry.cls : '');
    el.textContent = '[' + entry.time + '] ' + entry.msg;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
  }
}

// ── Pooled fetch ─────────────────────────────────────────────────
async function pooledFetch(items, fn, concurrency, onProgress) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map(fn));
    settled.forEach((r, j) => {
      results.push(r);
      if (onProgress) onProgress(i + j + 1, items.length, r);
    });
  }
  return results;
}

// ── Fetch image blob through proxy ───────────────────────────────
async function fetchImageBlob(url, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`/api/proxy-image?url=${encodeURIComponent(url)}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Proxy ${res.status}`);
    const blob = await res.blob();
    if (!blob || blob.size === 0) throw new Error('Empty response');
    if (blob.type && !blob.type.startsWith('image/')) throw new Error('Not an image');
    return blob;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`Image fetch timed out after ${timeoutMs / 1000}s`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function makeTag(cls, text) {
  const s = document.createElement('span');
  s.className = 'tag-s ' + cls;
  s.textContent = text;
  return s;
}

// ── ZIP writer (no dependencies) ─────────────────────────────────
// Builds a valid ZIP archive in memory from an array of {name, blob} entries.
// Uses STORE compression (no deflate) — ideal for already-compressed JPEGs/PNGs.
// Returns a Blob with type 'application/zip'.

const _CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function _crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = _CRC32_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function _u16(n) { return [(n) & 0xFF, (n >> 8) & 0xFF]; }
function _u32(n) { return [(n) & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >> 24) & 0xFF]; }

async function buildZip(entries) {
  // entries: [{name: string, blob: Blob}]
  const localHeaders = [];
  const centralDir   = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const data      = new Uint8Array(await entry.blob.arrayBuffer());
    const crc       = _crc32(data);
    const size      = data.length;
    const dosDate   = 0x5465; // 2022-03-05 — fixed date so ZIP is deterministic
    const dosTime   = 0x0000;

    // Local file header
    const lh = [
      0x50,0x4B,0x03,0x04, // signature
      0x14,0x00,           // version needed: 2.0
      0x00,0x00,           // flags
      0x00,0x00,           // compression: STORED
      ..._u16(dosTime), ..._u16(dosDate),
      ..._u32(crc),
      ..._u32(size), ..._u32(size), // compressed = uncompressed (stored)
      ..._u16(nameBytes.length),
      0x00,0x00,           // extra field length
      ...nameBytes,
    ];
    localHeaders.push({ lh, data, nameBytes, crc, size, dosDate, dosTime, offset });
    offset += lh.length + size;
  }

  for (const e of localHeaders) {
    const cd = [
      0x50,0x4B,0x01,0x02, // central dir signature
      0x3F,0x00,           // version made by: Unix
      0x14,0x00,           // version needed: 2.0
      0x00,0x00,           // flags
      0x00,0x00,           // compression: STORED
      ..._u16(e.dosTime), ..._u16(e.dosDate),
      ..._u32(e.crc),
      ..._u32(e.size), ..._u32(e.size),
      ..._u16(e.nameBytes.length),
      0x00,0x00,           // extra field length
      0x00,0x00,           // comment length
      0x00,0x00,           // disk start
      0x00,0x00,           // internal attr
      0x00,0x00,0x00,0x00, // external attr
      ..._u32(e.offset),   // local header offset
      ...e.nameBytes,
    ];
    centralDir.push(cd);
  }

  const cdSize   = centralDir.reduce((s, c) => s + c.length, 0);
  const eocd = [
    0x50,0x4B,0x05,0x06, // end of central dir signature
    0x00,0x00,           // disk number
    0x00,0x00,           // disk with central dir
    ..._u16(localHeaders.length),
    ..._u16(localHeaders.length),
    ..._u32(cdSize),
    ..._u32(offset),     // central dir offset
    0x00,0x00,           // comment length
  ];

  const parts = [];
  for (const e of localHeaders) {
    parts.push(new Uint8Array(e.lh));
    parts.push(e.data);
  }
  for (const cd of centralDir) parts.push(new Uint8Array(cd));
  parts.push(new Uint8Array(eocd));

  return new Blob(parts, { type: 'application/zip' });
}
