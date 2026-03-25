# Integral Ad Science Suite — Anti-Detect Testing Platform

## What this is

Internal tooling for IAS's anti-detect department. We get hired by platforms to stress-test their account creation defenses — probing image forensics, device fingerprinting, phone verification, proxy detection, and fraud scoring to find weaknesses before bad actors do.

This suite is the operator's workstation: take real photos, make them forensically unique per account, generate proxy identities, provision phone numbers, score fraud risk, and stage everything into account-ready bundles. Single-operator, runs locally, nothing phones home.

## Stack

- **Backend**: Node 22.5+ / Express 4, single `server.js` (~470 lines). No database. Config in `config.json`. All third-party API calls (ProxyEmpire, Scamalytics, Getatext) proxied server-side to keep keys off the browser.
- **Frontend**: Single `index.html` (~2260 lines) with inline CSS. 14 vanilla JS modules, no framework, no bundler. Modules communicate via `hub.js` (pub/sub event bus). Heavy image processing runs off-thread in `worker.js`.
- **Dependencies**: `express`, `axios` only. `npm start` and go.

## Architecture

### Tab layout (tabs.js)

```
images ─┬─ cleaner     Strip + re-encode photos through the privacy pipeline
        ├─ generator   Rebuild with synthetic device identity
        ├─ analyzer    Forensic verification — score how detectable an image is
        └─ ready       Staging area, cleaned images grouped and ready to assign
proxies ── ProxyEmpire proxy generation, IP resolution, geo + fraud scoring
number  ── Getatext SMS rental for phone verification steps
accounts ─ Per-account cards: proxy + number + images bundled together
settings ─ Scamalytics fraud score API credentials
```

### Image pipeline (pipeline.js + worker.js)

The core of the anti-detect work. 18-layer privacy pipeline, runs entirely client-side in a Web Worker:

| Layer | What it defeats |
|-------|----------------|
| L1 | Metadata cross-matching (full EXIF/XMP/IPTC strip + thumbnail removal) |
| L2 | Binary fingerprinting (canvas round-trip re-encode) |
| L3 | LSB steganalysis detection (controlled pixel noise injection) |
| L4 | PRNU sensor fingerprinting (synthetic sensor noise spoof) |
| L5 | Color histogram clustering (micro color/gamma shift) |
| L6 | Neural network classifiers (adversarial gradient perturbation) |
| L7 | Perceptual hash matching — pHash, dHash, aHash (defeat verification) |
| L8 | Content flagging (NSFW/policy detection pre-check) |
| L9 | Quality assurance (ΔE perceptual difference — ensures visual fidelity) |

### Module roles

**generator.js** (~4000 lines, most complex module) — Takes a photo and rebuilds it with a completely new believable device identity. Same pixels, different forensic signature. Handles EXIF construction, quantization table profiles per device model, chroma subsampling patterns, and encoding signatures that match real hardware. This is what makes each account's photos look like they came from a different phone.

**analyzer.js** (~1400 lines) — Verification layer. 4-tier forensic analysis that scores how detectable an image is:
- L1 File Structure: bitstream, segments, IFD1 thumbnail, C2PA provenance
- L2 Device Identity: EXIF fingerprint, software chain, timestamps, GPS
- L3 JPEG Encoding: QT table matching, chroma, DCT double-compression artifacts
- L4 Pixel Forensics: PRNU residual (FBI/SWGDE methodology), LSB steganalysis, IRS pentagon (GLCM/CED/VBL/MS)

Multiplicative penalty scoring with hybrid fusion (α=0.68 structural, β=0.32 pixel). Run this after cleaning to confirm the image passes.

**cleaner.js** — Pipeline GUI. Drag-to-reorder queue, presets for different intensity levels, per-image time estimates, skip-already-cleaned logic.

**ready.js** — Staging area. Cleaned images land here in named groups. 6 thumbnails per row, click to select, drag to assign to account cards.

**proxyempire.js** — Proxy generation panel. Random and manual modes, mobile/residential type selection, IP resolution with geo enrichment (city/region/ISP via ipwho.is), integrated Scamalytics fraud scoring per proxy. Each proxy can be pushed to an account card.

**numbers.js** — Getatext SMS rental. Pick service, set max price, rent number, poll for incoming verification code, cancel/complete. Numbers push to account cards.

**telegram.js** — Account card manager. Each account bundles: one proxy, one phone number, assigned images. Cards are numbered permanently, archive on delete, persist via localStorage. This is the final assembly point.

### Cross-module data flow

```
cleaner ──→ [pipeline/worker] ──→ ready ──→ accounts
                                               ↑
proxies (ProxyEmpire + Scamalytics) ──────→ accounts
number  (Getatext SMS) ───────────────────→ accounts
```

All inter-module communication goes through `hub.js`:
- `hub.pub('images:cleaned', data)` — pipeline output → ready tab
- `hub.pub('proxy:assign', data)` — proxy → account card
- `hub.pub('number:assign', data)` — phone number → account card

No module directly references another module. This keeps things modular — you can swap out the proxy provider or SMS service without touching the image pipeline.

### Server routes

Every server route is either an API proxy (keeping credentials server-side) or a utility:

```
GET  /api/pe/user              ProxyEmpire account info
POST /api/pe/resolve-ip        Resolve exit IP + geo through a given proxy
POST /api/scam/check           Scamalytics fraud score for an IP
GET  /api/scam/config          Scamalytics config (key presence, not the key itself)
POST /api/scam/config          Save Scamalytics credentials server-side
GET  /api/health               Health check
GET  /api/getatext/balance     SMS service balance
GET  /api/getatext/prices      Available services + pricing
POST /api/getatext/rent        Rent a phone number
POST /api/getatext/status      Poll for incoming SMS
POST /api/getatext/cancel      Cancel a rental
POST /api/getatext/complete/:id Mark rental done
```

Rate-limited external APIs are serialized through `SerialQueue` (ipwho.is at 1 req/sec, Scamalytics at 1 req/sec, IP resolve at 1/sec).

## File map

| File | Lines | Role |
|------|-------|------|
| `server.js` | 471 | Express server, API proxies, rate limiting, config |
| `public/index.html` | 2261 | Full SPA markup + inline CSS |
| `public/js/generator.js` | 4074 | Synthetic device identity rebuilder |
| `public/js/analyzer.js` | 1412 | Forensic analysis + detectability scoring |
| `public/js/pipeline.js` | 921 | 18-layer image privacy pipeline |
| `public/js/ready.js` | 757 | Cleaned image staging + grouping |
| `public/js/telegram.js` | 665 | Account card assembly + management |
| `public/js/proxyempire.js` | 660 | Proxy generation + IP/geo/fraud resolution |
| `public/js/cleaner.js` | 580 | Pipeline GUI (queue, presets, estimates) |
| `public/js/numbers.js` | 500 | SMS number rental GUI |
| `public/js/utils.js` | 190 | Shared helpers (batching, toast, formatting) |
| `public/js/settings.js` | 95 | Scamalytics credential management |
| `public/js/tabs.js` | 98 | Tab/sub-tab/accordion system |
| `public/js/hub.js` | 52 | Pub/sub event bus + shared store |
| `public/js/worker.js` | 33 | Web Worker bridge for pipeline |
| `public/js/boot.js` | 4 | Startup sequence |

## Conventions

- **No framework, no build step.** `$()` = `document.getElementById`. CSS inline in index.html.
- **Module isolation.** Communication only through `hub.js`. DOM IDs prefixed by feature area.
- **Config on disk.** `config.json` read at startup, written by `saveConfig()`. No database.
- **Strict CSP.** Server sets Content-Security-Policy — `'self'` only, no inline scripts.
- **Debug panel.** `Ctrl+D` opens hidden debug log. Modules call `dbg(msg, className)`.
- **Error handling.** Global `uncaughtException`/`unhandledRejection` handlers. Network errors non-fatal, everything else exits for process supervisor restart.
- **Rate limiting.** All external API calls go through `SerialQueue` instances with enforced minimum intervals. Never hammer third-party endpoints.
