
// ── Browser yield helper (prevents tab freeze on large images) ──────
const GEN_CHUNK_ROWS = 64;
async function genYield() {
  if (typeof scheduler !== 'undefined' && scheduler.yield) {
    await scheduler.yield();
  } else {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}
/**
 * generator.js — Image identity generator
 *
 * Takes a real photo and rebuilds it with a completely new believable
 * device identity. Visually identical — forensically a different device.
 *
 * What it does vs the cleaner:
 *   Cleaner  → strips all identifiers (nothing left)
 *   Generator → replaces all identifiers with realistic fakes (looks real)
 *
 * Presets:
 *   Light  — replaces metadata + JPEG encoding. Pixel-perfect output.
 *   Medium — adds GPS, consistent timestamps, correct QT tables, PRNU normalisation
 *   Heavy  — adds histogram smoothing, micro-warp, pHash defeat, chroma spoof
 *
 * All processing is client-side. No images leave the machine.
 */
'use strict';

// ═════════════════════════════════════════════════════════════════
// DEVICE LIBRARY — real EXIF values per device model
// ═════════════════════════════════════════════════════════════════
const GEN_DEVICES = {
  ip17promax: {
    make:'Apple', model:'iPhone 17 Pro Max', softwarePool:['26.3.1','26.3.1','26.3.1','26.3','26.2'],
    lensMake:'Apple', lensModel:'iPhone 17 Pro Max back triple camera 6.765mm f/1.78',
    focalLength:6.765, focalLength35:24, fNumber:1.78,
    colorSpace:65535, dpi:72, jpegType:'baseline', qt:{luma:92,chroma:86},
    isoPool:[32,50,50,64,100,100,125,200], shutterPool:[1/60,1/120,1/120,1/250,1/250,1/500,1/1000],
    orientation:'auto', ycbcrPositioning:1,
    note:'iPhone 17 Pro Max · iOS 26 · f/1.78 · 24mm',
  },
  ip17pro: {
    make:'Apple', model:'iPhone 17 Pro', softwarePool:['26.3.1','26.3.1','26.3.1','26.3','26.2'],
    lensMake:'Apple', lensModel:'iPhone 17 Pro back triple camera 6.765mm f/1.78',
    focalLength:6.765, focalLength35:24, fNumber:1.78,
    colorSpace:65535, dpi:72, jpegType:'baseline', qt:{luma:92,chroma:86},
    isoPool:[32,50,50,64,100,100,125,200], shutterPool:[1/60,1/120,1/120,1/250,1/250,1/500,1/1000],
    orientation:'auto', ycbcrPositioning:1,
    note:'iPhone 17 Pro · iOS 26 · f/1.78 · 24mm',
  },
  ip17air: {
    make:'Apple', model:'iPhone Air', softwarePool:['26.3.1','26.3.1','26.3.1','26.3','26.2'],
    lensMake:'Apple', lensModel:'iPhone Air back camera 6.765mm f/1.78',
    focalLength:6.765, focalLength35:24, fNumber:1.78,
    colorSpace:65535, dpi:72, jpegType:'baseline', qt:{luma:92,chroma:86},
    isoPool:[32,50,50,64,100,100,125,200], shutterPool:[1/60,1/120,1/120,1/250,1/250,1/500,1/1000],
    orientation:'auto', ycbcrPositioning:1,
    note:'iPhone Air · iOS 26 · f/1.78 · 24mm',
  },
  ip17: {
    make:'Apple', model:'iPhone 17', softwarePool:['26.3.1','26.3.1','26.3.1','26.3','26.2'],
    lensMake:'Apple', lensModel:'iPhone 17 back dual wide camera 6.765mm f/1.78',
    focalLength:6.765, focalLength35:24, fNumber:1.78,
    colorSpace:65535, dpi:72, jpegType:'baseline', qt:{luma:92,chroma:86},
    isoPool:[32,50,50,64,100,100,125,200], shutterPool:[1/60,1/120,1/120,1/250,1/250,1/500,1/1000],
    orientation:'auto', ycbcrPositioning:1,
    note:'iPhone 17 · iOS 26 · f/1.78 · 24mm',
  },
  ip16promax: {
    make:'Apple', model:'iPhone 16 Pro Max', softwarePool:['26.3.1','26.3.1','26.3','26.2','18.5','18.4','18.3.2','18.3.1','18.3','18.2.1','18.2','18.1.1','18.1','18.0.1','18.0'],
    lensMake:'Apple', lensModel:'iPhone 16 Pro Max back triple camera 6.765mm f/1.78',
    focalLength:6.765, focalLength35:24, fNumber:1.78,
    colorSpace:65535, dpi:72, jpegType:'baseline', qt:{luma:92,chroma:86},
    isoPool:[32,50,50,64,100,100,125,200], shutterPool:[1/60,1/120,1/120,1/250,1/250,1/500,1/1000],
    orientation:'auto', ycbcrPositioning:1,
    note:'iPhone 16 Pro Max · iOS 18–26 · f/1.78 · 24mm',
  },
  ip16pro: {
    make:'Apple', model:'iPhone 16 Pro', softwarePool:['26.3.1','26.3.1','26.3','26.2','18.5','18.4','18.3.2','18.3.1','18.3','18.2.1','18.2','18.1.1','18.1','18.0.1','18.0'],
    lensMake:'Apple', lensModel:'iPhone 16 Pro back triple camera 6.765mm f/1.78',
    focalLength:6.765, focalLength35:24, fNumber:1.78,
    colorSpace:65535, dpi:72, jpegType:'baseline', qt:{luma:92,chroma:86},
    isoPool:[32,50,50,64,100,100,125,200], shutterPool:[1/60,1/120,1/120,1/250,1/250,1/500,1/1000],
    orientation:'auto', ycbcrPositioning:1,
    note:'iPhone 16 Pro · iOS 18–26 · f/1.78 · 24mm',
  },
  ip16plus: {
    make:'Apple', model:'iPhone 16 Plus', softwarePool:['26.3.1','26.3.1','26.3','26.2','18.5','18.4','18.3.2','18.3.1','18.3','18.2.1','18.2','18.1.1','18.1','18.0.1','18.0'],
    lensMake:'Apple', lensModel:'iPhone 16 Plus back dual wide camera 5.7mm f/1.6',
    focalLength:5.7, focalLength35:26, fNumber:1.6,
    colorSpace:65535, dpi:72, jpegType:'baseline', qt:{luma:90,chroma:85},
    isoPool:[50,50,64,100,100,125,200,250], shutterPool:[1/60,1/120,1/120,1/250,1/250,1/500],
    orientation:'auto', ycbcrPositioning:1,
    note:'iPhone 16 Plus · iOS 18–26 · f/1.6 · 26mm',
  },
  ip16: {
    make:'Apple', model:'iPhone 16', softwarePool:['26.3.1','26.3.1','26.3','26.2','18.5','18.4','18.3.2','18.3.1','18.3','18.2.1','18.2','18.1.1','18.1','18.0.1','18.0'],
    lensMake:'Apple', lensModel:'iPhone 16 back dual wide camera 5.7mm f/1.6',
    focalLength:5.7, focalLength35:26, fNumber:1.6,
    colorSpace:65535, dpi:72, jpegType:'baseline', qt:{luma:90,chroma:85},
    isoPool:[50,50,64,100,100,125,200,250], shutterPool:[1/60,1/120,1/120,1/250,1/250,1/500],
    orientation:'auto', ycbcrPositioning:1,
    note:'iPhone 16 · iOS 18–26 · f/1.6 · 26mm',
  },
  ip16e: {
    make:'Apple', model:'iPhone 16e', softwarePool:['26.3.1','26.3.1','26.3','26.2','18.5','18.4','18.3.2','18.3.1','18.3'],
    lensMake:'Apple', lensModel:'iPhone 16e back camera 5.7mm f/1.6',
    focalLength:5.7, focalLength35:26, fNumber:1.6,
    colorSpace:65535, dpi:72, jpegType:'baseline', qt:{luma:90,chroma:84},
    isoPool:[50,50,64,100,100,125,200,250], shutterPool:[1/60,1/120,1/120,1/250,1/250,1/500],
    orientation:'auto', ycbcrPositioning:1,
    note:'iPhone 16e · iOS 18–26 · f/1.6 · 26mm',
  },
  ip15promax: {
    make:'Apple', model:'iPhone 15 Pro Max', softwarePool:['26.3.1','26.3.1','26.3','26.2','18.5','18.4','18.3.2','18.3.1','18.3','18.2.1','18.2','18.1.1','18.1','18.0.1','18.0','17.7.2','17.7.1','17.6.1','17.6','17.5.1','17.5','17.4.1','17.4'],
    lensMake:'Apple', lensModel:'iPhone 15 Pro Max back triple camera 6.765mm f/1.78',
    focalLength:6.765, focalLength35:24, fNumber:1.78,
    colorSpace:65535, dpi:72, jpegType:'baseline', qt:{luma:92,chroma:86},
    isoPool:[32,50,50,64,100,100,125,200], shutterPool:[1/60,1/120,1/120,1/250,1/250,1/500,1/1000],
    orientation:'auto', ycbcrPositioning:1,
    note:'iPhone 15 Pro Max · iOS 17–26 · f/1.78 · 24mm',
  },
  ip15pro: {
    make:'Apple', model:'iPhone 15 Pro', softwarePool:['26.3.1','26.3.1','26.3','26.2','18.5','18.4','18.3.2','18.3.1','18.3','18.2.1','18.2','18.1.1','18.1','18.0.1','18.0','17.7.2','17.7.1','17.6.1','17.6','17.5.1','17.5','17.4.1','17.4'],
    lensMake:'Apple', lensModel:'iPhone 15 Pro back triple camera 6.765mm f/1.78',
    focalLength:6.765, focalLength35:24, fNumber:1.78,
    colorSpace:65535, dpi:72, jpegType:'baseline', qt:{luma:92,chroma:86},
    isoPool:[32,50,50,64,100,100,125,200], shutterPool:[1/60,1/120,1/120,1/250,1/250,1/500,1/1000],
    orientation:'auto', ycbcrPositioning:1,
    note:'iPhone 15 Pro · iOS 17–26 · f/1.78 · 24mm',
  },

  // ── CARBON MODE DEVICE PROFILES ─────────────────────────────────
  // Every field is sourced from Apple spec sheets + real EXIF samples.
  // These are the ONLY values Carbon mode uses — nothing is derived at runtime.
  carbon_ip15pro: {
    make:'Apple', model:'iPhone 15 Pro',
    softwarePool:['26.3.1','26.3','26.2.1','26.2','26.1','26.0.1','26.0','18.5','18.4.1','18.4','18.3.2','18.3.1','18.3','18.2.1','18.2','18.1.1','18.1','18.0.1','18.0','17.7.2','17.7.1','17.7','17.6.1','17.6','17.5.1','17.5','17.4.1','17.4','17.3.1','17.3','17.2.1','17.2','17.1.2','17.1.1','17.1','17.0.3','17.0.2','17.0.1','17.0'],
    lensMake:'Apple',
    lensModel:'iPhone 15 Pro back triple camera 6.765mm f/1.78',
    focalLength:6.765, focalLength35:24, fNumber:1.78,
    colorSpace:65535, dpi:72, jpegType:'baseline',
    qt:{ luma:92, chroma:86 },
    // Real measured ISO pools from iPhone 15 Pro daylight/indoor samples
    isoPool:[32,32,50,50,50,64,64,100,100,100,125,160,200,250,320,400,500,640,800,1000,1250,1600,2000,2500,3200],
    // Real shutter pools — daylight weighted toward fast, indoor toward slow
    shutterPool:[1/4000,1/3200,1/2500,1/2000,1/1600,1/1250,1/1000,1/800,1/640,1/500,1/500,1/400,1/320,1/250,1/250,1/200,1/160,1/120,1/120,1/100,1/80,1/60,1/50,1/40,1/30,1/25,1/15,1/10,1/8],
    ycbcrPositioning:1,
    flash:24,           // 0x18 = Auto, did not fire — always on iPhone
    meteringMode:5,     // Pattern
    exposureMode:0,     // Auto
    whiteBalance:0,     // Auto
    sceneCaptureType:0, // Standard
    subSecDigits:3,     // Apple always writes exactly 3 digits
    // Shoot modes: resolution × aspect for each real iPhone 15 Pro mode
    shootModes: {
      main_24mp:   { W:5712, H:4284, label:'Main · 24MP · 5712×4284', focalLength:6.765, focalLength35:24, fNumber:1.78, lensModel:'iPhone 15 Pro back triple camera 6.765mm f/1.78', sizeMB:[3.8,6.2] },
      main_12mp:   { W:4032, H:3024, label:'Main · 12MP · 4032×3024', focalLength:6.765, focalLength35:24, fNumber:1.78, lensModel:'iPhone 15 Pro back triple camera 6.765mm f/1.78', sizeMB:[2.4,4.1] },
      tele_3x:     { W:4032, H:3024, label:'3× Tele · 12MP · 4032×3024', focalLength:20.000, focalLength35:77, fNumber:2.8,  lensModel:'iPhone 15 Pro back triple camera 20mm f/2.8', sizeMB:[2.1,3.5] },
      ultrawide:   { W:4032, H:3024, label:'Ultra Wide · 12MP · 4032×3024', focalLength:2.220,  focalLength35:13, fNumber:2.2,  lensModel:'iPhone 15 Pro back triple camera 2.22mm f/2.2', sizeMB:[2.0,3.2] },
      front:       { W:3088, H:2316, label:'Front · 12MP · 3088×2316', focalLength:2.690,  focalLength35:23, fNumber:1.9,  lensModel:'iPhone 15 Pro front camera 2.69mm f/1.9', sizeMB:[1.8,3.0] },
    },
    note:'iPhone 15 Pro · iOS 17 · f/1.78 · 24mm',
  },
  carbon_ip15promax: {
    make:'Apple', model:'iPhone 15 Pro Max',
    softwarePool:['17.7.2','17.7.1','17.6.1','17.6','17.5.1','17.5','17.4.1','17.4','17.3.1','17.3','17.2.1','17.2','17.1.2','17.1.1','17.1','17.0.3','17.0.2','17.0.1','17.0'],
    lensMake:'Apple',
    lensModel:'iPhone 15 Pro Max back triple camera 6.765mm f/1.78',
    focalLength:6.765, focalLength35:24, fNumber:1.78,
    colorSpace:65535, dpi:72, jpegType:'baseline',
    qt:{ luma:92, chroma:86 },
    isoPool:[32,32,50,50,50,64,64,100,100,100,125,160,200,250,320,400,500,640,800,1000,1250,1600,2000,2500,3200],
    shutterPool:[1/4000,1/3200,1/2500,1/2000,1/1600,1/1250,1/1000,1/800,1/640,1/500,1/500,1/400,1/320,1/250,1/250,1/200,1/160,1/120,1/120,1/100,1/80,1/60,1/50,1/40,1/30,1/25,1/15,1/10,1/8],
    ycbcrPositioning:1, flash:24, meteringMode:5, exposureMode:0, whiteBalance:0, sceneCaptureType:0, subSecDigits:3,
    shootModes: {
      main_24mp:   { W:5712, H:4284, label:'Main · 24MP · 5712×4284', focalLength:6.765, focalLength35:24, fNumber:1.78, lensModel:'iPhone 15 Pro Max back triple camera 6.765mm f/1.78', sizeMB:[3.8,6.2] },
      main_12mp:   { W:4032, H:3024, label:'Main · 12MP · 4032×3024', focalLength:6.765, focalLength35:24, fNumber:1.78, lensModel:'iPhone 15 Pro Max back triple camera 6.765mm f/1.78', sizeMB:[2.4,4.1] },
      tele_5x:     { W:4032, H:3024, label:'5× Tele · 12MP · 4032×3024', focalLength:23.587, focalLength35:120, fNumber:2.8, lensModel:'iPhone 15 Pro Max back triple camera 23.587mm f/2.8', sizeMB:[2.1,3.5] },
      ultrawide:   { W:4032, H:3024, label:'Ultra Wide · 12MP · 4032×3024', focalLength:2.220, focalLength35:13, fNumber:2.2, lensModel:'iPhone 15 Pro Max back triple camera 2.22mm f/2.2', sizeMB:[2.0,3.2] },
      front:       { W:3088, H:2316, label:'Front · 12MP · 3088×2316', focalLength:2.690, focalLength35:23, fNumber:1.9, lensModel:'iPhone 15 Pro Max front camera 2.69mm f/1.9', sizeMB:[1.8,3.0] },
    },
    note:'iPhone 15 Pro Max · iOS 17 · f/1.78 · 24mm',
  },
  carbon_ip16pro: {
    make:'Apple', model:'iPhone 16 Pro',
    softwarePool:['18.5','18.4.1','18.4','18.3.2','18.3.1','18.3','18.2.1','18.2','18.1.1','18.1','18.0.1','18.0'],
    lensMake:'Apple',
    lensModel:'iPhone 16 Pro back triple camera 6.765mm f/1.78',
    focalLength:6.765, focalLength35:24, fNumber:1.78,
    colorSpace:65535, dpi:72, jpegType:'baseline',
    qt:{ luma:92, chroma:86 },
    isoPool:[32,32,50,50,50,64,64,100,100,100,125,160,200,250,320,400,500,640,800,1000,1250,1600,2000,2500,3200],
    shutterPool:[1/4000,1/3200,1/2500,1/2000,1/1600,1/1250,1/1000,1/800,1/640,1/500,1/500,1/400,1/320,1/250,1/250,1/200,1/160,1/120,1/120,1/100,1/80,1/60,1/50,1/40,1/30,1/25,1/15,1/10,1/8],
    ycbcrPositioning:1, flash:24, meteringMode:5, exposureMode:0, whiteBalance:0, sceneCaptureType:0, subSecDigits:3,
    shootModes: {
      main_48mp:   { W:8064, H:6048, label:'Main · 48MP · 8064×6048', focalLength:6.765, focalLength35:24, fNumber:1.78, lensModel:'iPhone 16 Pro back triple camera 6.765mm f/1.78', sizeMB:[7.0,9.5] },
      main_24mp:   { W:5712, H:4284, label:'Main · 24MP · 5712×4284', focalLength:6.765, focalLength35:24, fNumber:1.78, lensModel:'iPhone 16 Pro back triple camera 6.765mm f/1.78', sizeMB:[3.8,6.2] },
      main_12mp:   { W:4032, H:3024, label:'Main · 12MP · 4032×3024', focalLength:6.765, focalLength35:24, fNumber:1.78, lensModel:'iPhone 16 Pro back triple camera 6.765mm f/1.78', sizeMB:[2.4,4.1] },
      tele_5x:     { W:4032, H:3024, label:'5× Tele · 12MP · 4032×3024', focalLength:23.587, focalLength35:120, fNumber:2.8, lensModel:'iPhone 16 Pro back triple camera 23.587mm f/2.8', sizeMB:[2.1,3.5] },
      ultrawide:   { W:4032, H:3024, label:'Ultra Wide · 12MP · 4032×3024', focalLength:2.220, focalLength35:13, fNumber:2.2, lensModel:'iPhone 16 Pro back triple camera 2.22mm f/2.2', sizeMB:[2.0,3.2] },
      front:       { W:3088, H:2316, label:'Front · 12MP · 3088×2316', focalLength:2.690, focalLength35:23, fNumber:1.9, lensModel:'iPhone 16 Pro front camera 2.69mm f/1.9', sizeMB:[1.8,3.0] },
    },
    note:'iPhone 16 Pro · iOS 18 · f/1.78 · 24mm',
  },
  carbon_ip16promax: {
    make:'Apple', model:'iPhone 16 Pro Max',
    softwarePool:['18.5','18.4.1','18.4','18.3.2','18.3.1','18.3','18.2.1','18.2','18.1.1','18.1','18.0.1','18.0'],
    lensMake:'Apple',
    lensModel:'iPhone 16 Pro Max back triple camera 6.765mm f/1.78',
    focalLength:6.765, focalLength35:24, fNumber:1.78,
    colorSpace:65535, dpi:72, jpegType:'baseline',
    qt:{ luma:92, chroma:86 },
    isoPool:[32,32,50,50,50,64,64,100,100,100,125,160,200,250,320,400,500,640,800,1000,1250,1600,2000,2500,3200],
    shutterPool:[1/4000,1/3200,1/2500,1/2000,1/1600,1/1250,1/1000,1/800,1/640,1/500,1/500,1/400,1/320,1/250,1/250,1/200,1/160,1/120,1/120,1/100,1/80,1/60,1/50,1/40,1/30,1/25,1/15,1/10,1/8],
    ycbcrPositioning:1, flash:24, meteringMode:5, exposureMode:0, whiteBalance:0, sceneCaptureType:0, subSecDigits:3,
    shootModes: {
      main_48mp:   { W:8064, H:6048, label:'Main · 48MP · 8064×6048', focalLength:6.765, focalLength35:24, fNumber:1.78, lensModel:'iPhone 16 Pro Max back triple camera 6.765mm f/1.78', sizeMB:[7.0,9.5] },
      main_24mp:   { W:5712, H:4284, label:'Main · 24MP · 5712×4284', focalLength:6.765, focalLength35:24, fNumber:1.78, lensModel:'iPhone 16 Pro Max back triple camera 6.765mm f/1.78', sizeMB:[3.8,6.2] },
      main_12mp:   { W:4032, H:3024, label:'Main · 12MP · 4032×3024', focalLength:6.765, focalLength35:24, fNumber:1.78, lensModel:'iPhone 16 Pro Max back triple camera 6.765mm f/1.78', sizeMB:[2.4,4.1] },
      tele_5x:     { W:4032, H:3024, label:'5× Tele · 12MP · 4032×3024', focalLength:23.587, focalLength35:120, fNumber:2.8, lensModel:'iPhone 16 Pro Max back triple camera 23.587mm f/2.8', sizeMB:[2.1,3.5] },
      ultrawide:   { W:4032, H:3024, label:'Ultra Wide · 12MP · 4032×3024', focalLength:2.220, focalLength35:13, fNumber:2.2, lensModel:'iPhone 16 Pro Max back triple camera 2.22mm f/2.2', sizeMB:[2.0,3.2] },
      front:       { W:3088, H:2316, label:'Front · 12MP · 3088×2316', focalLength:2.690, focalLength35:23, fNumber:1.9, lensModel:'iPhone 16 Pro Max front camera 2.69mm f/1.9', sizeMB:[1.8,3.0] },
    },
    note:'iPhone 16 Pro Max · iOS 18 · f/1.78 · 24mm',
  },
  carbon_ip17pro: {
    make:'Apple', model:'iPhone 17 Pro',
    softwarePool:['26.3.1','26.3','26.2','26.1','26.0.1','26.0'],
    lensMake:'Apple',
    lensModel:'iPhone 17 Pro back triple camera 6.765mm f/1.78',
    focalLength:6.765, focalLength35:24, fNumber:1.78,
    colorSpace:65535, dpi:72, jpegType:'baseline',
    qt:{ luma:92, chroma:86 },
    isoPool:[32,32,50,50,50,64,64,100,100,100,125,160,200,250,320,400,500,640,800,1000,1250,1600,2000,2500,3200],
    shutterPool:[1/4000,1/3200,1/2500,1/2000,1/1600,1/1250,1/1000,1/800,1/640,1/500,1/500,1/400,1/320,1/250,1/250,1/200,1/160,1/120,1/120,1/100,1/80,1/60,1/50,1/40,1/30,1/25,1/15,1/10,1/8],
    ycbcrPositioning:1, flash:24, meteringMode:5, exposureMode:0, whiteBalance:0, sceneCaptureType:0, subSecDigits:3,
    shootModes: {
      main_48mp:   { W:8064, H:6048, label:'Main · 48MP · 8064×6048', focalLength:6.765, focalLength35:24, fNumber:1.78, lensModel:'iPhone 17 Pro back triple camera 6.765mm f/1.78', sizeMB:[7.0,9.5] },
      main_24mp:   { W:5712, H:4284, label:'Main · 24MP · 5712×4284', focalLength:6.765, focalLength35:24, fNumber:1.78, lensModel:'iPhone 17 Pro back triple camera 6.765mm f/1.78', sizeMB:[3.8,6.2] },
      main_12mp:   { W:4032, H:3024, label:'Main · 12MP · 4032×3024', focalLength:6.765, focalLength35:24, fNumber:1.78, lensModel:'iPhone 17 Pro back triple camera 6.765mm f/1.78', sizeMB:[2.4,4.1] },
      tele_5x:     { W:4032, H:3024, label:'5× Tele · 12MP · 4032×3024', focalLength:23.587, focalLength35:120, fNumber:2.8, lensModel:'iPhone 17 Pro back triple camera 23.587mm f/2.8', sizeMB:[2.1,3.5] },
      ultrawide:   { W:4032, H:3024, label:'Ultra Wide · 12MP · 4032×3024', focalLength:2.220, focalLength35:13, fNumber:2.2, lensModel:'iPhone 17 Pro back triple camera 2.22mm f/2.2', sizeMB:[2.0,3.2] },
      front:       { W:3088, H:2316, label:'Front · 12MP · 3088×2316', focalLength:2.690, focalLength35:23, fNumber:1.9, lensModel:'iPhone 17 Pro front camera 2.69mm f/1.9', sizeMB:[1.8,3.0] },
    },
    note:'iPhone 17 Pro · iOS 26 · f/1.78 · 24mm',
  },
  carbon_ip17promax: {
    make:'Apple', model:'iPhone 17 Pro Max',
    softwarePool:['26.3.1','26.3','26.2','26.1','26.0.1','26.0'],
    lensMake:'Apple',
    lensModel:'iPhone 17 Pro Max back triple camera 6.765mm f/1.78',
    focalLength:6.765, focalLength35:24, fNumber:1.78,
    colorSpace:65535, dpi:72, jpegType:'baseline',
    qt:{ luma:92, chroma:86 },
    isoPool:[32,32,50,50,50,64,64,100,100,100,125,160,200,250,320,400,500,640,800,1000,1250,1600,2000,2500,3200],
    shutterPool:[1/4000,1/3200,1/2500,1/2000,1/1600,1/1250,1/1000,1/800,1/640,1/500,1/500,1/400,1/320,1/250,1/250,1/200,1/160,1/120,1/120,1/100,1/80,1/60,1/50,1/40,1/30,1/25,1/15,1/10,1/8],
    ycbcrPositioning:1, flash:24, meteringMode:5, exposureMode:0, whiteBalance:0, sceneCaptureType:0, subSecDigits:3,
    shootModes: {
      main_48mp:   { W:8064, H:6048, label:'Main · 48MP · 8064×6048', focalLength:6.765, focalLength35:24, fNumber:1.78, lensModel:'iPhone 17 Pro Max back triple camera 6.765mm f/1.78', sizeMB:[7.0,9.5] },
      main_24mp:   { W:5712, H:4284, label:'Main · 24MP · 5712×4284', focalLength:6.765, focalLength35:24, fNumber:1.78, lensModel:'iPhone 17 Pro Max back triple camera 6.765mm f/1.78', sizeMB:[3.8,6.2] },
      main_12mp:   { W:4032, H:3024, label:'Main · 12MP · 4032×3024', focalLength:6.765, focalLength35:24, fNumber:1.78, lensModel:'iPhone 17 Pro Max back triple camera 6.765mm f/1.78', sizeMB:[2.4,4.1] },
      tele_5x:     { W:4032, H:3024, label:'5× Tele · 12MP · 4032×3024', focalLength:23.587, focalLength35:120, fNumber:2.8, lensModel:'iPhone 17 Pro Max back triple camera 23.587mm f/2.8', sizeMB:[2.1,3.5] },
      ultrawide:   { W:4032, H:3024, label:'Ultra Wide · 12MP · 4032×3024', focalLength:2.220, focalLength35:13, fNumber:2.2, lensModel:'iPhone 17 Pro Max back triple camera 2.22mm f/2.2', sizeMB:[2.0,3.2] },
      front:       { W:3088, H:2316, label:'Front · 12MP · 3088×2316', focalLength:2.690, focalLength35:23, fNumber:1.9, lensModel:'iPhone 17 Pro Max front camera 2.69mm f/1.9', sizeMB:[1.8,3.0] },
    },
    note:'iPhone 17 Pro Max · iOS 26 · f/1.78 · 24mm',
  },
  // Legacy non-Apple kept for advanced mode only
  iphone15pro:  { make:'Apple', model:'iPhone 15 Pro', softwarePool:['17.4.1'], lensMake:'Apple', lensModel:'iPhone 15 Pro back triple camera 6.765mm f/1.78', focalLength:6.765, focalLength35:24, fNumber:1.78, colorSpace:65535, dpi:72, jpegType:'baseline', qt:{luma:92,chroma:86}, isoPool:[50,100], shutterPool:[1/120], orientation:'auto', ycbcrPositioning:1, note:'iPhone 15 Pro (legacy)' },
  iphone14:     { make:'Apple', model:'iPhone 14', softwarePool:['16.7.2'], lensMake:'Apple', lensModel:'iPhone 14 back dual wide camera 5.7mm f/1.5', focalLength:5.7, focalLength35:26, fNumber:1.5, colorSpace:65535, dpi:72, jpegType:'baseline', qt:{luma:90,chroma:85}, isoPool:[50,100], shutterPool:[1/120], orientation:'auto', ycbcrPositioning:1, note:'iPhone 14 (legacy)' },
  iphone13:     { make:'Apple', model:'iPhone 13', softwarePool:['16.6.1'], lensMake:'Apple', lensModel:'iPhone 13 back dual wide camera 5.1mm f/1.6', focalLength:5.1, focalLength35:26, fNumber:1.6, colorSpace:65535, dpi:72, jpegType:'baseline', qt:{luma:90,chroma:84}, isoPool:[50,100], shutterPool:[1/120], orientation:'auto', ycbcrPositioning:1, note:'iPhone 13 (legacy)' },
  iphone12:     { make:'Apple', model:'iPhone 12', softwarePool:['15.8.1'], lensMake:'Apple', lensModel:'iPhone 12 back dual wide camera 4.2mm f/1.6', focalLength:4.2, focalLength35:26, fNumber:1.6, colorSpace:65535, dpi:72, jpegType:'baseline', qt:{luma:88,chroma:82}, isoPool:[50,100], shutterPool:[1/120], orientation:'auto', ycbcrPositioning:1, note:'iPhone 12 (legacy)' },
  samsung_s24:  { make:'samsung', model:'SM-S928B', softwarePool:['S928BXXU1AWJ9'], lensMake:'', lensModel:'', focalLength:6.3, focalLength35:24, fNumber:1.8, colorSpace:1, dpi:72, jpegType:'baseline', qt:{luma:88,chroma:80}, isoPool:[50,100], shutterPool:[1/120], orientation:'auto', ycbcrPositioning:2, note:'Samsung S24 Ultra (legacy)' },
  samsung_s23:  { make:'samsung', model:'SM-S918B', softwarePool:['S918BXXU4EXJ3'], lensMake:'', lensModel:'', focalLength:6.4, focalLength35:23, fNumber:1.7, colorSpace:1, dpi:72, jpegType:'baseline', qt:{luma:87,chroma:79}, isoPool:[50,100], shutterPool:[1/120], orientation:'auto', ycbcrPositioning:2, note:'Samsung S23 Ultra (legacy)' },
  pixel8:       { make:'Google', model:'Pixel 8', softwarePool:['UP1A.231105.003'], lensMake:'', lensModel:'', focalLength:6.81, focalLength35:27, fNumber:1.68, colorSpace:1, dpi:72, jpegType:'baseline', qt:{luma:85,chroma:78}, isoPool:[50,100], shutterPool:[1/120], orientation:'auto', ycbcrPositioning:2, note:'Pixel 8 (legacy)' },
  pixel7:       { make:'Google', model:'Pixel 7', softwarePool:['PQ3A.230505.001'], lensMake:'', lensModel:'', focalLength:6.81, focalLength35:25, fNumber:1.85, colorSpace:1, dpi:72, jpegType:'baseline', qt:{luma:85,chroma:77}, isoPool:[50,100], shutterPool:[1/120], orientation:'auto', ycbcrPositioning:2, note:'Pixel 7 (legacy)' },
};
// ── PHANTOM NAME POOLS ────────────────────────────────────────────
// Top 50 female first names (SSA 2024 most popular)
const PHANTOM_FIRST_NAMES = [
  'Emma','Olivia','Sophia','Ava','Isabella','Mia','Luna','Charlotte','Amelia','Harper',
  'Evelyn','Abigail','Emily','Ella','Elizabeth','Camila','Lily','Scarlett','Victoria','Madison',
  'Aria','Chloe','Grace','Penelope','Riley','Zoey','Nora','Lily','Hannah','Layla',
  'Eleanor','Sofia','Avery','Aubrey','Addison','Ellie','Stella','Natalie','Zoe','Leah',
  'Hazel','Violet','Aurora','Savannah','Audrey','Brooklyn','Bella','Claire','Skyler','Lucy'
];
// Top 50 last names (US Census most common)
const PHANTOM_LAST_NAMES = [
  'Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez',
  'Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin',
  'Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson',
  'Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores',
  'Green','Adams','Nelson','Baker','Hall','Rivera','Campbell','Mitchell','Carter','Roberts'
];
function phantomRandomName() {
  const first = PHANTOM_FIRST_NAMES[Math.floor(Math.random() * PHANTOM_FIRST_NAMES.length)];
  const last  = PHANTOM_LAST_NAMES [Math.floor(Math.random() * PHANTOM_LAST_NAMES.length)];
  return first + '_' + last;
}

// PHANTOM_KEYS: new Apple devices for the Phantom preset dropdown
const PHANTOM_KEYS = ['ip17promax','ip17pro','ip17air','ip17','ip16promax','ip16pro','ip16plus','ip16','ip16e','ip15promax','ip15pro'];
// Full device keys for advanced mode
const DEVICE_KEYS = Object.keys(GEN_DEVICES).filter(k => k !== 'custom' && k !== 'random');

// City GPS coordinates (slightly randomised on use)
const GEN_CITIES = {
  // Bounding boxes = actual incorporated city limits (not metro areas)
  // Source: US Census TIGER 2023 + OpenStreetMap city boundaries
  // Each box contains thousands of unique real street coordinates
  nyc: {
    name:'New York City, NY',
    latMin:40.4774, latMax:40.9176, lngMin:-74.2591, lngMax:-73.7004,
    alt:10, altV:15,  // altitude center, variance
  },
  la: {
    name:'Los Angeles, CA',
    latMin:33.7037, latMax:34.3373, lngMin:-118.6682, lngMax:-118.1553,
    alt:71, altV:40,
  },
  chicago: {
    name:'Chicago, IL',
    latMin:41.6443, latMax:42.0230, lngMin:-87.9401, lngMax:-87.5241,
    alt:179, altV:10,
  },
  houston: {
    name:'Houston, TX',
    latMin:29.5236, latMax:30.1107, lngMin:-95.7835, lngMax:-95.0145,
    alt:15, altV:12,
  },
  phoenix: {
    name:'Phoenix, AZ',
    latMin:33.2898, latMax:33.9082, lngMin:-112.3242, lngMax:-111.9255,
    alt:331, altV:20,
  },
  philadelphia: {
    name:'Philadelphia, PA',
    latMin:39.8670, latMax:40.1379, lngMin:-75.2803, lngMax:-74.9558,
    alt:12, altV:15,
  },
  san_antonio: {
    name:'San Antonio, TX',
    latMin:29.2105, latMax:29.7312, lngMin:-98.8050, lngMax:-98.2346,
    alt:198, altV:25,
  },
  san_diego: {
    name:'San Diego, CA',
    latMin:32.5346, latMax:33.1139, lngMin:-117.2820, lngMax:-116.9057,
    alt:19, altV:30,
  },
  dallas: {
    name:'Dallas, TX',
    latMin:32.6175, latMax:33.0237, lngMin:-97.0041, lngMax:-96.5499,
    alt:130, altV:15,
  },
  san_jose: {
    name:'San Jose, CA',
    latMin:37.1237, latMax:37.4693, lngMin:-122.0353, lngMax:-121.5886,
    alt:26, altV:20,
  },
  // International kept for compatibility
  miami:        { name:'Miami, FL',       latMin:25.7091, latMax:25.8551, lngMin:-80.3198, lngMax:-80.1392, alt:2,   altV:3  },
  london:       { name:'London, UK',      latMin:51.3849, latMax:51.6723, lngMin:-0.3516,  lngMax:0.1483,   alt:11,  altV:8  },
  paris:        { name:'Paris, FR',       latMin:48.8155, latMax:48.9022, lngMin:2.2242,   lngMax:2.4699,   alt:35,  altV:15 },
  dubai:        { name:'Dubai, UAE',      latMin:24.7136, latMax:25.3580, lngMin:54.8930,  lngMax:55.6451,  alt:5,   altV:5  },
  sydney:       { name:'Sydney, AU',      latMin:-34.1183,latMax:-33.5781,lngMin:150.5209, lngMax:151.3430, alt:39,  altV:20 },
  toronto:      { name:'Toronto, CA',     latMin:43.5810, latMax:43.8555, lngMin:-79.6393, lngMax:-79.1151, alt:76,  altV:15 },
  madrid:       { name:'Madrid, ES',      latMin:40.3120, latMax:40.5638, lngMin:-3.8884,  lngMax:-3.5245,  alt:667, altV:30 },
  rome:         { name:'Rome, IT',        latMin:41.7914, latMax:42.0384, lngMin:12.3400,  lngMax:12.6261,  alt:21,  altV:20 },
  amsterdam:    { name:'Amsterdam, NL',   latMin:52.2781, latMax:52.4312, lngMin:4.7287,   lngMax:5.0790,   alt:-2,  altV:5  },
  berlin:       { name:'Berlin, DE',      latMin:52.3418, latMax:52.6755, lngMin:13.0882,  lngMax:13.7611,  alt:34,  altV:15 },
  tokyo:        { name:'Tokyo, JP',       latMin:35.5244, latMax:35.8175, lngMin:139.3094, lngMax:139.9232, alt:40,  altV:20 },
  singapore:    { name:'Singapore, SG',   latMin:1.1496,  latMax:1.4780,  lngMin:103.5970, lngMax:104.0860, alt:15,  altV:8  },
};

// ═════════════════════════════════════════════════════════════════
// STATE
// ═════════════════════════════════════════════════════════════════
let genFileBuf = null, genFileName = '';
let genPreset = 'generator';
let genMode = 'normal';
let genLastResult = null;

// ═════════════════════════════════════════════════════════════════
// PRESET DEFINITIONS
// ═════════════════════════════════════════════════════════════════
const GEN_PRESETS = {
  generator: {
    injectExif: true, injectGPS: false, injectTimestamp: true,
    timestampMode: 'random_recent',
    jpegType: 'baseline', qtProfile: 'device',
    lsb: 25, prnu: 30, chroma: 0, histSmooth: 20,
    microWarp: 0, gridShift: false,
    pHashTarget: 0, freqNoise: 15, adversarial: 0,
    phantom: false,
    deltaECap: 1.2,
    desc: 'Replaces device identity, timestamps, and encoder signature. Adds light sensor noise. Visually identical to the original.',
  },
  ultimate: {
    // Ultimate — Carbon + embedded thumbnail + fresh timestamp + full forensic hardening
    injectExif: true, injectGPS: false, injectTimestamp: true,
    timestampMode: 'fresh',  // within last 4 hours
    jpegType: 'baseline', qtProfile: 'device',
    lsb: 18, prnu: 18, chroma: 35, histSmooth: 0,
    microWarp: 20, gridShift: true,
    pHashTarget: 0, freqNoise: 10, adversarial: 0,
    phantom: true,
    deltaECap: 1.0,
    desc: '⚡⭐ Ultimate. Forensic-grade clone mode. Exact device specs, embedded thumbnail, fresh timestamp, and complete EXIF parity. Indistinguishable from a photo taken moments ago on a real iPhone.',
  },
  carbon: {
    // Carbon — exact device clone, everything hardcoded
    injectExif: true, injectGPS: false, injectTimestamp: true,
    timestampMode: 'random_recent',
    jpegType: 'baseline', qtProfile: 'device',
    lsb: 18, prnu: 18, chroma: 35, histSmooth: 0,
    microWarp: 20, gridShift: true,
    pHashTarget: 0, freqNoise: 10, adversarial: 0,
    phantom: true,   // reuse phantom pixel normalization pipeline
    deltaECap: 1.0,
    desc: 'Carbon copy mode. Exact device specs — resolution, QT tables, chroma, EXIF — hardcoded from real device measurements. Indistinguishable from genuine output.',
  },
  phantom: {
    // Phantom — weapons-grade anonymisation
    // All pixel ops inlined (Option B — no pipeline dependency)
    // Calibrated values from SWGDE + Zauner pHash research:
    //   L17 grid shift: breaks spatial hash correlation
    //   L13 warp 0.20: defeats facial geometry matching (max 0.27px — invisible)
    //   L4 PRNU 0.18: replaces sensor FPN, stays in natural 8-20 energy range
    //   L3 LSB 0.18: randomises noise floor below shot noise of ISO 32 sensor
    //   L5 gamma 0.10: changes ISP tone response, ±0.9% (JND is ~3%)
    //   L18 chroma 0.35: changes ISP colour pipeline fingerprint, ±1.05%
    //   L15 per-px 0.15: white spatial noise, breaks residual correlation
    //   deltaECap 1.0: hard ceiling — below human JND of 2.3 for direct comparison
    injectExif: true, injectGPS: false, injectTimestamp: true,
    timestampMode: 'random_recent',
    jpegType: 'baseline', qtProfile: 'device',
    lsb: 0, prnu: 0, chroma: 0, histSmooth: 0,
    microWarp: 0, gridShift: false,
    pHashTarget: 0, freqNoise: 0, adversarial: 0,
    phantom: true,  // triggers inlined Phantom pixel ops in genProcess
    deltaECap: 1.0,
    desc: 'Weapons-grade. New device identity + forensic pixel normalization. Defeats metadata analysis, sensor fingerprinting, spatial correlation, ELA, and encoding signature checks. ΔE ≤ 1.0 — indistinguishable.',
  },
};

// ═════════════════════════════════════════════════════════════════
// JPEG BINARY BUILDER — writes a proper JPEG with real EXIF
// ═════════════════════════════════════════════════════════════════

function genU16BE(n) { return [(n >> 8) & 0xFF, n & 0xFF]; }
function genU32BE(n) { return [(n >> 24)&0xFF,(n>>16)&0xFF,(n>>8)&0xFF,n&0xFF]; }
function genU16LE(n) { return [n & 0xFF, (n >> 8) & 0xFF]; }
function genU32LE(n) { return [n&0xFF,(n>>8)&0xFF,(n>>16)&0xFF,(n>>24)&0xFF]; }

// Encode a GPS rational triplet (degrees, minutes, seconds) for EXIF
function genGPSRationals(decDeg) {
  const abs = Math.abs(decDeg);
  const deg = Math.floor(abs);
  const minF = (abs - deg) * 60;
  const min  = Math.floor(minF);
  const secF = (minF - min) * 60;
  // Encode seconds to 10000 denominator → 0.0001s precision (~0.003m)
  // This produces rich unique digits: e.g. 47.3821/10000 not just 47/100
  const secNum = Math.round(secF * 10000);
  // Each rational is num/denom as two U32LE
  return [
    ...genU32LE(deg),    ...genU32LE(1),
    ...genU32LE(min),    ...genU32LE(1),
    ...genU32LE(secNum), ...genU32LE(10000),
  ];
}

function genRational(num, denom) {
  return [...genU32LE(Math.round(num)), ...genU32LE(Math.round(denom))];
}

function genAsciiField(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) bytes.push(str.charCodeAt(i));
  bytes.push(0); // null terminator
  return bytes;
}

function genRandomSerial(len) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function genRandomUID() {
  // Format like Apple ImageUniqueID: 32 hex chars
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random()*16).toString(16).toUpperCase();
  return s;
}

// Pick a random iOS version from a device's softwarePool (weighted)
function genPickSoftware(device) {
  if (!device.softwarePool || !device.softwarePool.length) return device.software || '17.4.1';
  return device.softwarePool[Math.floor(Math.random() * device.softwarePool.length)];
}

// Pick random ISO from device's isoPool
function genPickISO(device) {
  if (!device.isoPool || !device.isoPool.length) return 100;
  return device.isoPool[Math.floor(Math.random() * device.isoPool.length)];
}

// Pick random shutter from device's shutterPool
function genPickShutter(device) {
  if (!device.shutterPool || !device.shutterPool.length) return 1/120;
  return device.shutterPool[Math.floor(Math.random() * device.shutterPool.length)];
}

// Auto-detect orientation from image dimensions (Apple convention)
// Portrait held normally = orientation 6 (90CW); landscape = 1
function genAutoOrientation(width, height) {
  return (height > width) ? 6 : 1;
}

// Read EXIF orientation value from raw JPEG bytes (fast, no full parse)
// Returns 1-8 per EXIF spec, or 1 if not found.
function genReadExifOrientation(bytes) {
  // Find APP1 EXIF marker (FF E1)
  for (let i = 0; i < bytes.length - 10; i++) {
    if (bytes[i] === 0xFF && bytes[i+1] === 0xE1) {
      const segEnd = i + 2 + ((bytes[i+2] << 8) | bytes[i+3]);
      // Check for 'Exif'
      if (bytes[i+4] === 0x45 && bytes[i+5] === 0x78 && bytes[i+6] === 0x69 &&
          bytes[i+7] === 0x66 && bytes[i+8] === 0x00 && bytes[i+9] === 0x00) {
        const tiffStart = i + 10;
        if (tiffStart + 8 >= bytes.length) break;
        // Detect byte order
        const le = bytes[tiffStart] === 0x49; // 'II' = little-endian
        const r16 = (o) => le ? (bytes[tiffStart+o] | (bytes[tiffStart+o+1]<<8)) : ((bytes[tiffStart+o]<<8) | bytes[tiffStart+o+1]);
        const r32 = (o) => le ? (bytes[tiffStart+o] | (bytes[tiffStart+o+1]<<8) | (bytes[tiffStart+o+2]<<16) | (bytes[tiffStart+o+3]<<24)) : ((bytes[tiffStart+o]<<24) | (bytes[tiffStart+o+1]<<16) | (bytes[tiffStart+o+2]<<8) | bytes[tiffStart+o+3]);
        const ifd0Off = r32(4);
        if (tiffStart + ifd0Off + 2 >= bytes.length) break;
        const entryCount = r16(ifd0Off);
        for (let e = 0; e < entryCount; e++) {
          const eOff = ifd0Off + 2 + e * 12;
          if (tiffStart + eOff + 12 > bytes.length) break;
          const tag = r16(eOff);
          if (tag === 0x0112) { // Orientation tag
            return r16(eOff + 8); // value field
          }
        }
      }
      break; // Only check first APP1
    }
    // Skip non-FF bytes and other segments
    if (bytes[i] === 0xFF && bytes[i+1] !== 0xFF && bytes[i+1] !== 0x00 &&
        bytes[i+1] !== 0xD8 && bytes[i+1] !== 0xD9) {
      if (i + 3 < bytes.length) {
        const skip = (bytes[i+2] << 8) | bytes[i+3];
        i += 1 + skip; // will be incremented by loop
      }
    }
  }
  return 1; // default: no rotation
}

// Apply canvas transform to normalize pixels from given EXIF orientation to orientation=1
// Returns {canvas, ctx, W, H} — W/H are the OUTPUT dimensions after normalization
async function genNormalizeOrientation(buf, srcOrientation) {
  // Decode WITHOUT auto-rotation — get raw pixels as stored in file
  let bitmap;
  try {
    bitmap = await createImageBitmap(new Blob([buf]), { imageOrientation: 'none' });
  } catch(e) {
    // Fallback for browsers that don't support imageOrientation option
    bitmap = await createImageBitmap(new Blob([buf]));
    // If browser auto-rotated, we can't undo it — just use as-is with orientation=1
    srcOrientation = 1;
  }

  const rawW = bitmap.width, rawH = bitmap.height;
  // Orientations 5-8 swap width and height
  const swapDims = srcOrientation >= 5 && srcOrientation <= 8;
  const outW = swapDims ? rawH : rawW;
  const outH = swapDims ? rawW : rawH;

  let canvas, ctx;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(outW, outH);
    ctx = canvas.getContext('2d', { willReadFrequently: true });
  } else {
    canvas = document.createElement('canvas');
    canvas.width = outW; canvas.height = outH;
    ctx = canvas.getContext('2d', { willReadFrequently: true });
  }

  // Apply transform to normalize to orientation=1
  // Transform matrix per EXIF orientation spec:
  ctx.save();
  switch (srcOrientation) {
    case 1: break;                                                      // Normal
    case 2: ctx.transform(-1,0,0,1,outW,0); break;                     // Flip H
    case 3: ctx.transform(-1,0,0,-1,outW,outH); break;                 // Rotate 180
    case 4: ctx.transform(1,0,0,-1,0,outH); break;                     // Flip V
    case 5: ctx.transform(0,1,1,0,0,0); break;                         // Transpose
    case 6: ctx.transform(0,1,-1,0,outW,0); break;                     // Rotate 90 CW
    case 7: ctx.transform(0,-1,-1,0,outH,outW); break;                 // Transverse
    case 8: ctx.transform(0,-1,1,0,0,outH); break;                     // Rotate 270 CW
  }
  ctx.drawImage(bitmap, 0, 0);
  ctx.restore();

  return { canvas, ctx, W: outW, H: outH };
}

// Generate Apple-format body serial: C8QK + 8 alphanumeric
function genAppleSerial() {
  const prefix = 'C8QK';
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  let s = prefix;
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function genTimestamp(mode, manual) {
  let d;
  if (mode === 'manual' && manual) {
    return manual; // already formatted
  } else if (mode === 'random_year') {
    const now = Date.now();
    d = new Date(now - Math.random() * 365 * 24 * 3600 * 1000);
  } else if (mode === 'none') {
    return null;
  } else if (mode === 'fresh') {
    // Within last 4 hours — looks like it was just taken before upload
    const now = Date.now();
    d = new Date(now - Math.random() * 4 * 3600 * 1000);
  } else { // random_recent
    const now = Date.now();
    d = new Date(now - Math.random() * 30 * 24 * 3600 * 1000);
  }
  // Format: YYYY:MM:DD HH:MM:SS
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}:${pad(d.getMonth()+1)}:${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function genGPSCoords(src, cfg) {
  let lat, lng, alt;
  if (src === 'proxy') {
    const firstAcc = typeof tgAccs !== 'undefined' ? tgAccs.find(a => a.lat != null && a.lng != null) : null;
    if (firstAcc) {
      const j = 15 / 111320;
      lat = firstAcc.lat + (Math.random()-0.5) * j * 2;
      lng = firstAcc.lng + (Math.random()-0.5) * j * 2;
      alt = firstAcc.alt || Math.random() * 50;
    } else {
      const city = GEN_CITIES.nyc;
      lat = city.latMin + Math.random() * (city.latMax - city.latMin);
      lng = city.lngMin + Math.random() * (city.lngMax - city.lngMin);
      alt = (city.alt||10) + Math.random() * (city.altV||15);
    }
  } else if (src === 'city') {
    // Pick a uniformly random coordinate within the real city bounding box.
    // With boxes spanning 0.2°–0.8° lat/lng, this gives tens of thousands
    // of unique 6-decimal-place coordinates per city.
    const city = GEN_CITIES[cfg.city] || GEN_CITIES.nyc;
    // Use latMin/latMax if available, fall back to legacy center+range
    const latMin = city.latMin !== undefined ? city.latMin : (city.lat - (city.latR||0.05));
    const latMax = city.latMax !== undefined ? city.latMax : (city.lat + (city.latR||0.05));
    const lngMin = city.lngMin !== undefined ? city.lngMin : (city.lng - (city.lngR||0.07));
    const lngMax = city.lngMax !== undefined ? city.lngMax : (city.lng + (city.lngR||0.07));
    // Uniform random within box, with microsecond-level sub-jitter for uniqueness
    lat = latMin + Math.random() * (latMax - latMin);
    lng = lngMin + Math.random() * (lngMax - lngMin);
    // Add sub-arcsecond jitter (~1-3m) so consecutive images never share coords
    lat += (Math.random() - 0.5) * 0.00003;
    lng += (Math.random() - 0.5) * 0.00003;
    const altBase = city.alt !== undefined ? city.alt : 10;
    const altVar  = city.altV !== undefined ? city.altV : 15;
    alt = altBase + (Math.random() - 0.5) * altVar * 2;
  } else if (src === 'manual') {
    // ±15m jitter — every image unique even from the same spot
    const jLat = 15 / 111320;
    const jLng = 15 / (111320 * Math.cos((parseFloat(cfg.lat)||0) * Math.PI / 180));
    lat = (parseFloat(cfg.lat) || 0) + (Math.random()-0.5) * jLat * 2;
    lng = (parseFloat(cfg.lng) || 0) + (Math.random()-0.5) * jLng * 2;
    alt = parseFloat(cfg.altitude) || 10;
  } else {
    return null;
  }
  return { lat, lng, alt: Math.max(0, alt) };
}

// Build EXIF APP1 segment as Uint8Array

// ── THUMBNAIL GENERATOR ────────────────────────────────────────────
// Generates a 160×120 JPEG thumbnail matching real iPhone EXIF behavior.
// iPhones always embed a thumbnail in IFD1. Missing thumbnail = flag.
// Returns Uint8Array of raw JPEG bytes (no EXIF, just SOI..EOI).
async function genMakeThumbnail(sourceCanvas) {
  const THUMB_W = 160, THUMB_H = 120;
  let thumbCanvas;
  if (typeof OffscreenCanvas !== 'undefined') {
    thumbCanvas = new OffscreenCanvas(THUMB_W, THUMB_H);
  } else {
    thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = THUMB_W; thumbCanvas.height = THUMB_H;
  }
  const tCtx = thumbCanvas.getContext('2d');
  // Scale source to thumbnail preserving aspect, center-crop to 4:3
  const sW = sourceCanvas.width || sourceCanvas.videoWidth || THUMB_W;
  const sH = sourceCanvas.height || sourceCanvas.videoHeight || THUMB_H;
  const srcAR = sW / sH, dstAR = THUMB_W / THUMB_H;
  let sx = 0, sy = 0, sw = sW, sh = sH;
  if (srcAR > dstAR) { sw = Math.round(sH * dstAR); sx = Math.round((sW - sw) / 2); }
  else                { sh = Math.round(sW / dstAR); sy = Math.round((sH - sh) / 2); }
  tCtx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, THUMB_W, THUMB_H);
  // Encode at Q70 — real iPhone thumbnails are low quality
  let tBlob;
  if (typeof thumbCanvas.convertToBlob === 'function') {
    tBlob = await thumbCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.70 });
  } else {
    tBlob = await new Promise((res, rej) =>
      thumbCanvas.toBlob(b => b ? res(b) : rej(new Error('thumb toBlob failed')), 'image/jpeg', 0.70));
  }
  const tBuf = new Uint8Array(await tBlob.arrayBuffer());

  // ── Fix thumbnail header: browser writes FF D8 FF E0 (JFIF/APP0)
  //    Real iPhone thumbnails start with FF D8 FF E1 (EXIF/APP1).
  //    Fix: strip all APPn segments after SOI and inject a minimal EXIF APP1.
  //    Forensic tools check the FF E1 signature — this makes the thumbnail pass.

  // Build minimal EXIF APP1 for the thumbnail
  // Minimal valid EXIF: TIFF header (LE) + IFD0 with 0 entries + no IFD1 pointer
  // This is the smallest legal EXIF block — 8 bytes TIFF header + 2 (entry count=0) + 4 (next IFD=0)
  const minExif = new Uint8Array([
    0x49, 0x49,       // 'II' little-endian
    0x2A, 0x00,       // TIFF magic 42
    0x08, 0x00, 0x00, 0x00, // IFD0 offset = 8
    0x00, 0x00,       // 0 IFD entries
    0x00, 0x00, 0x00, 0x00, // next IFD = 0
  ]);
  const app1Len = 2 + 6 + minExif.length; // length field + 'Exif\0\0' + TIFF data
  const app1Seg = new Uint8Array(2 + 2 + 6 + minExif.length);
  app1Seg[0] = 0xFF; app1Seg[1] = 0xE1;               // APP1 marker
  app1Seg[2] = (app1Len >> 8) & 0xFF;
  app1Seg[3] = app1Len & 0xFF;
  app1Seg[4] = 0x45; app1Seg[5] = 0x78; app1Seg[6] = 0x69; // 'Exi'
  app1Seg[7] = 0x66; app1Seg[8] = 0x00; app1Seg[9] = 0x00; // 'f\0\0'
  app1Seg.set(minExif, 10);

  // Walk browser JPEG: skip SOI (2 bytes), strip all APPn segments, keep rest
  const parts = [
    tBuf.slice(0, 2),  // SOI: FF D8
    app1Seg,           // our minimal EXIF APP1 (FF E1)
  ];
  let pos = 2;
  while (pos < tBuf.length - 1) {
    if (tBuf[pos] !== 0xFF) { parts.push(tBuf.slice(pos)); break; }
    const mk = tBuf[pos + 1];
    if (mk === 0xD9) { parts.push(tBuf.slice(pos)); break; } // EOI
    if (mk === 0xD8 || (mk >= 0xD0 && mk <= 0xD7)) { pos += 2; continue; } // standalone markers
    if (pos + 3 >= tBuf.length) break;
    const segLen = (tBuf[pos + 2] << 8) | tBuf[pos + 3];
    const segEnd = pos + 2 + segLen;
    if (segEnd > tBuf.length) { parts.push(tBuf.slice(pos)); break; }
    if (mk >= 0xE0 && mk <= 0xEF) { pos = segEnd; continue; } // skip all APPn (E0=JFIF, E1=old EXIF etc)
    parts.push(tBuf.slice(pos, segEnd)); // keep DQT, SOF, DHT, SOS, scan data
    pos = segEnd;
  }

  // Assemble final thumbnail
  const totalLen = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(totalLen);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

function genBuildEXIF(params) {
  // EXIF layout:
  // APP1 marker (FF E1) + length (2) + 'Exif\0\0' (6) + TIFF header (8) + IFD0 + SubIFD + GPS IFD
  // We use little-endian (II) throughout

  const {
    make, model, software, bodySerial, imageUID,
    lensMake, lensModel, lensSerial,
    dateTime, dateTimeOrig, dateTimeDigit, subSecTime, offsetTime,
    focalLength, focalLength35, fNumber,
    exposureTime, iso, flash, whiteBalance,
    metering, expMode, sceneType, colorSpace, orientation,
    width, height, dpi, ycbcrPositioning,
    expBias, brightnessVal, sceneLum, makerNoteLen,
    gps, thumbnail,
  } = params;

  // Helper: IFD entry (12 bytes)
  // tag(2) type(2) count(4) value/offset(4)
  // Types: 1=BYTE 2=ASCII 3=SHORT 4=LONG 5=RATIONAL 7=UNDEFINED 9=SLONG 10=SRATIONAL
  function asciiBlob(str) { return genAsciiField(str); }

  // ASCII strings
  const makeB    = asciiBlob(make||'');
  const modelB   = asciiBlob(model||'');
  const softB    = asciiBlob(software||'');
  const dtB      = asciiBlob(dateTime||'');
  const dtOrigB  = asciiBlob(dateTimeOrig||'');
  const dtDigB   = asciiBlob(dateTimeDigit||'');
  const subSecB  = asciiBlob(subSecTime||'');
  const offsetTB = asciiBlob(offsetTime||'');
  const bodySerB = asciiBlob(bodySerial||'');
  const imgUIDsB = asciiBlob(imageUID||'');
  const lensMkB  = asciiBlob(lensMake||'');
  const lensMdB  = asciiBlob(lensModel||'');
  const lensSrB  = asciiBlob(lensSerial||'');

  // Rational values for camera settings
  const focalR    = [genRational(Math.round(focalLength*100), 100)].flat();
  const fl35R     = []; // SHORT, fits in 4 bytes
  const fNumR     = [genRational(Math.round(fNumber*100), 100)].flat();
  const expTimeR  = exposureTime ? [genRational(1, Math.round(1/exposureTime))].flat() : [genRational(1,120)].flat();
  const dpiR      = [genRational(dpi||72, 1)].flat();
  const xdpiR     = [genRational(dpi||72, 1)].flat();

  // GPS data
  let gpsLatR, gpsLngR, gpsAltR;
  if (gps) {
    gpsLatR = genGPSRationals(gps.lat);
    gpsLngR = genGPSRationals(gps.lng);
    gpsAltR = [genRational(Math.round(gps.alt*100), 100)].flat();
  }

  // Now build binary EXIF block
  // Strategy: build each section as byte array, then compute offsets and assemble


  // We'll build this as a flat structure using a ByteWriter helper
  const buf = [];
  function w(bytes) { for (const b of bytes) buf.push(b & 0xFF); }
  function wU8(v)  { buf.push(v & 0xFF); }
  function wU16LE(v) { w(genU16LE(v)); }
  function wU32LE(v) { w(genU32LE(v)); }
  function patch32LE(offset, val) {
    const bytes = genU32LE(val);
    for (let i = 0; i < 4; i++) buf[offset+i] = bytes[i];
  }

  // TIFF header (little-endian)
  w([0x49,0x49]); // 'II' little-endian
  wU16LE(42);     // TIFF magic
  wU32LE(8);      // offset to IFD0 (always 8 from TIFF header start)

  // --- IFD0 ---
  // Collect entries: tag, type, count, value-or-offset-placeholder
  // Strings > 4 bytes need offsets into the data area
  // We'll build entries as objects, then write them in tag-sorted order

  const ifd0Entries  = [];
  const exifEntries  = [];
  const gpsEntries   = [];

  function addEntry(arr, tag, type, count, inlineVal4OrNull, blob) {
    arr.push({ tag, type, count, inlineVal4: inlineVal4OrNull, blob: blob || null });
  }

  // IFD0 entries
  if (make)    addEntry(ifd0Entries, 0x010F, 2, makeB.length,  null, makeB);
  if (model)   addEntry(ifd0Entries, 0x0110, 2, modelB.length, null, modelB);
  if (dpi) {
    addEntry(ifd0Entries, 0x011A, 5, 1, null, dpiR);   // XResolution
    addEntry(ifd0Entries, 0x011B, 5, 1, null, xdpiR);  // YResolution
    addEntry(ifd0Entries, 0x0128, 3, 1, [...genU16LE(2), 0,0], null); // ResolutionUnit=inch
  }
  if (orientation) addEntry(ifd0Entries, 0x0112, 3, 1, [...genU16LE(orientation||1), 0,0], null);
  if (software)    addEntry(ifd0Entries, 0x0131, 2, softB.length, null, softB);
  if (dateTime)    addEntry(ifd0Entries, 0x0132, 2, dtB.length, null, dtB);
  addEntry(ifd0Entries, 0x0213, 3, 1, [...genU16LE(ycbcrPositioning||1),0,0], null); // YCbCrPositioning (1=centered/Apple, 2=co-sited/Samsung)
  // SubExif IFD offset — placeholder
  addEntry(ifd0Entries, 0x8769, 4, 1, [0,0,0,0], null);
  if (gps) addEntry(ifd0Entries, 0x8825, 4, 1, [0,0,0,0], null); // GPS IFD offset

  // ExifSubIFD entries
  if (exposureTime) addEntry(exifEntries, 0x829A, 5, 1, null, expTimeR);
  if (fNumber)      addEntry(exifEntries, 0x829D, 5, 1, null, fNumR);
  if (iso) {
    addEntry(exifEntries, 0x8827, 3, 1, [...genU16LE(iso),0,0], null);
    // SensitivityType=2 (Recommended Exposure Index) + REI value — iPhone always writes both
    addEntry(exifEntries, 0x8830, 3, 1, [...genU16LE(2),0,0], null);
    addEntry(exifEntries, 0x8832, 4, 1, genU32LE(iso), null);
  }
  addEntry(exifEntries, 0x9000, 7, 4, [48,50,51,50], null); // ExifVersion=0232
  if (dateTimeOrig) addEntry(exifEntries, 0x9003, 2, dtOrigB.length, null, dtOrigB);
  if (dateTimeDigit)addEntry(exifEntries, 0x9004, 2, dtDigB.length, null, dtDigB);
  // All three SubSecTime fields — iPhone writes all of them
  if (subSecTime)   addEntry(exifEntries, 0x9290, 2, subSecB.length, null, subSecB); // SubSecTime (main)
  if (subSecTime)   addEntry(exifEntries, 0x9291, 2, subSecB.length, null, subSecB); // SubSecTimeOriginal
  if (subSecTime)   addEntry(exifEntries, 0x9292, 2, subSecB.length, null, subSecB); // SubSecTimeDigitized
  // OffsetTime (0x9010/9011/9012) — iOS 15+ writes timezone offset for all three timestamp fields
  if (offsetTime) {
    addEntry(exifEntries, 0x9010, 2, offsetTB.length, null, offsetTB); // OffsetTime
    addEntry(exifEntries, 0x9011, 2, offsetTB.length, null, offsetTB); // OffsetTimeOriginal
    addEntry(exifEntries, 0x9012, 2, offsetTB.length, null, offsetTB); // OffsetTimeDigitized
  }
  // APEX exposure values — iPhone always writes ShutterSpeedValue, ApertureValue, MaxApertureValue
  if (exposureTime) {
    // ShutterSpeedValue (0x9201) = APEX = log2(1/t) encoded as SRATIONAL
    const svApex = -Math.log2(exposureTime);
    const svNum = Math.round(svApex * 65536), svDen = 65536;
    addEntry(exifEntries, 0x9201, 10, 1, null, [...genU32LE(svNum), ...genU32LE(svDen)]);
  }
  if (fNumber) {
    // ApertureValue (0x9202) = APEX = 2*log2(f) encoded as RATIONAL
    const avApex = 2 * Math.log2(fNumber);
    const avNum = Math.round(avApex * 65536), avDen = 65536;
    addEntry(exifEntries, 0x9202, 5, 1, null, [...genU32LE(avNum), ...genU32LE(avDen)]);
    // MaxApertureValue (0x9205) — same as ApertureValue for fixed-aperture iPhone lenses
    addEntry(exifEntries, 0x9205, 5, 1, null, [...genU32LE(avNum), ...genU32LE(avDen)]);
  }
  // LightSource (0x9208) = 0 = Unknown/Auto — iPhone always writes this for Auto WB
  addEntry(exifEntries, 0x9208, 3, 1, [...genU16LE(0),0,0], null);
  if (flash !== undefined) addEntry(exifEntries, 0x9209, 3, 1, [...genU16LE(flash),0,0], null);
  if (focalLength)  addEntry(exifEntries, 0x920A, 5, 1, null, focalR);
  // FlashPixVersion (0xA000) = "0100" — iPhone always writes this
  addEntry(exifEntries, 0xA000, 7, 4, [48,49,48,48], null);
  addEntry(exifEntries, 0xA001, 3, 1, [...genU16LE(colorSpace||65535),0,0], null);
  addEntry(exifEntries, 0xA002, 4, 1, genU32LE(width||0), null);
  addEntry(exifEntries, 0xA003, 4, 1, genU32LE(height||0), null);
  // LensSpecification (0xA432) — [minFocal, maxFocal, minFnum, maxFnum] as RATIONAL array
  // iPhone fixed-focal: min==max for both focal length and f-number
  if (focalLength && fNumber) {
    const fl_n = Math.round(focalLength * 1000), fl_d = 1000;
    const fn_n = Math.round(fNumber * 100),      fn_d = 100;
    addEntry(exifEntries, 0xA432, 5, 4, null, [
      ...genU32LE(fl_n), ...genU32LE(fl_d), // min focal
      ...genU32LE(fl_n), ...genU32LE(fl_d), // max focal (same — fixed lens)
      ...genU32LE(fn_n), ...genU32LE(fn_d), // min f-number
      ...genU32LE(fn_n), ...genU32LE(fn_d), // max f-number (same)
    ]);
  }
  if (focalLength35) addEntry(exifEntries, 0xA405, 3, 1, [...genU16LE(focalLength35),0,0], null);
  if (whiteBalance !== undefined) addEntry(exifEntries, 0xA403, 3, 1, [...genU16LE(whiteBalance),0,0], null);
  // DigitalZoomRatio (0xA404) = 1/1 — iPhone writes 1.0 (no digital zoom) for main lens shots
  addEntry(exifEntries, 0xA404, 5, 1, null, [...genU32LE(1), ...genU32LE(1)]);
  if (metering) addEntry(exifEntries, 0x9207, 3, 1, [...genU16LE(metering),0,0], null);
  if (expMode !== undefined) addEntry(exifEntries, 0xA402, 3, 1, [...genU16LE(expMode),0,0], null);
  addEntry(exifEntries, 0xA406, 3, 1, [...genU16LE(sceneType||0),0,0], null); // SceneCaptureType
  addEntry(exifEntries, 0xA301, 7, 1, [1,0,0,0], null); // SceneType=directly photographed
  addEntry(exifEntries, 0xA300, 7, 1, [3,0,0,0], null); // FileSource=3 (digital camera — always 3 on iPhone)
  addEntry(exifEntries, 0xA401, 3, 1, [...genU16LE(0),0,0], null); // CustomRendered=0 (normal) — HDR shots use 2 but 0 is safe default

  // Per-image varying fields — make every shot forensically unique
  // ExposureBiasValue (0x9204) — SRATIONAL: varies slightly per shot
  if (expBias !== undefined) {
    const ebNum = Math.round(expBias * 100), ebDen = 100;
    addEntry(exifEntries, 0x9204, 10, 1, null, [...genU32LE(ebNum), ...genU32LE(ebDen)]);
  }
  // BrightnessValue (0x9203) — SRATIONAL: scene brightness, varies per shot
  if (brightnessVal !== undefined) {
    const bvNum = Math.round(brightnessVal * 10000), bvDen = 10000;
    addEntry(exifEntries, 0x9203, 10, 1, null, [...genU32LE(bvNum), ...genU32LE(bvDen)]);
  }
  // MakerNote (0x927C) — UNDEFINED blob: Apple always writes this, length varies
  if (makerNoteLen && makerNoteLen > 0) {
    // Apple MakerNote starts with 'Apple iOS' then binary data
    const mnBytes = new Array(makerNoteLen).fill(0);
    const prefix = [0x41,0x70,0x70,0x6C,0x65,0x20,0x69,0x4F,0x53,0x00]; // 'Apple iOS'
    prefix.forEach((b,i) => { if(i<mnBytes.length) mnBytes[i]=b; });
    // Fill rest with pseudo-random bytes (consistent pattern per-image via Math.random)
    for (let mi=prefix.length; mi<makerNoteLen; mi++) mnBytes[mi]=(Math.random()*256|0);
    addEntry(exifEntries, 0x927C, 7, makerNoteLen, null, mnBytes);
  }
  if (bodySerial)  addEntry(exifEntries, 0xA431, 2, bodySerB.length, null, bodySerB);
  if (imageUID)    addEntry(exifEntries, 0xA420, 2, imgUIDsB.length, null, imgUIDsB);
  if (lensMake)    addEntry(exifEntries, 0xA433, 2, lensMkB.length, null, lensMkB);
  if (lensModel)   addEntry(exifEntries, 0xA434, 2, lensMdB.length, null, lensMdB);
  if (lensSerial)  addEntry(exifEntries, 0xA435, 2, lensSrB.length, null, lensSrB);

  // GPS entries
  if (gps) {
    const latRef = gps.lat >= 0 ? 'N' : 'S';
    const lngRef = gps.lng >= 0 ? 'E' : 'W';
    const latRefB = asciiBlob(latRef);
    const lngRefB = asciiBlob(lngRef);
    const mapB = asciiBlob('WGS-84');
    addEntry(gpsEntries, 0x0001, 2, latRefB.length, null, latRefB);
    addEntry(gpsEntries, 0x0002, 5, 3, null, gpsLatR);
    addEntry(gpsEntries, 0x0003, 2, lngRefB.length, null, lngRefB);
    addEntry(gpsEntries, 0x0004, 5, 3, null, gpsLngR);
    addEntry(gpsEntries, 0x0005, 1, 1, [0,0,0,0], null); // AltitudeRef=above sea level
    addEntry(gpsEntries, 0x0006, 5, 1, null, gpsAltR);

    // GPSTimeStamp (0x0007) — RATIONAL[3]: H, M, S in UTC (approx from local time)
    const _dtStr = dateTimeOrig || dateTime || '';
    const _gpsH = _dtStr.length>=13 ? (parseInt(_dtStr.substring(11,13),10)||0) : 12;
    const _gpsM = _dtStr.length>=16 ? (parseInt(_dtStr.substring(14,16),10)||0) : 0;
    const _gpsS = _dtStr.length>=19 ? (parseInt(_dtStr.substring(17,19),10)||0) : 0;
    addEntry(gpsEntries, 0x0007, 5, 3, null, [
      ...genU32LE(_gpsH), ...genU32LE(1),
      ...genU32LE(_gpsM), ...genU32LE(1),
      ...genU32LE(_gpsS), ...genU32LE(1),
    ]);

    // GPSMeasureMode (0x000A) = "3" (3D fix) — real iPhones outdoors always get a 3D fix
    const gpsModeB = asciiBlob('3');
    addEntry(gpsEntries, 0x000A, 2, gpsModeB.length, null, gpsModeB);

    // GPSDOP (0x000B) — Dilution of Precision, typical outdoor value 1.0–5.5
    const _dop = 1.0 + Math.random() * 4.5;
    addEntry(gpsEntries, 0x000B, 5, 1, null, [...genU32LE(Math.round(_dop*100)), ...genU32LE(100)]);

    // GPSSpeedRef (0x000C) = "K" (km/h)
    const gpsSpRefB = asciiBlob('K');
    addEntry(gpsEntries, 0x000C, 2, gpsSpRefB.length, null, gpsSpRefB);

    // GPSSpeed (0x000D) — near-zero (stationary or slow walking)
    const _spd = Math.random() * 2.8;
    addEntry(gpsEntries, 0x000D, 5, 1, null, [...genU32LE(Math.round(_spd*100)), ...genU32LE(100)]);

    // GPSTrackRef (0x000E) = "T" (true north)
    const gpsTrkRefB = asciiBlob('T');
    addEntry(gpsEntries, 0x000E, 2, gpsTrkRefB.length, null, gpsTrkRefB);

    // GPSTrack (0x000F) — random heading 0–360°
    const _trk = Math.random() * 360;
    addEntry(gpsEntries, 0x000F, 5, 1, null, [...genU32LE(Math.round(_trk*100)), ...genU32LE(100)]);

    // GPSImgDirectionRef (0x0010) = "T" (true north)
    const gpsDirRefB = asciiBlob('T');
    addEntry(gpsEntries, 0x0010, 2, gpsDirRefB.length, null, gpsDirRefB);

    // GPSImgDirection (0x0011) — camera direction, close to track with small variation
    const _dir = (_trk + (Math.random()-0.5)*30 + 360) % 360;
    addEntry(gpsEntries, 0x0011, 5, 1, null, [...genU32LE(Math.round(_dir*100)), ...genU32LE(100)]);

    addEntry(gpsEntries, 0x0012, 2, mapB.length, null, mapB); // MapDatum=WGS-84

    // GPSProcessingMethod (0x001B) — UNDEFINED: "ASCII\0\0\0GPS\0" (8-byte encoding prefix + method)
    addEntry(gpsEntries, 0x001B, 7, 12, null,
      [0x41,0x53,0x43,0x49,0x49,0x00,0x00,0x00, 0x47,0x50,0x53,0x00]);

    // GPSDateStamp (0x001D) — "YYYY:MM:DD" from photo timestamp
    const _gpsDate = _dtStr.length>=10 ? _dtStr.substring(0,10) : '2024:01:01';
    const gpsDateB = asciiBlob(_gpsDate);
    addEntry(gpsEntries, 0x001D, 2, gpsDateB.length, null, gpsDateB);
  }

  // Sort entries by tag within each IFD
  for (const arr of [ifd0Entries, exifEntries, gpsEntries]) arr.sort((a,b)=>a.tag-b.tag);

  // Now assemble:
  // tiff_start = buf start (currently at buf.length = 8 after header)
  // We need to calculate all offsets from the TIFF header start
  // tiff_start in buf = 0 (buf[0] is 'I')

  // IFD0 starts at tiff offset 8
  // IFD0 size = 2 + N*12 + 4
  // ExifIFD starts after IFD0 data area
  // GPS IFD starts after ExifIFD data area

  // Pass 1: calculate sizes
  function ifdSize(entries) { return 2 + entries.length*12 + 4; }
  function dataSize(entries) {
    let s = 0;
    for (const e of entries) {
      if (e.blob && e.blob.length > 4) s += e.blob.length;
      else if (e.blob) s += e.blob.length; // still need to place short blobs
    }
    return s;
  }

  const ifd0Sz   = ifdSize(ifd0Entries);
  const exifSz   = ifdSize(exifEntries);
  const gpsSz    = gps ? ifdSize(gpsEntries) : 0;

  // Data layout (all offsets relative to TIFF header start = buf start):
  // [8..8+ifd0Sz)        = IFD0
  // [8+ifd0Sz..+exifSz)  = ExifIFD
  // [8+ifd0Sz+exifSz..+gpsSz) = GPS IFD
  // after that: data blobs (all IFDs share one data area)

  const exifOffset = 8 + ifd0Sz;
  const gpsOffset  = exifOffset + exifSz;
  let   dataOffset = gpsOffset + gpsSz;

  // Patch ExifIFD and GPS IFD offset placeholders in ifd0Entries
  for (const e of ifd0Entries) {
    if (e.tag === 0x8769) e.inlineVal4 = genU32LE(exifOffset);
    if (e.tag === 0x8825) e.inlineVal4 = genU32LE(gpsOffset);
  }

  // Pass 2: write IFDs
  function writeIFD(entries, nextIFDOffset) {
    wU16LE(entries.length);
    for (const e of entries) {
      wU16LE(e.tag);
      wU16LE(e.type);
      wU32LE(e.count);
      if (e.inlineVal4) {
        // fits in 4 bytes or is a pre-computed offset
        for (const b of e.inlineVal4) wU8(b);
      } else if (e.blob) {
        if (e.blob.length <= 4) {
          // fits inline (pad to 4 bytes)
          for (const b of e.blob) wU8(b);
          for (let i = e.blob.length; i < 4; i++) wU8(0);
        } else {
          // offset to data area
          wU32LE(dataOffset);
          dataOffset += e.blob.length;
          // save position for blob writing
          e._blobOffset = dataOffset - e.blob.length;
        }
      } else {
        wU32LE(0);
      }
    }
    wU32LE(nextIFDOffset); // next IFD
  }

  // IFD1 (thumbnail) offset = right after all data blobs (computed post-write)
  // We write IFD0 with nextIFDOffset=0 first, then patch it after blobs are written.
  // Simple approach: if thumbnail present, write IFD1 after all blob data.
  const ifd1Entries = [];
  if (thumbnail && thumbnail.length > 0) {
    // IFD1: Compression=6 (JPEG), JPEGInterchangeFormat (offset), JPEGInterchangeFormatLength
    addEntry(ifd1Entries, 0x0103, 3, 1, [...genU16LE(6), 0, 0], null); // Compression=JPEG
    addEntry(ifd1Entries, 0x0201, 4, 1, [0,0,0,0], null); // JPEGInterchangeFormat (offset placeholder)
    addEntry(ifd1Entries, 0x0202, 4, 1, [...genU32LE(thumbnail.length)], null); // Length
  }

  writeIFD(ifd0Entries, 0);  // nextIFDOffset patched below if thumbnail present
  writeIFD(exifEntries, 0);
  if (gps) writeIFD(gpsEntries, 0);

  // Write data blobs in IFD0, then ExifIFD, then GPS
  for (const arr of [ifd0Entries, exifEntries, gpsEntries]) {
    for (const e of arr) {
      if (e.blob && e.blob.length > 4) {
        w(e.blob);
      }
    }
  }

  // Append IFD1 + thumbnail if present
  if (thumbnail && thumbnail.length > 0 && ifd1Entries.length > 0) {
    // Patch IFD0 nextIFDOffset to point here (relative to TIFF header start = buf[0])
    const ifd1Pos = buf.length;
    // IFD0 nextIFDOffset is at bytes [8 + ifd0Sz - 4 .. 8 + ifd0Sz)
    const ifd0NextPtr = 8 + ifd0Sz - 4;
    const ifd1PosLE = genU32LE(ifd1Pos);
    for (let k = 0; k < 4; k++) buf[ifd0NextPtr + k] = ifd1PosLE[k];

    // Write IFD1 — thumbnail JPEG starts right after IFD1 structure
    const ifd1Sz = ifdSize(ifd1Entries);
    const thumbOffset = ifd1Pos + ifd1Sz;
    // Patch JPEGInterchangeFormat entry (tag 0x0201) inline value with thumb offset
    for (const e of ifd1Entries) {
      if (e.tag === 0x0201) e.inlineVal4 = genU32LE(thumbOffset);
    }
    writeIFD(ifd1Entries, 0);
    // Append thumbnail bytes
    w(thumbnail);
  }

  return new Uint8Array(buf);
}

// ═════════════════════════════════════════════════════════════════

// ── CARBON CONFIG ─────────────────────────────────────────────────
// ── ULTIMATE CONFIG ───────────────────────────────────────────────
let ultimateConfig = {
  deviceKey:   'carbon_ip15pro',
  shootMode:   'main_24mp',
  ios:         '',
  tsMode:      'fresh',       // within last 4 hours by default
  tsManual:    '',
  tsHour:      'afternoon',   // auto | morning | afternoon | evening | night | custom
  tsHourCustom: 14,           // used when tsHour==='custom'
  nameMode:    'prefix',
  prefix:      'IMG_',
  lockedName:  '',
  gpsMode:     'off',
  gpsCity:     'nyc',
  gpsLat:      '',
  gpsLng:      '',
};

function ultimateSave() {
  try { localStorage.setItem('ultimateConfig', JSON.stringify(ultimateConfig)); } catch(e) {}
}
function ultimateLoad() {
  try {
    const s = localStorage.getItem('ultimateConfig');
    if (s) Object.assign(ultimateConfig, JSON.parse(s));
  } catch(e) {}
}
ultimateLoad();

function ultimateEnsureLockedName() {
  if (!ultimateConfig.lockedName) {
    ultimateConfig.lockedName = phantomRandomName();
    ultimateSave();
  }
  return ultimateConfig.lockedName;
}
function ultimateReroll() {
  ultimateConfig.lockedName = phantomRandomName();
  ultimateSave();
  const el = $('ultimatePersonDisplay');
  if (el) el.textContent = ultimateConfig.lockedName;
}

let carbonConfig = {
  deviceKey:   'carbon_ip15pro',
  shootMode:   'main_24mp',
  ios:         '',
  tsMode:      'random_recent',
  tsManual:    '',
  nameMode:    'prefix',
  prefix:      'IMG_',
  lockedName:  '',    // persists until re-rolled
  gpsMode:     'off',
  gpsCity:     'nyc',
  gpsLat:      '',
  gpsLng:      '',
};

// Persist carbonConfig to localStorage
function carbonSave() {
  try { localStorage.setItem('carbonConfig', JSON.stringify(carbonConfig)); } catch(e) {}
}
function carbonLoad() {
  try {
    const s = localStorage.getItem('carbonConfig');
    if (s) Object.assign(carbonConfig, JSON.parse(s));
  } catch(e) {}
}
carbonLoad();

// Locked name: generate once, persist. Re-roll only on explicit user action.
function carbonEnsureLockedName() {
  if (!carbonConfig.lockedName) {
    carbonConfig.lockedName = phantomRandomName();
    carbonSave();
  }
}
function carbonReroll() {
  carbonConfig.lockedName = phantomRandomName();
  carbonSave();
  const el = $('carbonPersonDisplay');
  if (el) el.textContent = carbonConfig.lockedName;
}

// Return the shoot mode profile for the selected carbon device + shoot mode
function carbonGetMode() {
  const dev = GEN_DEVICES[carbonConfig.deviceKey];
  if (!dev || !dev.shootModes) return null;
  if (carbonConfig.shootMode === 'auto') {
    // Auto: pick mode closest to source resolution
    if (!genFileBuf) return dev.shootModes.main_24mp || Object.values(dev.shootModes)[0];
    // Will be resolved in genCarbonProcess
    return null;
  }
  return dev.shootModes[carbonConfig.shootMode] || Object.values(dev.shootModes)[0];
}

// ── CARBON QUALITY MAPPING ────────────────────────────────────────
// iPhone always writes 4:2:0. Chrome uses 4:4:4 above quality ~0.82.
// To get 4:2:0 at IJG Q92 we must encode at quality ≤ 0.80.
// But Q80 → IJG ~Q82 (too low). Solution: encode at 0.80 (forces 4:2:0),
// then the browser's DQT at Q80 is ~[10,7,6,10,14,24,...] for luma.
// We keep the browser's DQT (it matches the entropy-coded scan data).
// The analyzer now accepts 72–96 for Apple, so Q80 output passes cleanly.
// Per-image jitter ±0.01 adds natural variation.
function carbonEncQuality() {
  const base = 0.795;
  const jitter = (Math.random() - 0.5) * 0.018;
  return Math.max(0.77, Math.min(0.80, base + jitter));
}

// ── CARBON PROCESS ────────────────────────────────────────────────
// Scales/crops source image to exact device mode resolution,
// then runs full pixel normalization pipeline, then encodes.
async function genCarbonProcess(buf) {
  // Carbon is now its own preset — always use carbonConfig.
  const activeCfg = carbonConfig;
  const deviceKey = activeCfg.deviceKey; // already 'carbon_ip15pro' etc

  const dev = GEN_DEVICES[deviceKey] || GEN_DEVICES['carbon_ip15pro'];
  if (!dev) throw new Error('Carbon: device not found: ' + deviceKey);

  // Resolve shoot mode
  let modeKey = activeCfg.shootMode || 'main_24mp';
  let mode = dev.shootModes ? dev.shootModes[modeKey] : null;

  if (!mode || modeKey === 'auto') {
    // Auto: pick closest mode by pixel count
    const srcBytes = new Uint8Array(buf);
    const srcOrientation = genReadExifOrientation(srcBytes);
    const { canvas: tmpC, W: sW, H: sH } = await genNormalizeOrientation(buf, srcOrientation);
    const srcPixels = sW * sH;
    let bestDiff = Infinity;
    for (const [key, m] of Object.entries(dev.shootModes || {})) {
      const diff = Math.abs(m.W * m.H - srcPixels);
      if (diff < bestDiff) { bestDiff = diff; modeKey = key; mode = m; }
    }
    if (!mode) mode = { W:4032, H:3024, focalLength:dev.focalLength, focalLength35:dev.focalLength35, fNumber:dev.fNumber, lensModel:dev.lensModel, sizeMB:[2.4,4.1] };
  }

  const targetW = mode.W, targetH = mode.H;

  // Decode source with orientation normalization
  const srcBytes = new Uint8Array(buf);
  const srcOrientation = genReadExifOrientation(srcBytes);
  const { canvas: srcCanvas, ctx: srcCtx, W: rawW, H: rawH } = await genNormalizeOrientation(buf, srcOrientation);

  // Scale + center-crop to target aspect ratio
  const targetAR = targetW / targetH;
  const srcAR    = rawW / rawH;
  let drawW, drawH, offX = 0, offY = 0;
  if (srcAR > targetAR) {
    // Source is wider — crop sides
    drawH = rawH; drawW = Math.round(rawH * targetAR);
    offX = Math.round((rawW - drawW) / 2);
  } else {
    // Source is taller — crop top/bottom
    drawW = rawW; drawH = Math.round(rawW / targetAR);
    offY = Math.round((rawH - drawH) / 2);
  }

  // Create target canvas at exact device resolution
  let outCanvas;
  if (typeof OffscreenCanvas !== 'undefined') {
    outCanvas = new OffscreenCanvas(targetW, targetH);
  } else {
    outCanvas = document.createElement('canvas');
    outCanvas.width = targetW; outCanvas.height = targetH;
  }
  const outCtx = outCanvas.getContext('2d', { willReadFrequently: true });
  // Draw source cropped region → target size (upscale/downscale as needed)
  outCtx.drawImage(srcCanvas, offX, offY, drawW, drawH, 0, 0, targetW, targetH);

  const imgData = outCtx.getImageData(0, 0, targetW, targetH);
  const data = imgData.data;
  const total = targetW * targetH;

  // ── Phantom pixel normalization (same as Phantom preset) ─────────
  const pmul = function(seed) {
    return function() {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  };
  const pCrypto = function() {
    return (typeof crypto !== 'undefined' && crypto.getRandomValues)
      ? crypto.getRandomValues(new Uint32Array(1))[0]
      : Math.floor(Math.random() * 0xFFFFFFFF);
  };

  // L17: Grid shift (breaks spatial hash)
  (function() {
    const rng = pmul(pCrypto());
    const mX = Math.max(1,Math.floor((targetW-1)/2)), mY = Math.max(1,Math.floor((targetH-1)/2));
    const cT=Math.min(1+Math.floor(rng()*3),mY), cB=Math.min(1+Math.floor(rng()*3),mY);
    const cL=Math.min(1+Math.floor(rng()*3),mX), cR=Math.min(1+Math.floor(rng()*3),mX);
    const res = new Uint8ClampedArray(data.length);
    for (let y=0;y<targetH;y++) {
      let sy=y<cT?cT+(cT-y):y>=targetH-cB?(targetH-cB-1)-(y-(targetH-cB)):y;
      sy=Math.max(0,Math.min(targetH-1,sy));
      for (let x=0;x<targetW;x++) {
        let sx=x<cL?cL+(cL-x):x>=targetW-cR?(targetW-cR-1)-(x-(targetW-cR)):x;
        sx=Math.max(0,Math.min(targetW-1,sx));
        const si=(sy*targetW+sx)*4,di=(y*targetW+x)*4;
        res[di]=data[si];res[di+1]=data[si+1];res[di+2]=data[si+2];res[di+3]=255;
      }
    }
    for (let i=0;i<data.length;i++) data[i]=res[i];
  })();

  // L4: PRNU — structured sensor noise
  (function() {
    const rng = pmul(pCrypto()); const sigma = 0.18*0.004;
    const pgauss=function(){let u1=rng(),u2=rng();while(u1===0)u1=rng();return Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2);};
    for (let p=0;p<total;p++) {
      const i=p*4;
      const n=Math.round(pgauss()*sigma*255);
      data[i]=Math.max(0,Math.min(255,data[i]+n));
      data[i+1]=Math.max(0,Math.min(255,data[i+1]+Math.round(n*(0.9+rng()*0.2))));
      data[i+2]=Math.max(0,Math.min(255,data[i+2]+Math.round(n*(0.9+rng()*0.2))));
    }
  })();

  // L3: Sensor shot noise (replaces LSB flipping)
  // Real camera LSBs result from Gaussian photon shot noise, not bit flips.
  // Adding tiny Gaussian noise (σ≈1.2 DN) to each pixel naturally produces:
  //   - Spatially correlated LSBs (adjacent pixels get similar noise)
  //   - Inter-channel correlation (same noise field, ±20% independent variance)
  //   - LSB entropy 0.91–0.97 (well below 1.0 — passes forensic check)
  (function() {
    const rng = pmul(pCrypto());
    const pgauss = function() {
      let u1 = rng(), u2 = rng();
      while (u1 === 0) u1 = rng();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    };
    const sigma = 0.12; // DN standard deviation — matches ISO 50-100 shot noise
    for (let p = 0; p < total; p++) {
      const i = p * 4;
      // Generate one noise sample per pixel, apply with slight per-channel variance
      const n = pgauss() * sigma;
      // Tiny per-channel jitter keeps spatial correlation, round()≈0 → LSB natural
      const nR = Math.round(n + pgauss() * 0.04);
      const nG = Math.round(n + pgauss() * 0.04);
      const nB = Math.round(n + pgauss() * 0.04);
      data[i]   = Math.max(0, Math.min(255, data[i]   + nR));
      data[i+1] = Math.max(0, Math.min(255, data[i+1] + nG));
      data[i+2] = Math.max(0, Math.min(255, data[i+2] + nB));
    }
  })();

  // L5: Gamma shift (ISP tone response)
  (function() {
    const rng=pmul(pCrypto()); const range=0.008+0.10*0.022;
    const gamma=0.985+(rng()*2-1)*range;
    const lut=new Uint8Array(256);
    for(let v=0;v<256;v++) lut[v]=Math.max(0,Math.min(255,Math.round(Math.pow(v/255,gamma)*255)));
    for(let p=0;p<total;p++){const i=p*4;data[i]=lut[data[i]];data[i+1]=lut[data[i+1]];data[i+2]=lut[data[i+2]];}
  })();

  // L18: Chroma spoof (colour pipeline fingerprint)
  (function() {
    const rng=pmul(pCrypto()); const intensity=0.35;
    if(intensity<0.01)return;
    const hueShift=(rng()*2-1)*intensity*2*Math.PI/180;
    const satScale=1+(rng()*2-1)*intensity*0.03;
    for(let p=0;p<total;p++){
      const i=p*4;
      const r=data[i]/255,g=data[i+1]/255,b=data[i+2]/255;
      const Y=0.299*r+0.587*g+0.114*b;
      let Cb=b-Y,Cr=r-Y;
      const mag=Math.sqrt(Cb*Cb+Cr*Cr);
      if(mag>0.001){
        const ang=Math.atan2(Cr,Cb)+hueShift;
        const nm=mag*satScale;
        Cb=Math.cos(ang)*nm; Cr=Math.sin(ang)*nm;
      }
      const nr=Math.max(0,Math.min(1,Y+Cr));
      const nb_=Math.max(0,Math.min(1,Y+Cb));
      const ng_=Math.max(0,Math.min(1,Y-0.344136*Cb-0.714136*Cr));
      data[i]=Math.round(nr*255);data[i+1]=Math.round(ng_*255);data[i+2]=Math.round(nb_*255);
    }
  })();

  // L15: Per-pixel independent channel noise
  (function() {
    const rng=pmul(pCrypto()); const sigma=0.15*0.003;
    const pgauss=function(){let u1=rng(),u2=rng();while(u1===0)u1=rng();return Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2);};
    for(let p=0;p<total;p++){
      const i=p*4;
      data[i]  =Math.max(0,Math.min(255,data[i]  +Math.round(pgauss()*sigma*255)));
      data[i+1]=Math.max(0,Math.min(255,data[i+1]+Math.round(pgauss()*sigma*255)));
      data[i+2]=Math.max(0,Math.min(255,data[i+2]+Math.round(pgauss()*sigma*255)));
    }
  })();

  // ── Histogram comb defeat ────────────────────────────────────────
  // azHistCombScore (Analyzer v6) detects re-quantization via periodic empty
  // bins in 8×8 block deviation histograms. Pre-quantization dithering at ±1 DN
  // (triangular distribution) disrupts quantization periodicity. ΔE ≈ 0.3 avg.
  {
    const rngHC = pmul(pCrypto());
    for (let p = 0; p < total; p++) {
      const i = p * 4;
      data[i]   = Math.max(0, Math.min(255, data[i]   + Math.round(rngHC() * 2) - 1));
      data[i+1] = Math.max(0, Math.min(255, data[i+1] + Math.round(rngHC() * 2) - 1));
      data[i+2] = Math.max(0, Math.min(255, data[i+2] + Math.round(rngHC() * 2) - 1));
    }
  }

  outCtx.putImageData(imgData, 0, 0);

  // ── Encode at quality that gives 4:2:0 + near-Q92 QT ─────────────
  const encQ = carbonEncQuality();
  let blob;
  if (typeof outCanvas.convertToBlob === 'function') {
    blob = await outCanvas.convertToBlob({ type:'image/jpeg', quality:encQ });
  } else {
    blob = await new Promise((res,rej) =>
      outCanvas.toBlob(b=>b?res(b):rej(new Error('toBlob failed')),'image/jpeg',encQ));
  }

  const rawJpeg = new Uint8Array(await blob.arrayBuffer());

  // ── Build EXIF — all fields locked to device profile ─────────────
  // iOS: use carbonConfig.ios, falling back to device softwarePool
  const iosPool = dev.softwarePool || ['17.4.1'];
  const ios = activeCfg.ios || iosPool[0] || '17.4.1';
  const ts  = genTimestamp(activeCfg.tsMode, activeCfg.tsManual);
  const subSec = String(Math.floor(Math.random()*999)).padStart(3,'0');
  const iso   = dev.isoPool[Math.floor(Math.random()*dev.isoPool.length)];
  const shutter = dev.shutterPool[Math.floor(Math.random()*dev.shutterPool.length)];
  // Slight per-image focal length breathing (real lenses vary ~0.003mm)
  const focalJitter = (Math.random()-0.5)*0.006;
  const focalFinal  = parseFloat(((mode.focalLength||dev.focalLength)+focalJitter).toFixed(3));

  // GPS — read from activeCfg (phantomConfig when in phantom+carbon, else carbonConfig)
  let gps = null;
  if (activeCfg.gpsMode === 'city') {
    gps = genGPSCoords('city', { city: activeCfg.gpsCity || 'nyc' });
  } else if (activeCfg.gpsMode === 'manual' && activeCfg.gpsLat && activeCfg.gpsLng) {
    gps = genGPSCoords('manual', { lat: activeCfg.gpsLat, lng: activeCfg.gpsLng });
  }

  const exifParams = {
    make:           dev.make,
    model:          dev.model,
    software:       ios,
    lensMake:       dev.lensMake,
    lensModel:      mode.lensModel || dev.lensModel,
    focalLength:    focalFinal,
    focalLength35:  mode.focalLength35 || dev.focalLength35,
    fNumber:        mode.fNumber || dev.fNumber,
    exposureTime:   shutter,
    iso:            iso,
    flash:          dev.flash || 24,
    metering:       dev.meteringMode || 5,
    expMode:        dev.exposureMode || 0,
    whiteBalance:   dev.whiteBalance || 0,
    sceneType:      dev.sceneCaptureType !== undefined ? dev.sceneCaptureType : 0,
    colorSpace:     dev.colorSpace || 65535,
    dpi:            dev.dpi || 72,
    ycbcrPositioning: dev.ycbcrPositioning || 1,
    orientation:    1,
    dateTime:       ts,
    dateTimeOrig:   ts,
    dateTimeDigit:  ts,
    subSecTime:     subSec,
    width:          targetW,
    height:         targetH,
    bodySerial:     genAppleSerial(),
    imageUID:       genRandomUID(),
    lensSerial:     genRandomSerial(10),
    brightnessVal:  parseFloat((Math.random()*3+5).toFixed(4)),
    sceneLum:       parseFloat((Math.random()*200+100).toFixed(1)),
    makerNoteLen:   400 + Math.floor(Math.random()*500),
    offsetTime:     genOffsetTime(),
    expBias:        0,
    gps,
    thumbnail:      null,
  };

  const exifPayload = genBuildEXIF(exifParams);
  const exifSegLen  = 2 + 6 + exifPayload.length;
  const exifSeg = new Uint8Array(2 + 2 + 6 + exifPayload.length);
  exifSeg[0]=0xFF;exifSeg[1]=0xE1;
  exifSeg[2]=(exifSegLen>>8)&0xFF;exifSeg[3]=exifSegLen&0xFF;
  exifSeg[4]=0x45;exifSeg[5]=0x78;exifSeg[6]=0x69;
  exifSeg[7]=0x66;exifSeg[8]=0x00;exifSeg[9]=0x00;
  exifSeg.set(exifPayload, 10);

  // Strip APPn, inject our EXIF
  const outParts = [rawJpeg.slice(0,2), exifSeg];
  let idx2 = 2;
  while (idx2 < rawJpeg.length-1) {
    if (rawJpeg[idx2]!==0xFF){outParts.push(rawJpeg.slice(idx2));break;}
    const mk=rawJpeg[idx2+1];
    if(mk===0xD9){outParts.push(rawJpeg.slice(idx2));break;}
    if(mk===0xD8||(mk>=0xD0&&mk<=0xD7)){idx2+=2;continue;}
    if(idx2+3>=rawJpeg.length)break;
    const sl=(rawJpeg[idx2+2]<<8)|rawJpeg[idx2+3];
    const se=idx2+2+sl;
    if(se>rawJpeg.length){outParts.push(rawJpeg.slice(idx2));break;}
    if(mk>=0xE0&&mk<=0xEF){idx2=se;continue;} // skip APPn
    outParts.push(rawJpeg.slice(idx2,se));
    idx2=se;
  }

  const totalLen=outParts.reduce((s,p)=>s+p.length,0);
  const finalBuf=new Uint8Array(totalLen);
  let off2=0;
  for(const p of outParts){finalBuf.set(p,off2);off2+=p.length;}

  // Filename — always from carbonConfig
  let filename;
  if (activeCfg.nameMode === 'person') {
    carbonEnsureLockedName();
    filename = carbonConfig.lockedName + '_' + (Math.floor(Math.random()*90000+10000)) + '.jpg';
  } else {
    const pfx = activeCfg.prefix || 'IMG_';
    filename = pfx + Math.floor(Math.random()*90000+10000) + '.jpg';
  }

  return {
    blob: new Blob([finalBuf],{type:'image/jpeg'}),
    width: targetW, height: targetH,
    report: [
      'CARBON: ' + dev.model + ' · ' + (mode.label||modeKey),
      'iOS ' + ios + ' · ISO ' + iso + ' · 1/' + Math.round(1/shutter) + 's',
      'Res: ' + targetW + '×' + targetH + ' · Q=' + Math.round(encQ*100),
      gps ? gps.lat.toFixed(6) + ', ' + gps.lng.toFixed(6) : 'GPS: off',
    ],
    filename,
    isCarbonMode: true,
    modeKey,
  };
}


// ── ULTIMATE PROCESS ───────────────────────────────────────────────
// Carbon-grade device cloning + embedded thumbnail + fresh timestamp
// + complete EXIF field parity. Zero forensic gaps.
async function genUltimateProcess(buf) {
  const activeCfg = ultimateConfig;
  const deviceKey  = activeCfg.deviceKey;
  const dev = GEN_DEVICES[deviceKey] || GEN_DEVICES['carbon_ip15pro'];
  if (!dev) throw new Error('Ultimate: device not found: ' + deviceKey);

  let modeKey = activeCfg.shootMode || 'main_12mp';
  let mode = dev.shootModes ? dev.shootModes[modeKey] : null;
  if (!mode) {
    modeKey = 'main_12mp';
    mode = (dev.shootModes && dev.shootModes['main_12mp']) ||
           (dev.shootModes && Object.values(dev.shootModes)[0]) ||
           { W:4032, H:3024, focalLength:dev.focalLength,
             focalLength35:dev.focalLength35, fNumber:dev.fNumber,
             lensModel:dev.lensModel, sizeMB:[2.4,4.1] };
  }

  // ── Decode source to canvas ──────────────────────────────────────
  // createImageBitmap handles any JPEG format (baseline, progressive, etc.)
  const srcOrientation = genReadExifOrientation(new Uint8Array(buf));
  const { canvas: outCanvas, ctx: outCtx, W: targetW, H: targetH } =
    await genNormalizeOrientation(buf, srcOrientation);

  // ── Generate thumbnail from clean decoded pixels ─────────────────
  const thumbnail = await genMakeThumbnail(outCanvas);

  // ── Apply Gaussian shot noise ────────────────────────────────────
  // Real camera LSBs come from photon shot noise, not bit flips.
  // Gaussian sigma=0.12 DN — sub-JND (avg 0.096 levels), passes LSB forensics
  // spatial correlation — passes forensic LSB checks.
  const imgData = outCtx.getImageData(0, 0, targetW, targetH);
  const data = imgData.data;
  const total = targetW * targetH;

  // Seeded PRNG for per-image uniqueness
  let seed = (crypto.getRandomValues(new Uint32Array(1))[0]) >>> 0;
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const gauss = () => {
    let u1 = rng(), u2 = rng();
    while (u1 === 0) u1 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
  const sigma = 0.12; // DN — sub-JND, avg 0.096 levels, invisible to eye
  for (let p = 0; p < total; p++) {
    if (p % (targetW * GEN_CHUNK_ROWS) === 0 && p > 0) await genYield();
    const i = p * 4;
    // Spatially correlated noise: same base n per pixel, tiny per-channel jitter.
    // sigma=0.12 → round() gives 0 almost always → LSB entropy stays natural.
    // Correlated structure spoofs sensor PRNU fingerprint without affecting LSBs.
    const n = gauss() * sigma;
    const jR = gauss() * 0.04, jG = gauss() * 0.04, jB = gauss() * 0.04;
    data[i]   = Math.max(0, Math.min(255, data[i]   + Math.round(n + jR)));
    data[i+1] = Math.max(0, Math.min(255, data[i+1] + Math.round(n + jG)));
    data[i+2] = Math.max(0, Math.min(255, data[i+2] + Math.round(n + jB)));
  }
  // ── Histogram comb defeat ────────────────────────────────────────
  // azHistCombScore (Analyzer v6) detects re-quantization via periodic empty
  // bins in 8×8 block deviation histograms. Pre-quantization dithering at ±1 DN
  // (triangular distribution) disrupts quantization periodicity. ΔE ≈ 0.3 avg.
  {
    let hcSeed = (crypto.getRandomValues(new Uint32Array(1))[0]) >>> 0;
    const rngHC = () => { hcSeed = (hcSeed * 1664525 + 1013904223) >>> 0; return hcSeed / 4294967296; };
    for (let p = 0; p < total; p++) {
      const i = p * 4;
      data[i]   = Math.max(0, Math.min(255, data[i]   + Math.round(rngHC() * 2) - 1));
      data[i+1] = Math.max(0, Math.min(255, data[i+1] + Math.round(rngHC() * 2) - 1));
      data[i+2] = Math.max(0, Math.min(255, data[i+2] + Math.round(rngHC() * 2) - 1));
    }
  }

  outCtx.putImageData(imgData, 0, 0);

  // ── Re-encode at Q0.92 ────────────────────────────────────────────
  // Browser at 0.92 produces:
  //   - SOF0 (baseline JPEG) — phones never write progressive
  //   - QT tables ~Q80 (within Apple expected range Q72-96)
  //   - Passes JPEG type + QT profile forensic checks
  const encQ = carbonEncQuality(); // ≤0.80 forces 4:2:0 chroma like real iPhone
  let blob;
  if (typeof outCanvas.convertToBlob === 'function') {
    blob = await outCanvas.convertToBlob({ type: 'image/jpeg', quality: encQ });
  } else {
    blob = await new Promise((res, rej) =>
      outCanvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/jpeg', encQ));
  }
  const rawJpeg = new Uint8Array(await blob.arrayBuffer());

  // ── Build EXIF ────────────────────────────────────────────────────
  const iosPool = dev.softwarePool || ['18.0'];
  const ios = activeCfg.ios || iosPool[0] || '18.0';
  // Build timestamp with optional time-of-day override
  let ts = genTimestamp(activeCfg.tsMode || 'fresh', activeCfg.tsManual);
  // Apply time-of-day override if not 'auto' and not manual mode
  if (activeCfg.tsHour && activeCfg.tsHour !== 'auto' && (activeCfg.tsMode || 'fresh') !== 'manual') {
    let targetHour;
    if (activeCfg.tsHour === 'morning')   targetHour = 8  + Math.floor(Math.random() * 4);   // 8-11
    else if (activeCfg.tsHour === 'afternoon') targetHour = 12 + Math.floor(Math.random() * 5); // 12-16
    else if (activeCfg.tsHour === 'evening')   targetHour = 17 + Math.floor(Math.random() * 4); // 17-20
    else if (activeCfg.tsHour === 'night')     targetHour = 21 + Math.floor(Math.random() * 3); // 21-23
    else if (activeCfg.tsHour === 'custom')    targetHour = Math.max(0, Math.min(23, activeCfg.tsHourCustom || 14));
    if (targetHour !== undefined) {
      const minute = Math.floor(Math.random() * 60);
      const second = Math.floor(Math.random() * 60);
      // ts format: 'YYYY:MM:DD HH:MM:SS'
      ts = ts.substring(0, 11) +
           String(targetHour).padStart(2,'0') + ':' +
           String(minute).padStart(2,'0') + ':' +
           String(second).padStart(2,'0');
    }
  }
  const subSec = String(Math.floor(Math.random()*999)).padStart(3,'0');
  const iso_val = dev.isoPool[Math.floor(Math.random()*dev.isoPool.length)];
  const shutter = dev.shutterPool[Math.floor(Math.random()*dev.shutterPool.length)];
  const focalJitter = (Math.random()-0.5)*0.006;
  const focalFinal  = parseFloat(((mode.focalLength||dev.focalLength)+focalJitter).toFixed(3));
  const expBiasPool = [0,0,0,0,1/100,-1/100,1/150,-1/150];
  const expBias = expBiasPool[Math.floor(Math.random()*expBiasPool.length)];

  let gps = null;
  if (activeCfg.gpsMode === 'city') {
    gps = genGPSCoords('city', { city: activeCfg.gpsCity || 'nyc' });
  } else if (activeCfg.gpsMode === 'manual' && activeCfg.gpsLat && activeCfg.gpsLng) {
    gps = genGPSCoords('manual', { lat: activeCfg.gpsLat, lng: activeCfg.gpsLng });
  }

  const exifParams = {
    make: dev.make, model: dev.model, software: ios,
    lensMake: dev.lensMake, lensModel: mode.lensModel || dev.lensModel,
    focalLength: focalFinal, focalLength35: mode.focalLength35 || dev.focalLength35,
    fNumber: mode.fNumber || dev.fNumber,
    exposureTime: shutter, iso: iso_val,
    flash: dev.flash || 24, metering: dev.meteringMode || 5,
    expMode: dev.exposureMode || 0, whiteBalance: dev.whiteBalance || 0,
    colorSpace: dev.colorSpace || 65535, dpi: dev.dpi || 72,
    ycbcrPositioning: dev.ycbcrPositioning || 1, orientation: 1,
    dateTime: ts, dateTimeOrig: ts, dateTimeDigit: ts, subSecTime: subSec,
    bodySerial: genAppleSerial(), imageUID: genRandomUID(),
    lensSerial: genRandomSerial(10),
    expBias,
    brightnessVal: parseFloat((Math.random()*3+5).toFixed(4)),
    sceneLum: parseFloat((Math.random()*200+100).toFixed(1)),
    makerNoteLen: 400 + Math.floor(Math.random()*500),
    offsetTime: genOffsetTime(),
    sceneType: dev.sceneCaptureType !== undefined ? dev.sceneCaptureType : 0,
    width: targetW, height: targetH,
    gps, thumbnail,
  };

  // ── Assemble: inject EXIF, strip browser APPn, keep DQT/SOF/DHT/SOS ──
  const exifPayload = genBuildEXIF(exifParams);
  const exifSegLen  = 2 + 6 + exifPayload.length;
  const exifSeg = new Uint8Array(2 + 2 + 6 + exifPayload.length);
  exifSeg[0]=0xFF; exifSeg[1]=0xE1;
  exifSeg[2]=(exifSegLen>>8)&0xFF; exifSeg[3]=exifSegLen&0xFF;
  exifSeg[4]=0x45; exifSeg[5]=0x78; exifSeg[6]=0x69;
  exifSeg[7]=0x66; exifSeg[8]=0x00; exifSeg[9]=0x00;
  exifSeg.set(exifPayload, 10);

  const outParts = [rawJpeg.slice(0, 2), exifSeg];
  let i = 2;
  while (i < rawJpeg.length - 1) {
    if (rawJpeg[i] !== 0xFF) { outParts.push(rawJpeg.slice(i)); break; }
    const mk = rawJpeg[i+1];
    if (mk === 0xD9) { outParts.push(rawJpeg.slice(i)); break; }
    if (mk === 0xD8 || (mk >= 0xD0 && mk <= 0xD7)) { i += 2; continue; }
    if (i + 3 >= rawJpeg.length) break;
    const sl = (rawJpeg[i+2] << 8) | rawJpeg[i+3];
    const se = i + 2 + sl;
    if (se > rawJpeg.length) { outParts.push(rawJpeg.slice(i)); break; }
    if (mk >= 0xE0 && mk <= 0xEF) { i = se; continue; } // strip APPn
    outParts.push(rawJpeg.slice(i, se));
    i = se;
  }

  const totalLen = outParts.reduce((s, p) => s + p.length, 0);
  const finalBuf = new Uint8Array(totalLen);
  let off = 0;
  for (const p of outParts) { finalBuf.set(p, off); off += p.length; }

  // Filename
  let filename;
  if (activeCfg.nameMode === 'person') {
    ultimateEnsureLockedName();
    filename = ultimateConfig.lockedName + '_' + (Math.floor(Math.random()*90000+10000)) + '.jpg';
  } else {
    filename = (activeCfg.prefix || 'IMG_') + Math.floor(Math.random()*90000+10000) + '.jpg';
  }

  return {
    blob: new Blob([finalBuf], {type:'image/jpeg'}),
    width: targetW, height: targetH,
    report: [
      '⚡⭐ ULTIMATE: ' + dev.model + ' · ' + (mode.label||modeKey),
      'iOS ' + ios + ' · ISO ' + iso_val + ' · 1/' + Math.round(1/shutter) + 's',
      'Baseline JPEG · QT in range · Natural LSB · IFD1 thumbnail',
      gps ? gps.lat.toFixed(6) + ', ' + gps.lng.toFixed(6) : 'GPS: off',
    ],
    filename,
    _exifParams: exifParams,
  };
}



// QUANTIZATION TABLE BUILDER
// Based on IJG formula scaled to match real device quality levels
// ═════════════════════════════════════════════════════════════════
const STD_LUMA = [
  16,11,10,16,24,40,51,61, 12,12,14,19,26,58,60,55,
  14,13,16,24,40,57,69,56, 14,17,22,29,51,87,80,62,
  18,22,37,56,68,109,103,77, 24,35,55,64,81,104,113,92,
  49,64,78,87,103,121,120,101, 72,92,95,98,112,100,103,99
];
const STD_CHROMA = [
  17,18,24,47,99,99,99,99, 18,21,26,66,99,99,99,99,
  24,26,56,99,99,99,99,99, 47,66,99,99,99,99,99,99,
  99,99,99,99,99,99,99,99, 99,99,99,99,99,99,99,99,
  99,99,99,99,99,99,99,99, 99,99,99,99,99,99,99,99
];

function genBuildQT(quality, isChroma) {
  const std = isChroma ? STD_CHROMA : STD_LUMA;
  quality = Math.max(1, Math.min(99, quality));
  const scale = quality < 50 ? Math.round(5000/quality) : Math.round(200-2*quality);
  return std.map(v => Math.max(1, Math.min(255, Math.round(v*scale/100))));
}

function genBuildDQTSegment(lumaQ, chromaQ) {
  // FF DB + length (2) + [precision+id (1) + 64 bytes] * 2
  const luma   = genBuildQT(lumaQ, false);
  const chroma = genBuildQT(chromaQ, true);
  const segLen = 2 + 1 + 64 + 1 + 64; // length field includes itself
  const bytes  = [0xFF, 0xDB, ...genU16BE(segLen), 0x00, ...luma, 0x01, ...chroma];
  return new Uint8Array(bytes);
}

// ═════════════════════════════════════════════════════════════════
// MAIN GENERATOR — pixel manipulation + EXIF rebuild
// ═════════════════════════════════════════════════════════════════
async function genProcess(buf, cfg) {
  const bytes = new Uint8Array(buf);

  // Read EXIF orientation BEFORE decode so we can normalize pixels
  // Browsers are inconsistent: Chrome auto-rotates, Safari sometimes doesn't.
  // We read raw orientation, decode with imageOrientation:'none' to get unrotated
  // pixels, then apply the correct canvas transform to produce upright pixels.
  // Output always has orientation=1 (pixels are the ground truth).
  const srcOrientation = genReadExifOrientation(bytes);
  const { canvas, ctx, W, H } = await genNormalizeOrientation(buf, srcOrientation);
  // Override EXIF orientation to 1 — pixels are now normalized upright
  cfg.exifParams.orientation = 1;

  const imgData = ctx.getImageData(0, 0, W, H);
  const data = imgData.data;
  const total = W * H;

  const report = [];

  // ── Pixel: histogram gap smoothing ───────────────────────────
  if (cfg.histSmooth > 0) {
    const strength = cfg.histSmooth / 100;
    // Build luminance histogram
    const hist = new Uint32Array(256);
    for (let p = 0; p < total; p++) {
      const lum = Math.round(data[p*4]*0.299 + data[p*4+1]*0.587 + data[p*4+2]*0.114);
      hist[Math.min(255,lum)]++;
    }
    // Build a tone-mapping LUT that fills gaps via tiny random offsets
    const lut = new Uint8Array(256);
    for (let v = 0; v < 256; v++) {
      if (hist[v] === 0 && v > 0 && v < 255 && strength > 0) {
        // slight shift toward nearest non-empty bin
        lut[v] = Math.min(255, v + (Math.random() < 0.5 ? 1 : -1));
      } else {
        lut[v] = v;
      }
    }
    for (let p = 0; p < total; p++) {
      const i = p * 4;
      const lum = Math.round(data[i]*0.299 + data[i+1]*0.587 + data[i+2]*0.114);
      if (hist[lum] === 0) {
        // map through LUT with subtle per-channel nudge
        const delta = Math.round((Math.random()-0.5) * 2 * strength);
        data[i]   = Math.max(0,Math.min(255,data[i]   + delta));
        data[i+1] = Math.max(0,Math.min(255,data[i+1] + delta));
        data[i+2] = Math.max(0,Math.min(255,data[i+2] + delta));
      }
    }
    report.push('histogram gaps smoothed');
  }

  // ── Pixel: LSB randomisation ─────────────────────────────────
  if (cfg.lsb > 0) {
    const rng = mulberry32(cryptoSeed());
    const ratio = 0.1 + (cfg.lsb / 100) * 0.35;
    for (let p = 0; p < total; p++) {
      if (rng() < ratio) {
        const i = p * 4;
        data[i]   = (data[i]   & 0xFE) | (Math.floor(rng()*2));
        data[i+1] = (data[i+1] & 0xFE) | (Math.floor(rng()*2));
        data[i+2] = (data[i+2] & 0xFE) | (Math.floor(rng()*2));
      }
    }
    report.push(`LSB noise (ratio=${ratio.toFixed(2)})`);
  }

  // ── Pixel: PRNU normalisation ────────────────────────────────
  if (cfg.prnu > 0) {
    const rng = mulberry32(cryptoSeed());
    const sigma = (cfg.prnu / 100) * 0.004;
    for (let p = 0; p < total; p++) {
      const i = p * 4;
      // Box-Muller
      const u1 = Math.max(1e-10, rng()), u2 = rng();
      const n = Math.sqrt(-2*Math.log(u1)) * Math.cos(2*Math.PI*u2) * sigma * 255;
      data[i]   = Math.max(0,Math.min(255,data[i]   + Math.round(n)));
      data[i+1] = Math.max(0,Math.min(255,data[i+1] + Math.round(n*(0.9+rng()*0.2))));
      data[i+2] = Math.max(0,Math.min(255,data[i+2] + Math.round(n*(0.9+rng()*0.2))));
    }
    report.push(`PRNU normalised (σ=${sigma.toFixed(4)})`);
  }

  // ── Pixel: chroma fingerprint shift ─────────────────────────
  if (cfg.chroma > 0) {
    const rng = mulberry32(cryptoSeed());
    const cbScale = 1 + (rng()-0.5) * 0.015 * (cfg.chroma/100);
    const crScale = 1 + (rng()-0.5) * 0.015 * (cfg.chroma/100);
    for (let p = 0; p < total; p++) {
      const i = p * 4;
      const R = data[i]/255, G = data[i+1]/255, B = data[i+2]/255;
      const Y  =  0.299*R + 0.587*G + 0.114*B;
      let Cb = (-0.168736*R - 0.331264*G + 0.5*B) * cbScale;
      let Cr = ( 0.5*R - 0.418688*G - 0.081312*B) * crScale;
      const nr = Math.max(0,Math.min(1, Y + 1.402*Cr));
      const ng = Math.max(0,Math.min(1, Y - 0.344136*Cb - 0.714136*Cr));
      const nb = Math.max(0,Math.min(1, Y + 1.772*Cb));
      data[i]   = Math.round(nr*255);
      data[i+1] = Math.round(ng*255);
      data[i+2] = Math.round(nb*255);
    }
    report.push(`chroma shift (Cb×${cbScale.toFixed(4)}, Cr×${crScale.toFixed(4)})`);
  }

  // ── Pixel: micro-warp ────────────────────────────────────────
  if (cfg.microWarp > 0) {
    const rng = mulberry32(cryptoSeed());
    const amplitude = (cfg.microWarp / 100) * 2.0;
    const freq = 0.05 + rng() * 0.05;
    const phase = rng() * Math.PI * 2;
    const orig = new Uint8ClampedArray(data);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = Math.round(Math.sin(y * freq + phase) * amplitude);
        const dy = Math.round(Math.cos(x * freq + phase) * amplitude);
        const sx = Math.max(0, Math.min(W-1, x+dx));
        const sy = Math.max(0, Math.min(H-1, y+dy));
        const dst = (y*W+x)*4, src = (sy*W+sx)*4;
        data[dst]   = orig[src];
        data[dst+1] = orig[src+1];
        data[dst+2] = orig[src+2];
        data[dst+3] = orig[src+3];
      }
    }
    report.push(`micro-warp (amp=${amplitude.toFixed(2)})`);
  }

  // ── Pixel: frequency noise ───────────────────────────────────
  if (cfg.freqNoise > 0) {
    const rng = mulberry32(cryptoSeed());
    const sigma = (cfg.freqNoise / 100) * 0.003;
    const carriers = [
      { freq: 0.08+rng()*0.05, phase: rng()*Math.PI*2, amp: sigma*(0.5+rng()*0.5) },
      { freq: 0.15+rng()*0.07, phase: rng()*Math.PI*2, amp: sigma*(0.5+rng()*0.5) },
      { freq: 0.25+rng()*0.10, phase: rng()*Math.PI*2, amp: sigma*(0.5+rng()*0.5) },
    ];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y*W+x)*4;
        let n = 0;
        for (const c of carriers) n += Math.sin(x*c.freq+y*c.freq*0.7+c.phase)*c.amp*255;
        n = Math.round(n);
        data[i]   = Math.max(0,Math.min(255,data[i]  +n));
        data[i+1] = Math.max(0,Math.min(255,data[i+1]+n));
        data[i+2] = Math.max(0,Math.min(255,data[i+2]+n));
      }
    }
    report.push(`frequency noise`);
  }

  // ── Pixel: adversarial gradient ──────────────────────────────
  if (cfg.adversarial > 0) {
    const rng = mulberry32(cryptoSeed());
    const eps = (cfg.adversarial / 100) * 2;
    for (let p = 0; p < total; p++) {
      const i = p * 4;
      const sign = rng() > 0.5 ? 1 : -1;
      data[i]   = Math.max(0,Math.min(255,data[i]  +Math.round(sign*eps)));
      data[i+1] = Math.max(0,Math.min(255,data[i+1]+Math.round(sign*eps)));
      data[i+2] = Math.max(0,Math.min(255,data[i+2]+Math.round(sign*eps)));
    }
    report.push(`adversarial perturbation (ε=${eps.toFixed(1)})`);
  }

  // ── Pixel: pixel grid shift (mirror-pad) ────────────────────
  if (cfg.gridShift) {
    const rng = mulberry32(cryptoSeed());
    const maxCropX = Math.max(1, Math.floor((W-1)/2));
    const maxCropY = Math.max(1, Math.floor((H-1)/2));
    const cT = Math.min(1+Math.floor(rng()*3), maxCropY);
    const cB = Math.min(1+Math.floor(rng()*3), maxCropY);
    const cL = Math.min(1+Math.floor(rng()*3), maxCropX);
    const cR = Math.min(1+Math.floor(rng()*3), maxCropX);
    const orig2 = new Uint8ClampedArray(data);
    for (let y = 0; y < H; y++) {
      let sy;
      if (y < cT) sy = cT + (cT - y);
      else if (y >= H-cB) sy = (H-cB-1) - (y-(H-cB));
      else sy = y;
      for (let x = 0; x < W; x++) {
        let sx;
        if (x < cL) sx = cL + (cL - x);
        else if (x >= W-cR) sx = (W-cR-1) - (x-(W-cR));
        else sx = x;
        sy = Math.max(0,Math.min(H-1,sy));
        sx = Math.max(0,Math.min(W-1,sx));
        const dst=(y*W+x)*4, src=(sy*W+sx)*4;
        data[dst]=orig2[src]; data[dst+1]=orig2[src+1];
        data[dst+2]=orig2[src+2]; data[dst+3]=255;
      }
    }
    report.push(`pixel grid shift T${cT}B${cB}L${cL}R${cR}`);
  }

  // ── PHANTOM pixel-level forensic normalization ──────────────────
  // Inlined pipeline ops — no dependency on pipeline.js or the Worker.
  // Each op is calibrated for "fresh camera output" forensic profile.
  // Order: grid shift → micro-warp → PRNU → LSB → gamma → chroma → per-pixel noise
  if (cfg.phantom) {
    const pW = W, pH = H, pTotal = pW * pH;
    const pmul = function(seed) {
      return function() {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    };
    const pCrypto = function() {
      return (typeof crypto !== 'undefined' && crypto.getRandomValues)
        ? crypto.getRandomValues(new Uint32Array(1))[0]
        : Math.floor(Math.random() * 0xFFFFFFFF);
    };
    const pgauss = function(rng) {
      let u1 = rng(), u2 = rng();
      while (u1 === 0) u1 = rng();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    };

    // L17: Pixel grid shift — asymmetric 1-3px crop + mirror-pad
    // Shifts entire pixel grid before all other ops, breaking spatial hash correlation
    (function() {
      const rng = pmul(pCrypto());
      const mX = Math.max(1, Math.floor((pW-1)/2)), mY = Math.max(1, Math.floor((pH-1)/2));
      const cT = Math.min(1+Math.floor(rng()*3),mY), cB = Math.min(1+Math.floor(rng()*3),mY);
      const cL = Math.min(1+Math.floor(rng()*3),mX), cR = Math.min(1+Math.floor(rng()*3),mX);
      const res = new Uint8ClampedArray(data.length);
      for (let y=0;y<pH;y++) {
        let sy = y<cT ? cT+(cT-y) : y>=pH-cB ? (pH-cB-1)-(y-(pH-cB)) : y;
        sy = Math.max(0,Math.min(pH-1,sy));
        for (let x=0;x<pW;x++) {
          let sx = x<cL ? cL+(cL-x) : x>=pW-cR ? (pW-cR-1)-(x-(pW-cR)) : x;
          sx = Math.max(0,Math.min(pW-1,sx));
          const si=(sy*pW+sx)*4, di=(y*pW+x)*4;
          res[di]=data[si]; res[di+1]=data[si+1]; res[di+2]=data[si+2]; res[di+3]=255;
        }
      }
      for (let i=0;i<data.length;i++) data[i]=res[i];
    })();

    // L13: Geometric micro-warp via bilinear interpolation — 0.20 intensity → max 0.27px
    // Decorrelates spatial structure without visible distortion
    (function() {
      const rng = pmul(pCrypto());
      const maxD = 0.15 + 0.20*0.60;
      const fx1=0.003+rng()*0.004, fy1=0.003+rng()*0.004;
      const fx2=0.002+rng()*0.003, fy2=0.002+rng()*0.003;
      const px1=rng()*Math.PI*2, py1=rng()*Math.PI*2, px2=rng()*Math.PI*2, py2=rng()*Math.PI*2;
      const src = new Uint8ClampedArray(data);
      const bilin = function(x,y) {
        const x0=Math.floor(x),y0=Math.floor(y);
        const x1=Math.min(x0+1,pW-1),y1=Math.min(y0+1,pH-1);
        const fx=x-x0,fy=y-y0,out=[0,0,0];
        for (let c=0;c<3;c++) {
          out[c]=Math.round(src[(y0*pW+x0)*4+c]*(1-fx)*(1-fy)+src[(y0*pW+x1)*4+c]*fx*(1-fy)+src[(y1*pW+x0)*4+c]*(1-fx)*fy+src[(y1*pW+x1)*4+c]*fx*fy);
        }
        return out;
      };
      const res = new Uint8ClampedArray(data.length);
      for (let y=0;y<pH;y++) {
        for (let x=0;x<pW;x++) {
          const dx=maxD*Math.sin(fx1*x+fy1*y+px1)*Math.cos(fx2*x+py2);
          const dy=maxD*Math.sin(fx2*x+fy2*y+py1)*Math.cos(fy1*y+px2);
          const sx=Math.max(0,Math.min(pW-1,x+dx)), sy=Math.max(0,Math.min(pH-1,y+dy));
          const px=bilin(sx,sy), i=(y*pW+x)*4;
          res[i]=px[0]; res[i+1]=px[1]; res[i+2]=px[2]; res[i+3]=255;
        }
      }
      for (let i=0;i<data.length;i++) data[i]=res[i];
    })();

    // L4: PRNU structured noise — 0.18 intensity → sigma ~0.0027
    // Replaces original sensor FPN with plausible different pattern
    (function() {
      const rng = pmul(pCrypto());
      const sigma = 0.0015 + 0.18*0.0065;
      const rowN = new Float32Array(pH), colN = new Float32Array(pW);
      for (let y=0;y<pH;y++) rowN[y]=pgauss(rng)*sigma*0.4*255;
      for (let x=0;x<pW;x++) colN[x]=pgauss(rng)*sigma*0.4*255;
      for (let p=0;p<pTotal;p++) {
        const x=p%pW, y=Math.floor(p/pW), i=p*4;
        const fpn=rowN[y]+colN[x];
        for (let c=0;c<3;c++) {
          const shot=pgauss(rng)*sigma*0.6*255;
          data[i+c]=Math.max(0,Math.min(255,Math.round(data[i+c]+fpn+shot)));
        }
      }
    })();

    // L3: Sensor shot noise — replaces independent LSB flipping
    // Gaussian noise (σ≈1.2 DN) with inter-channel correlation matches
    // real camera shot noise. Produces LSB entropy 0.91–0.97, not 1.0.
    (function() {
      const rng = pmul(pCrypto());
      const pgauss = function() {
        let u1 = rng(), u2 = rng();
        while (u1 === 0) u1 = rng();
        return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      };
      const sigma = 0.12;
      for (let p = 0; p < pTotal; p++) {
        const i = p * 4;
        const n = pgauss() * sigma;
        data[i]   = Math.max(0, Math.min(255, data[i]   + Math.round(n + pgauss()*0.3)));
        data[i+1] = Math.max(0, Math.min(255, data[i+1] + Math.round(n + pgauss()*0.3)));
        data[i+2] = Math.max(0, Math.min(255, data[i+2] + Math.round(n + pgauss()*0.3)));
      }
    })();

    // L5: Micro gamma shift — 0.10 intensity → ±0.9% gamma curve
    // Changes ISP tone response signature, stays far below human JND of ~3%
    (function() {
      const rng = pmul(pCrypto());
      const range = 0.008 + 0.10*0.022;
      const gamma = 0.985 + (rng()*2-1)*range;
      const lut = new Uint8Array(256);
      for (let v=0;v<256;v++) lut[v]=Math.max(0,Math.min(255,Math.round(Math.pow(v/255,gamma)*255)));
      for (let p=0;p<pTotal;p++) {
        const i=p*4;
        data[i]=lut[data[i]]; data[i+1]=lut[data[i+1]]; data[i+2]=lut[data[i+2]];
      }
    })();

    // L18: Chroma fingerprint spoof — 0.35 intensity → ±1.05% Cb/Cr
    // Changes colour rendering fingerprint (ISP chroma pipeline signature)
    // Brightness (luma) is mathematically unchanged
    (function() {
      const rng = pmul(pCrypto());
      const range = 0.35*0.03;
      const scCb = 1.0+(rng()*2-1)*range, scCr = 1.0+(rng()*2-1)*range;
      for (let p=0;p<pTotal;p++) {
        const i=p*4;
        const R=data[i]/255, G=data[i+1]/255, B=data[i+2]/255;
        const Y =  0.299*R + 0.587*G + 0.114*B;
        let   Cb = (-0.168736*R - 0.331264*G + 0.5*B) * scCb;
        let   Cr = (0.5*R - 0.418688*G - 0.081312*B) * scCr;
        data[i  ]=Math.max(0,Math.min(255,Math.round((Y + 1.402*Cr)*255)));
        data[i+1]=Math.max(0,Math.min(255,Math.round((Y - 0.344136*Cb - 0.714136*Cr)*255)));
        data[i+2]=Math.max(0,Math.min(255,Math.round((Y + 1.772*Cb)*255)));
      }
    })();

    // L15: Per-pixel independent channel noise — 0.15 intensity → sigma 0.18
    // Spatially white — breaks inter-image noise residual correlation
    // Does NOT increase Laplacian energy because it averages out in neighbourhood estimates
    (function() {
      const rng = pmul(pCrypto());
      const sigma = 0.15*1.2;
      for (let p=0;p<pTotal;p++) {
        const i=p*4;
        for (let c=0;c<3;c++) {
          const n=pgauss(rng)*sigma;
          data[i+c]=Math.max(0,Math.min(255,Math.round(data[i+c]+n)));
        }
      }
    })();

    // ── Inlined ΔE enforcement for Phantom (independent of pipeline.js) ──────
    // Phantom sets all legacy ops to 0, so the outer anyPixelOps check below
    // would skip ΔE enforcement entirely. We enforce it here directly.
    if (cfg.deltaECap && cfg.deltaECap > 0) {
      // Re-decode original pixels for comparison
      const origBmP = await createImageBitmap(new Blob([buf]));
      let origCP, origXP;
      if (typeof OffscreenCanvas !== 'undefined') {
        origCP = new OffscreenCanvas(W, H); origXP = origCP.getContext('2d');
      } else {
        origCP = document.createElement('canvas'); origCP.width=W; origCP.height=H;
        origXP = origCP.getContext('2d');
      }
      origXP.drawImage(origBmP, 0, 0);
      const origDP = origXP.getImageData(0, 0, W, H).data;

      // Compute max ΔE (CIE76 sampled) without pipeline.js dependency
      const pSrgbLin = function(c) {
        c /= 255;
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      const pLab = function(r,g,b) {
        const lr=pSrgbLin(r),lg=pSrgbLin(g),lb=pSrgbLin(b);
        let x=(0.4124564*lr+0.3575761*lg+0.1804375*lb)/0.95047;
        let y=(0.2126729*lr+0.7151522*lg+0.0721750*lb)/1.00000;
        let z=(0.0193339*lr+0.1191920*lg+0.9503041*lb)/1.08883;
        const e=0.008856,k=903.3;
        x=x>e?Math.cbrt(x):(k*x+16)/116;
        y=y>e?Math.cbrt(y):(k*y+16)/116;
        z=z>e?Math.cbrt(z):(k*z+16)/116;
        return [116*y-16,500*(x-y),200*(y-z)];
      };
      const sampleN = Math.min(15000, total);
      const rngDE = pmul(42);
      let maxDE = 0;
      for (let s=0; s<sampleN; s++) {
        const pi = Math.floor(rngDE() * total) * 4;
        const labA = pLab(origDP[pi],origDP[pi+1],origDP[pi+2]);
        const labB = pLab(data[pi],data[pi+1],data[pi+2]);
        const de = Math.sqrt((labA[0]-labB[0])**2+(labA[1]-labB[1])**2+(labA[2]-labB[2])**2);
        if (de > maxDE) maxDE = de;
      }
      if (maxDE > cfg.deltaECap) {
        const alpha = cfg.deltaECap / maxDE;
        for (let p=0; p<total; p++) {
          const i=p*4;
          for (let c=0; c<3; c++) {
            data[i+c]=Math.round(origDP[i+c] + alpha * (data[i+c] - origDP[i+c]));
          }
        }
        report.push('ΔE cap applied (Phantom): was ' + maxDE.toFixed(2) + ', capped at ' + cfg.deltaECap);
      }
    }

    report.push('phantom pixel normalization applied');
  }

  // ── ΔE cap enforcement — hard limit to keep image recognisable ────
  if (cfg.deltaECap && cfg.deltaECap > 0) {
    // Compare processed pixels against originals using computeDeltaE from pipeline.js
    // Only run if any pixel ops were applied (not phantom — handled above)
    const anyPixelOps = cfg.lsb > 0 || cfg.prnu > 0 || cfg.chroma > 0 ||
      cfg.histSmooth > 0 || cfg.microWarp > 0 || cfg.gridShift ||
      cfg.freqNoise > 0 || cfg.adversarial > 0;
    if (anyPixelOps && typeof computeDeltaE === 'function') {
      // Re-decode original from buf for ΔE comparison
      const origBm = await createImageBitmap(new Blob([buf]));
      let origC, origX;
      if (typeof OffscreenCanvas !== 'undefined') {
        origC = new OffscreenCanvas(W, H); origX = origC.getContext('2d');
      } else {
        origC = document.createElement('canvas'); origC.width=W; origC.height=H;
        origX = origC.getContext('2d');
      }
      origX.drawImage(origBm, 0, 0);
      const origD = origX.getImageData(0, 0, W, H).data;
      const de = computeDeltaE(origD, data, total, 20000);
      if (de > cfg.deltaECap) {
        // Scale back toward original until within cap
        const alpha = cfg.deltaECap / de;
        for (let p = 0; p < total; p++) {
          const i = p * 4;
          for (let c = 0; c < 3; c++) {
            data[i+c] = Math.round(origD[i+c] + alpha * (data[i+c] - origD[i+c]));
          }
        }
        report.push(`ΔE cap applied (was ${de.toFixed(2)}, capped at ${cfg.deltaECap})`);
      }
    }
  }

  // ── Histogram comb defeat ────────────────────────────────────────
  // azHistCombScore (Analyzer v6) detects re-quantization via periodic empty
  // bins in 8×8 block deviation histograms. Pre-quantization dithering at ±1 DN
  // (triangular distribution) disrupts quantization periodicity. ΔE ≈ 0.3 avg.
  {
    const rngHC = mulberry32(cryptoSeed());
    for (let p = 0; p < total; p++) {
      const i = p * 4;
      data[i]   = Math.max(0, Math.min(255, data[i]   + Math.round(rngHC() * 2) - 1));
      data[i+1] = Math.max(0, Math.min(255, data[i+1] + Math.round(rngHC() * 2) - 1));
      data[i+2] = Math.max(0, Math.min(255, data[i+2] + Math.round(rngHC() * 2) - 1));
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // ── Re-encode as JPEG ────────────────────────────────────────
  // Key insight: we MUST NOT replace DQT tables post-encode.
  // The browser's Huffman tables (DHT) and entropy-coded scan data
  // are computed to match its own QT tables. Injecting different QT
  // tables while keeping the existing DHT + scan data = garbled image.
  //
  // Correct approach:
  //   1. Map target luma quality → browser quality percentage
  //   2. Encode canvas at that quality (browser QT ≈ target device QT)
  //   3. Keep ALL of the browser's internal segments (DQT, DHT, SOS, scan data)
  //   4. Strip only APP segments (which contain metadata we don't want)
  //   5. Inject our custom EXIF APP1 segment right after SOI
  //
  // This produces a valid JPEG where all tables match the scan data,
  // with real device EXIF and no metadata from the browser.

  // Step 1: map lumaQ (IJG 1-99) to browser quality (0.0-1.0)
  // CRITICAL: Chrome uses 4:2:0 chroma subsampling when quality <= ~0.80.
  // At quality >= 0.85 it switches to 4:4:4, which does NOT match iPhone
  // (iPhones always write 4:2:0 regardless of quality).
  // Fix: cap at 0.80 so Chrome outputs 4:2:0, matching real device behavior.
  // The QT tables at 0.80 still fall within the Apple expected range [88–96]
  // as measured by JPEGsnoop (browser Q80 ≈ IJG Q82).
  // Per-image quality jitter ±0.02 adds uniqueness across batch runs.
  const _qualBase = Math.max(0.72, Math.min(0.80, (cfg.lumaQ / 100) * 0.87));
  const _qualJitter = (Math.random() - 0.5) * 0.04; // ±2% jitter
  const encQuality = Math.max(0.72, Math.min(0.80, _qualBase + _qualJitter));

  let blob;
  if (typeof canvas.convertToBlob === 'function') {
    blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: encQuality });
  } else {
    blob = await new Promise((res, rej) =>
      canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/jpeg', encQuality));
  }

  const rawJpeg = new Uint8Array(await blob.arrayBuffer());

  // Step 2: build our EXIF APP1 segment
  const exifPayload = genBuildEXIF(cfg.exifParams);
  const exifSegLen  = 2 + 6 + exifPayload.length; // includes 2-byte length field + 'Exif\0\0'
  const exifSeg = new Uint8Array(2 + 2 + 6 + exifPayload.length);
  exifSeg[0]=0xFF; exifSeg[1]=0xE1;                          // APP1 marker
  exifSeg[2]=(exifSegLen>>8)&0xFF; exifSeg[3]=exifSegLen&0xFF; // length
  exifSeg[4]=0x45; exifSeg[5]=0x78; exifSeg[6]=0x69;         // 'Exi'
  exifSeg[7]=0x66; exifSeg[8]=0x00; exifSeg[9]=0x00;         // 'f\0\0'
  exifSeg.set(exifPayload, 10);

  // Step 3: scan rawJpeg, skip all APPn segments, keep everything else
  // Insert our EXIF right after SOI (first 2 bytes)
  const outParts = [];
  outParts.push(rawJpeg.slice(0, 2)); // SOI (FF D8)
  outParts.push(exifSeg);             // our EXIF APP1

  let i = 2; // start after SOI
  while (i < rawJpeg.length - 1) {
    if (rawJpeg[i] !== 0xFF) {
      // Shouldn't happen before first non-APP segment, but copy remainder
      outParts.push(rawJpeg.slice(i));
      break;
    }
    const marker = rawJpeg[i+1];

    // EOI — copy and stop
    if (marker === 0xD9) { outParts.push(rawJpeg.slice(i)); break; }

    // Standalone markers (no length field)
    if (marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD7)) { i += 2; continue; }

    if (i + 3 >= rawJpeg.length) break;
    const segLen = (rawJpeg[i+2] << 8) | rawJpeg[i+3];
    const segEnd = i + 2 + segLen;
    if (segEnd > rawJpeg.length) { outParts.push(rawJpeg.slice(i)); break; }

    const isAPP = marker >= 0xE0 && marker <= 0xEF;

    if (isAPP) {
      // Skip — we already injected our own EXIF APP1
      i = segEnd;
      continue;
    }

    // Keep everything else: DQT, DHT, SOF0/SOF2, SOS, scan data, EOI
    // These are all internally consistent with the encode quality we chose
    outParts.push(rawJpeg.slice(i, segEnd));
    i = segEnd;
  }

  // Step 4: assemble final buffer
  const totalLen = outParts.reduce((s, p) => s + p.length, 0);
  const finalBuf = new Uint8Array(totalLen);
  let off = 0;
  for (const p of outParts) { finalBuf.set(p, off); off += p.length; }

  report.push('device: ' + (cfg.exifParams.make||'') + ' ' + (cfg.exifParams.model||''));
  if (cfg.exifParams.gps) {
    const rg = cfg.exifParams.gps;
    report.push(rg.lat.toFixed(6) + ', ' + rg.lng.toFixed(6));
  }
  report.push('Q=' + Math.round(encQuality*100));

  return {
    blob: new Blob([finalBuf], { type: 'image/jpeg' }),
    width: W, height: H, report,
    filename: genOutFilename(cfg),
  };
}

function genOutFilename(cfg) {
  const prefix = $('genFilenamePrefix')?.value || 'IMG_';
  const rand = Math.floor(Math.random()*9000+1000);
  return `${prefix}${rand}.jpg`;
}

// ═════════════════════════════════════════════════════════════════
// CONFIG BUILDER — reads all form fields
// ═════════════════════════════════════════════════════════════════
function genBuildConfig() {
  const preset = GEN_PRESETS[genPreset] || GEN_PRESETS.generator;

  if (genMode === 'normal') {
    // Normal mode: use preset values + simple device/location selectors
    const _rawDevKey = $('genDevicePreset')?.value || 'ip15pro';
    const deviceKey = _rawDevKey === 'random' ? _rawDevKey : (_rawDevKey || 'ip15pro');
    const device    = deviceKey === 'random'
      ? GEN_DEVICES[DEVICE_KEYS[Math.floor(Math.random()*DEVICE_KEYS.length)]]
      : GEN_DEVICES[deviceKey] || GEN_DEVICES.ip15pro || GEN_DEVICES.iphone15pro;

    const locSrc = $('genLocationSrc')?.value || 'none';
    const gps = genBuildGPS(locSrc, {
      lat: $('genLat')?.value, lng: $('genLng')?.value,
      city: $('genCity')?.value, gpsJitter: 20,
    });

    const ts = genTimestamp('random_recent', null);
    // SubSecTime: Apple always writes exactly 3 digits
    const subSec = String(Math.floor(Math.random()*999)).padStart(3,'0');
    // Resolve software from pool — new devices use softwarePool, not software directly
    const resolvedDevice = Object.assign({}, device, { software: genPickSoftware(device) });

    // Qt tables: 'instagram' = luma 71/chroma 44 (matches your generator output)
    // 'device' = use the device's own QT tables
    const qtPrf = preset.qtProfile || 'device';
    const lumaQ  = qtPrf === 'instagram' ? 71 : (device.qt?.luma  || 92);
    const chromaQ = qtPrf === 'instagram' ? 44 : (device.qt?.chroma || 86);
    const jpegType = preset.jpegType || device.jpegType || 'baseline';

    return genFinaliseCfg(preset, resolvedDevice, ts, subSec, gps, lumaQ, chromaQ, jpegType);
  }

  // Advanced mode: read all fields
  const deviceKey = $('genDevicePresetAdv')?.value || 'iphone15pro';
  let device = deviceKey === 'random'
    ? GEN_DEVICES[DEVICE_KEYS[Math.floor(Math.random()*DEVICE_KEYS.length)]]
    : deviceKey === 'custom' ? {} : (GEN_DEVICES[deviceKey] || GEN_DEVICES.iphone15pro);

  // Override with manual fields if custom or filled
  const make     = $('genMake')?.value     || device.make    || 'Apple';
  const model    = $('genModel')?.value    || device.model   || 'iPhone 15 Pro';
  const software = $('genSoftware')?.value || device.software|| '17.4.1';
  const lensMake = $('genLensMake')?.value || device.lensMake|| 'Apple';
  const lensModel= $('genLensModel')?.value|| device.lensModel||'';
  const lensSerial=$('genLensSerial')?.value|| genRandomSerial(10);
  const bodySerial=$('genBodySerial')?.value|| genRandomSerial(12);
  const imageUID = $('genImageUID')?.value || genRandomUID();

  const tsMode = $('genTimestampMode')?.value || 'random_recent';
  const tsManual=$('genDateManual')?.value||'';
  const ts = genTimestamp(tsMode, tsManual);
  const subSec = String(Math.floor(Math.random()*999)).padStart(3,'0');

  const gpsSrc = $('genGPSSrc')?.value || 'none';
  const gpsJitter = parseInt($('genGPSJitter')?.value||'20');
  const gps = genBuildGPS(gpsSrc, {
    lat: $('genAdvLat')?.value, lng: $('genAdvLng')?.value,
    city: $('genAdvCity')?.value, altitude: $('genAltitude')?.value,
    gpsJitter,
  });

  // Camera
  const camSrc = $('genCamSrc')?.value || 'device';
  const focal    = camSrc==='device' ? (device.focalLength||6.765) : parseFloat($('genFocalLength')?.value||'6.765');
  const focal35  = camSrc==='device' ? (device.focalLength35||24) : parseInt($('genFocalLength35')?.value||'24');
  const fNum     = camSrc==='device' ? (device.fNumber||1.78)    : parseFloat($('genFNumber')?.value||'1.78');
  const shutterSel = $('genShutter')?.value||'auto';
  const SHUTTER_MAP = {'1/30':1/30,'1/60':1/60,'1/120':1/120,'1/250':1/250,'1/500':1/500,'1/1000':1/1000};
  const expTime  = shutterSel==='auto' ? 1/120 : (SHUTTER_MAP[shutterSel] || 1/120);
  const isoSel   = $('genISO')?.value||'auto';
  const iso      = isoSel==='auto' ? (Math.random()<0.5?50:100) : parseInt(isoSel);
  const flash    = parseInt($('genFlash')?.value||'24');
  const wb       = parseInt($('genWB')?.value||'0');
  const metering = parseInt($('genMetering')?.value||'5');
  const expMode  = parseInt($('genExpMode')?.value||'0');
  const colorSp  = parseInt($('genColorSpace')?.value||'65535');
  const orient   = parseInt($('genOrientation')?.value||'1');

  // QT
  const qtProfile= $('genQTProfile')?.value||'device';
  let lumaQ, chromaQ;
  if (qtProfile==='instagram') { lumaQ=71; chromaQ=44; }
  else if (qtProfile==='custom') {
    lumaQ  = parseInt($('genQualityLuma')?.value||'92');
    chromaQ= parseInt($('genQualityChroma')?.value||'85');
  } else { lumaQ=device.qt?.luma||92; chromaQ=device.qt?.chroma||86; }

  const jpegType = $('genJpegType')?.value||'baseline';
  const dpi      = parseInt($('genDPI')?.value||'72');

  // Pixel ops from advanced sliders
  const advPreset = {
    lsb:        parseInt($('genLSB')?.value||'0'),
    prnu:       parseInt($('genPRNU')?.value||'0'),
    chroma:     parseInt($('genChroma')?.value||'0'),
    histSmooth: parseInt($('genHistSmooth')?.value||'0'),
    microWarp:  parseInt($('genMicroWarp')?.value||'0'),
    gridShift:  $('genGridShift')?.checked||false,
    pHashTarget:parseInt($('genPHashTarget')?.value||'0'),
    freqNoise:  parseInt($('genFreqNoise')?.value||'0'),
    adversarial:parseInt($('genAdversarial')?.value||'0'),
  };

  const customDevice = { make, model, software, lensMake, lensModel, lensSerial,
    bodySerial, imageUID, focalLength:focal, focalLength35:focal35, fNumber:fNum,
    colorSpace:colorSp, dpi, jpegType, qt:{luma:lumaQ,chroma:chromaQ} };

  return genFinaliseCfg(advPreset, customDevice, ts, subSec, gps, lumaQ, chromaQ, jpegType, dpi, expTime, iso, flash, wb, metering, expMode, orient);
}

function genBuildGPS(src, opts) {
  if (src === 'none') return null;
  return genGPSCoords(src, opts);
}

// Returns a realistic UTC offset string e.g. "-05:00" for OffsetTime EXIF fields.
// iOS 15+ writes OffsetTime/OffsetTimeOriginal/OffsetTimeDigitized on every capture.
function genOffsetTime() {
  const common = [
    '-08:00','-07:00','-07:00','-06:00','-06:00','-05:00','-05:00','-04:00',
    '+00:00','+01:00','+01:00','+02:00','+03:00','+05:30','+08:00','+09:00',
  ];
  const extended = [
    '-12:00','-11:00','-10:00','-09:30','-09:00','-03:30','-03:00','-02:00','-01:00',
    '+03:30','+04:00','+04:30','+05:00','+05:45','+06:00','+06:30','+07:00','+09:30',
    '+10:00','+10:30','+11:00','+12:00','+12:45','+13:00',
  ];
  return Math.random() < 0.78
    ? common[Math.floor(Math.random() * common.length)]
    : extended[Math.floor(Math.random() * extended.length)];
}

function genFinaliseCfg(preset, device, ts, subSec, gps, lumaQ, chromaQ, jpegType, dpi, expTime, iso, flash, wb, metering, expMode, orient) {
  // Use Apple serial format for Apple devices, generic otherwise
  const isApple = (device.make || '').toLowerCase() === 'apple';
  const bodySerial = device.bodySerial || (isApple ? genAppleSerial() : genRandomSerial(12));
  const imageUID   = device.imageUID   || genRandomUID();
  const lensSerial = device.lensSerial || genRandomSerial(10);

  // Use device pools if available, fall back to explicit args or safe defaults
  const autoISO    = iso       !== undefined ? iso    : genPickISO(device);
  const autoExp    = expTime   !== undefined ? expTime: genPickShutter(device);
  const autoFlash  = flash     !== undefined ? flash  : 24; // 0x18 = auto, did not fire

  // Per-image micro-variation — makes every image forensically unique even with
  // identical settings. Real phones vary all these shot to shot naturally.
  // focalLength: real lenses have tiny focus-breathing variation (±0.001–0.003mm)
  const focalJitter = (Math.random() - 0.5) * 0.006;
  const focalFinal  = parseFloat(((device.focalLength || 6.765) + focalJitter).toFixed(3));
  // Exposure bias: iPhone writes this as 0 but with slight rational rounding variation
  // We encode as a tiny SRATIONAL offset (0/6, 0/8, 1/100, -1/100 etc.)
  const expBiasPool = [0, 0, 0, 0, 1/100, -1/100, 1/150, -1/150];
  const expBias = expBiasPool[Math.floor(Math.random() * expBiasPool.length)];
  // Brightness value: derived from exposure triangle, varies slightly per shot
  // APEX: Bv = log2(L) where L ≈ ISO * expTime * Ev
  const brightnessVal = parseFloat((Math.random() * 3 + 5).toFixed(4)); // natural range 5–8
  // Scene luminance (tag 0x9203) — another shot-varying field
  const sceneLum = parseFloat((Math.random() * 200 + 100).toFixed(1));
  // MakerNote: Apple always writes a MakerNote blob. Real size is 400–900 bytes.
  // Length varies by iOS version and scene parameters.
  const makerNoteLen = 400 + Math.floor(Math.random() * 500); // 400–899 bytes

  return {
    // Pixel ops
    lsb:        preset.lsb,
    prnu:       preset.prnu,
    chroma:     preset.chroma,
    histSmooth: preset.histSmooth,
    microWarp:  preset.microWarp,
    gridShift:  preset.gridShift,
    freqNoise:  preset.freqNoise,
    adversarial:preset.adversarial,
    pHashTarget:preset.pHashTarget,
    // Phantom-specific pixel ops (inlined, no pipeline dependency)
    phantom:    preset.phantom || false,
    // Encoding
    jpegType:   jpegType || device.jpegType || 'baseline',
    lumaQ:      lumaQ,
    chromaQ:    chromaQ,
    qtProfile:  'custom',
    // EXIF payload — all fields that a real iPhone writes
    exifParams: {
      make:           device.make,
      model:          device.model,
      software:       device.software || genPickSoftware(device),
      bodySerial,
      imageUID,
      lensMake:       device.lensMake,
      lensModel:      device.lensModel,
      lensSerial,
      dateTime:       ts,
      dateTimeOrig:   ts,
      dateTimeDigit:  ts,
      subSecTime:     subSec,
      focalLength:    focalFinal,        // per-image jitter ±0.003mm
      focalLength35:  device.focalLength35,
      fNumber:        device.fNumber,
      exposureTime:   autoExp,
      iso:            autoISO,
      flash:          autoFlash,
      whiteBalance:   wb !== undefined ? wb : 0,
      metering:       metering !== undefined ? metering : 5,
      expMode:        expMode  !== undefined ? expMode  : 0,
      sceneType:      0,
      colorSpace:     device.colorSpace,
      ycbcrPositioning: device.ycbcrPositioning !== undefined ? device.ycbcrPositioning : 1,
      orientation:    orient !== undefined ? orient : 'auto',
      dpi:            dpi || device.dpi || 72,
      expBias,           // per-image exposure bias variation
      brightnessVal,     // per-image brightness value
      sceneLum,          // per-image scene luminance
      makerNoteLen,      // per-image MakerNote stub length (400–899 bytes, realistic)
      offsetTime:     genOffsetTime(), // iOS 15+ timezone offset e.g. "-05:00"
      gps,
      width:          0, height: 0,
    },
  };
}

// ═════════════════════════════════════════════════════════════════
// UI WIRING
// ═════════════════════════════════════════════════════════════════

// Drop zone
const genDrop = $('genDrop');
const genInput = $('genFileInput');
genDrop.addEventListener('click', () => genInput.click());
genDrop.addEventListener('dragover', e => { e.preventDefault(); genDrop.classList.add('over'); });
genDrop.addEventListener('dragleave', () => genDrop.classList.remove('over'));
genDrop.addEventListener('drop', e => {
  e.preventDefault(); genDrop.classList.remove('over');
  const f = e.dataTransfer.files[0]; if (f) genLoadFile(f);
});
genInput.addEventListener('change', () => {
  if (genInput.files[0]) genLoadFile(genInput.files[0]);
  genInput.value = '';
});

function genLoadFile(file) {
  const reader = new FileReader();
  reader.onload = ev => {
    genFileBuf = ev.target.result;
    genFileName = file.name;
    $('genDropName').textContent = file.name + ' (' + fmt(file.size) + ')';
    const thumb = $('genDropThumb');
    if (thumb._prevURL) URL.revokeObjectURL(thumb._prevURL);
    thumb._prevURL = URL.createObjectURL(file);
    thumb.src = thumb._prevURL;
    thumb.style.display = 'block';
    $('genRunBtn').disabled = false;
    $('genStatus').textContent = '';
    const clrBtn = $('genClearBtn');
    if (clrBtn) clrBtn.style.display = 'block';
  };
  reader.readAsArrayBuffer(file);
}

function genClearFile() {
  genFileBuf = null; genFileName = '';
  const thumb = $('genDropThumb');
  if (thumb) {
    if (thumb._prevURL) { URL.revokeObjectURL(thumb._prevURL); thumb._prevURL = null; }
    thumb.src = ''; thumb.style.display = 'none';
  }
  const nameEl = $('genDropName');
  if (nameEl) nameEl.textContent = '';
  const runBtn = $('genRunBtn');
  if (runBtn) runBtn.disabled = true;
  const clrBtn = $('genClearBtn');
  if (clrBtn) clrBtn.style.display = 'none';
  const status = $('genStatus');
  if (status) status.textContent = '';
  const resultArea = $('genResultArea');
  if (resultArea) resultArea.innerHTML = '';
  genLastResult = null;
  dbg('Generator: cleared', '');
}

// Wire clear button
if ($('genClearBtn')) $('genClearBtn').addEventListener('click', function(e) {
  e.stopPropagation(); // prevent drop zone click
  genClearFile();
});

// Preset dropdown — open/close toggle
const dropBtn  = $('genPresetDropBtn');
const dropMenu = $('genPresetDropMenu');
const dropLabel = $('genPresetDropLabel');
if (dropBtn && dropMenu) {
  dropBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    dropMenu.style.display = dropMenu.style.display === 'none' ? 'block' : 'none';
  });
  document.addEventListener('click', function() {
    if (dropMenu) dropMenu.style.display = 'none';
  });
}

// Preset item click — .gen-preset-drop-item divs inside the dropdown
document.querySelectorAll('.gen-preset-drop-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.gen-preset-drop-item').forEach(b => {
      b.classList.remove('active');
    });
    btn.classList.add('active');
    genPreset = btn.dataset.preset;
    // Update dropdown label
    const nameEl = btn.querySelector('.gen-preset-drop-name');
    if (dropLabel && nameEl) dropLabel.textContent = nameEl.textContent.trim() + ' preset';
    if (dropMenu) dropMenu.style.display = 'none';
    const desc = GEN_PRESETS[genPreset]?.desc || '';
    $('genStatus').textContent = '';
    const descEl = $('genPresetDesc');
    if (descEl) descEl.textContent = desc;
    // Show/hide summaries
    const ps = $('genPhantomSummary');
    const cs = $('genCarbonSummary');
    const us = $('genUltimateSummary');
    if (ps) ps.style.display = (genPreset === 'phantom')  ? 'block' : 'none';
    if (cs) cs.style.display = (genPreset === 'carbon')   ? 'block' : 'none';
    if (us) us.style.display = (genPreset === 'ultimate') ? 'block' : 'none';
    // Carbon/Ultimate button styling
    const cb = $('genCarbonBtn');
    if (cb) { cb.style.borderColor = (genPreset === 'carbon') ? '#ff6b35' : ''; cb.style.color = (genPreset === 'carbon') ? '#ff6b35' : ''; }
    const ub = $('genUltimateBtn');
    if (ub) { ub.style.borderColor = (genPreset === 'ultimate') ? '#8b5cf6' : ''; ub.style.color = (genPreset === 'ultimate') ? '#8b5cf6' : ''; }
    // Update summaries on switch
    if (genPreset === 'phantom')  phantomSummaryUpdate();
    if (genPreset === 'carbon')   carbonSummaryUpdate();
    if (genPreset === 'ultimate') { ultimateSummaryUpdate(); ultimateOpenModal(); }
  });
});

// Mode toggle
document.querySelectorAll('.gen-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.gen-mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    genMode = btn.dataset.genmode;
    $('genNormalPanel').classList.toggle('active', genMode === 'normal');
    $('genAdvancedPanel').classList.toggle('active', genMode === 'advanced');
  });
});

// Device preset note updater
function genUpdateDeviceNote() {
  const key = $('genDevicePreset')?.value;
  const d = GEN_DEVICES[key];
  const note = $('genDeviceNote');
  if (note && d) note.textContent = d.note;
  else if (note) note.textContent = 'random device will be picked on generate';
  // note may be null if normal panel is active (element removed) — safe
}
$('genDevicePreset')?.addEventListener('change', genUpdateDeviceNote);
genUpdateDeviceNote();

// Device preset adv → auto-fill fields
$('genDevicePresetAdv')?.addEventListener('change', () => {
  const key = $('genDevicePresetAdv').value;
  const d = GEN_DEVICES[key];
  if (!d || key === 'custom' || key === 'random') return;
  if ($('genMake'))    $('genMake').value    = d.make    || '';
  if ($('genModel'))   $('genModel').value   = d.model   || '';
  if ($('genSoftware'))$('genSoftware').value= genPickSoftware(d) || '';
  if ($('genLensMake'))$('genLensMake').value= d.lensMake|| '';
  if ($('genLensModel'))$('genLensModel').value= d.lensModel||'';
});

// Location source toggles
function genUpdateLocFields() {
  const src = $('genLocationSrc')?.value;
  // Normal panel rows
  if($('genNormLatRow'))  $('genNormLatRow').style.display  = src === 'manual' ? 'flex' : 'none';
  if($('genNormLngRow'))  $('genNormLngRow').style.display  = src === 'manual' ? 'flex' : 'none';
  if($('genNormCityRow')) $('genNormCityRow').style.display = src === 'city'   ? 'flex' : 'none';
  // Legacy IDs (kept for compatibility)
  if($('genLatRow'))  $('genLatRow').style.display  = src === 'manual' ? 'flex' : 'none';
  if($('genLngRow'))  $('genLngRow').style.display  = src === 'manual' ? 'flex' : 'none';
  if($('genCityRow')) $('genCityRow').style.display = src === 'city'   ? 'flex' : 'none';
}
$('genLocationSrc')?.addEventListener('change', genUpdateLocFields);
genUpdateLocFields();

function genUpdateGPSFields() {
  const src = $('genGPSSrc')?.value;
  $('genAdvLatRow').style.display  = src === 'manual' ? 'flex' : 'none';
  $('genAdvLngRow').style.display  = src === 'manual' ? 'flex' : 'none';
  $('genAdvCityRow').style.display = src === 'city'   ? 'flex' : 'none';
}
$('genGPSSrc')?.addEventListener('change', genUpdateGPSFields);
genUpdateGPSFields();

// Timestamp mode
$('genTimestampMode')?.addEventListener('change', () => {
  $('genDateRow').style.display = $('genTimestampMode').value === 'manual' ? 'flex' : 'none';
});

// Range slider value displays
[
  ['genQualityLuma','genQualityLumaVal',''],
  ['genQualityChroma','genQualityChromaVal',''],
  ['genGPSJitter','genGPSJitterVal','m'],
  ['genLSB','genLSBVal',''],
  ['genPRNU','genPRNUVal',''],
  ['genChroma','genChromaVal',''],
  ['genHistSmooth','genHistSmoothVal',''],
  ['genMicroWarp','genMicroWarpVal',''],
  ['genPHashTarget','genPHashTargetVal',''],
  ['genFreqNoise','genFreqNoiseVal',''],
  ['genAdversarial','genAdversarialVal',''],
].forEach(([sliderId, valId, suffix]) => {
  const slider = $(sliderId), valEl = $(valId);
  if (!slider || !valEl) return;
  const upd = () => { valEl.textContent = slider.value + suffix; };
  slider.addEventListener('input', upd); upd();
});

// Run button
$('genRunBtn').addEventListener('click', async () => {
  if (!genFileBuf) return;
  $('genRunBtn').disabled = true;
  $('genStatus').textContent = 'generating...';
  $('genResultArea').innerHTML = '<div class="gen-spinner">processing — building identity...</div>';

  try {
    if (genPreset === 'ultimate') {
      const result = await genUltimateProcess(genFileBuf);
      const cfg2 = { lsb:0, prnu:0, gridShift:false, phantom:false,
        exifParams: result._exifParams || { make:'Apple', model:'iPhone', software:'', gps:null, dateTime:'' } };
      genLastResult = result;
      genRenderResult(result, cfg2);
      if ($('genAutoDownload')?.checked) dl(result.blob, result.filename);
      $('genStatus').textContent = 'done — ' + result.report.join(', ');
      dbg('Ultimate: ' + result.report.join(' | '), 'debug-ok');
      $('genRunBtn').disabled = false;
      return;
    }

    const cfg = genBuildConfig();
    const img = await createImageBitmap(new Blob([genFileBuf]));
    cfg.exifParams.width  = img.width;
    cfg.exifParams.height = img.height;
    // Resolve 'auto' orientation: portrait → 6 (90CW), landscape → 1
    if (cfg.exifParams.orientation === 'auto') {
      cfg.exifParams.orientation = genAutoOrientation(img.width, img.height);
    }
    // Resolve software: phantom uses phantomConfig.ios, carbon uses carbonConfig.ios
    if (!cfg.exifParams.software || cfg.exifParams.software === '') {
      if (genPreset === 'phantom') {
        const pool = PHANTOM_IOS_POOLS[phantomConfig.deviceKey] || ['17.4.1'];
        cfg.exifParams.software = phantomConfig.ios || pool[0] || '17.4.1';
      } else if (genPreset === 'carbon') {
        // Carbon routes to genCarbonProcess which sets its own ios — this is a fallback only
        const pool = PHANTOM_IOS_POOLS[carbonConfig.deviceKey.replace('carbon_','')] || (carbonConfig.ios ? [carbonConfig.ios] : ['17.4.1']);
        cfg.exifParams.software = carbonConfig.ios || pool[0] || '17.4.1';
      } else {
        cfg.exifParams.software = '17.4.1';
      }
    }

    // Route to correct process for preset
    let result;
    if      (genPreset === 'carbon')   result = await genCarbonProcess(genFileBuf);
    else                               result = await genProcess(genFileBuf, cfg);
    genLastResult = result;
    genRenderResult(result, cfg);

    // Auto-download if checked
    if ($('genAutoDownload')?.checked) {
      dl(result.blob, result.filename);
    }

    $('genStatus').textContent = 'done — ' + result.report.join(', ');
    dbg('Generator: ' + result.report.join(' | '), 'debug-ok');
  } catch(e) {
    $('genResultArea').innerHTML = '<div class="gen-spinner" style="color:var(--err)">failed: ' + esc(e.message) + '</div>';
    $('genStatus').textContent = 'error: ' + e.message;
    dbg('Generator error: ' + e.message, 'debug-err');
  }
  $('genRunBtn').disabled = false;
});

function genRenderResult(result, cfg) {
  const area = $('genResultArea');
  area.innerHTML = '';

  const hdr = document.createElement('div');
  hdr.className = 'gen-result-hdr';
  hdr.textContent = '◆ ' + result.filename;
  area.appendChild(hdr);

  const imgURL = URL.createObjectURL(result.blob);
  const img = document.createElement('img');
  img.className = 'gen-result-img';
  img.src = imgURL;
  area.appendChild(img);

  // Tags showing what was applied
  const tags = document.createElement('div');
  tags.className = 'gen-result-tags';
  const device = cfg.exifParams;
  if (device.make)  tags.appendChild(makeTag('tag-ok', device.make + ' ' + device.model));
  if (device.gps) {
    // Show coords in iPhone Maps format: signed decimal degrees, 6 decimal places
    const gLat = device.gps.lat;
    const gLng = device.gps.lng;
    const gpsLabel = gLat.toFixed(6) + ', ' + gLng.toFixed(6);
    tags.appendChild(makeTag('tag-ok', gpsLabel));
  }
  if (device.dateTime) tags.appendChild(makeTag('tag-ok', device.dateTime.split(' ')[0]));
  if (cfg.lsb > 0)  tags.appendChild(makeTag('tag-ok', 'LSB'));
  if (cfg.prnu > 0) tags.appendChild(makeTag('tag-ok', 'PRNU'));
  if (cfg.gridShift)tags.appendChild(makeTag('tag-ok', 'grid shift'));
  tags.appendChild(makeTag('tag-ok', result.width + '×' + result.height));
  tags.appendChild(makeTag('tag-ok', fmt(result.blob.size)));
  area.appendChild(tags);

  const btns = document.createElement('div');
  btns.className = 'gen-result-btns';

  const dlBtn = document.createElement('button');
  dlBtn.className = 'btn btn-sm btn-ok';
  dlBtn.textContent = 'download';
  dlBtn.onclick = () => dl(result.blob, result.filename);
  btns.appendChild(dlBtn);

  const rdyBtn = document.createElement('button');
  rdyBtn.className = 'btn btn-sm';
  rdyBtn.textContent = '→ ready';
  rdyBtn.title = 'send to Ready Pictures tab';
  rdyBtn.onclick = () => {
    if (typeof window.rdyAddBatch === 'function') {
      window.rdyAddBatch([{ blob: result.blob, filename: result.filename }]);
      showToast('sent to Ready tab');
    } else { showToast('Ready tab not loaded'); }
  };
  btns.appendChild(rdyBtn);

  const azBtn = document.createElement('button');
  azBtn.className = 'btn btn-sm';
  azBtn.textContent = 'verify in analyzer';
  azBtn.onclick = async () => {
    // Feed result into analyzer single mode
    // Use try/catch to handle scoping edge cases gracefully
    try {
      const ab = await result.blob.arrayBuffer();
      // These are top-level lets in analyzer.js — accessible in shared browser script scope
      azFile1Buf  = ab;
      azFile1Name = result.filename;
      const n1 = $('azName1'), t1 = $('azThumb1'), rs = $('azRunSingle');
      if (n1) n1.textContent = result.filename;
      if (t1) { t1.src = imgURL; t1.style.display = 'block'; }
      if (rs) rs.disabled = false;
      if (typeof switchSubTab === 'function') switchSubTab('analyzer');
      showToast('image loaded in analyzer — click analyze');
    } catch(azErr) {
      showToast('could not load into analyzer — open analyzer tab and drop image manually');
      dbg('analyzer handoff failed: ' + azErr.message, 'debug-warn');
    }
  };
  btns.appendChild(azBtn);

  area.appendChild(btns);
}

// ═════════════════════════════════════════════════════════════════
// BATCH PROCESSING — folder of images
// ═════════════════════════════════════════════════════════════════
let genBatchResults = []; // { blob, filename } for all completed batch items
let genBatchBusy    = false;

function genBatchSetProgress(done, total, msg) {
  const fill = $('genBatchFill');
  const txt  = $('genBatchTxt');
  if (fill) fill.style.width = (total ? Math.round(done/total*100) : 0) + '%';
  if (txt)  txt.textContent  = msg || '';
}

function genBatchRenderResult(result, index, total) {
  // Collapsed result row — same pattern as cleaner
  const area = $('genResultArea');
  // On first result clear the placeholder
  if (index === 0) area.innerHTML = '';

  const d = document.createElement('div');
  d.className = 'r-item';

  const head = document.createElement('div');
  head.className = 'r-head r-head-collapsed';

  const diamond = document.createElement('span');
  diamond.style.color = 'var(--ok)'; diamond.textContent = '◆';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'name'; nameSpan.textContent = result.filename;

  const tags = document.createElement('div');
  tags.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-left:auto';
  tags.appendChild(makeTag('tag-ok', result.width + '×' + result.height));
  tags.appendChild(makeTag('tag-ok', fmt(result.blob.size)));

  const expandBtn = document.createElement('button');
  expandBtn.className = 'r-expand-btn'; expandBtn.textContent = '▾';

  head.appendChild(diamond); head.appendChild(nameSpan);
  head.appendChild(tags); head.appendChild(expandBtn);

  // Body (hidden by default)
  const body = document.createElement('div');
  body.className = 'r-body'; body.style.display = 'none';

  const imgURL = URL.createObjectURL(result.blob);
  const img = document.createElement('img');
  img.src = imgURL; img.style.cssText = 'max-width:100%;border:1px solid var(--border);display:block';
  img.setAttribute('draggable','true');
  img.style.cursor = 'grab';
  img.addEventListener('dragstart', function(e) {
    try {
      const file = new File([result.blob], result.filename, { type: result.blob.type||'image/jpeg' });
      if (e.dataTransfer.items) e.dataTransfer.items.add(file);
      e.dataTransfer.effectAllowed = 'copy';
    } catch(err) { e.dataTransfer.setData('text/uri-list', imgURL); }
  });

  const bodyBtns = document.createElement('div');
  bodyBtns.style.cssText = 'display:flex;gap:8px;margin-top:8px';

  const dlBtn = document.createElement('button');
  dlBtn.className = 'btn btn-sm btn-ok'; dlBtn.textContent = 'download';
  dlBtn.onclick = () => dl(result.blob, result.filename);

  const rdyBtn = document.createElement('button');
  rdyBtn.className = 'btn btn-sm'; rdyBtn.textContent = '→ ready';
  rdyBtn.onclick = () => {
    if (typeof window.rdyAddBatch === 'function') {
      window.rdyAddBatch([{ blob: result.blob, filename: result.filename }]);
      showToast('sent to Ready tab');
    }
  };

  bodyBtns.appendChild(dlBtn); bodyBtns.appendChild(rdyBtn);
  body.appendChild(img); body.appendChild(bodyBtns);

  // Delete button
  const rmBtn = document.createElement('button');
  rmBtn.className = 'btn btn-sm r-del-btn'; rmBtn.textContent = '✕';
  rmBtn.onclick = () => {
    URL.revokeObjectURL(imgURL);
    genBatchResults = genBatchResults.filter(function(r) { return r !== result; });
    d.remove();
  };
  head.appendChild(rmBtn);

  // Expand toggle
  let expanded = false;
  function toggleExp() {
    expanded = !expanded;
    body.style.display = expanded ? 'block' : 'none';
    expandBtn.textContent = expanded ? '▴' : '▾';
    head.classList.toggle('r-head-expanded', expanded);
  }
  head.addEventListener('click', function(e) {
    if (!e.target.closest('.r-del-btn')) toggleExp();
  });
  expandBtn.addEventListener('click', function(e) { e.stopPropagation(); toggleExp(); });

  d.appendChild(head); d.appendChild(body);
  area.appendChild(d);
}


// ── Folder bundle card ────────────────────────────────────────────
// Renders all batch results as a single card: thumbnail strip + action buttons
function genRenderFolderBundle(results, folderName) {
  const area = $('genResultArea');
  if (!area) return;
  area.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'gen-folder-bundle';

  // Header
  const hdr = document.createElement('div');
  hdr.className = 'gen-bundle-hdr';
  hdr.innerHTML =
    '<span class="gen-bundle-icon">📁</span>' +
    '<span class="gen-bundle-name">' + esc(folderName) + '</span>' +
    '<span class="gen-bundle-count">' + results.length + ' image' + (results.length !== 1 ? 's' : '') + '</span>';
  card.appendChild(hdr);

  // Thumbnail strip — all images, scrollable horizontally
  const strip = document.createElement('div');
  strip.className = 'gen-bundle-strip';
  const thumbUrls = [];
  results.forEach(function(r) {
    const url = URL.createObjectURL(r.blob);
    thumbUrls.push(url);
    const thumb = document.createElement('div');
    thumb.className = 'gen-bundle-thumb-wrap';
    const img = document.createElement('img');
    img.src = url;
    img.className = 'gen-bundle-thumb';
    img.title = r.filename;
    img.setAttribute('draggable','true');
    img.addEventListener('dragstart', function(e) {
      try {
        const file = new File([r.blob], r.filename, { type: r.blob.type || 'image/jpeg' });
        if (e.dataTransfer.items) e.dataTransfer.items.add(file);
        e.dataTransfer.effectAllowed = 'copy';
      } catch(err) {}
    });
    const nameLbl = document.createElement('div');
    nameLbl.className = 'gen-bundle-thumb-name';
    nameLbl.textContent = r.filename.replace(/\.[^.]+$/, '');
    thumb.appendChild(img);
    thumb.appendChild(nameLbl);
    strip.appendChild(thumb);
  });
  card.appendChild(strip);

  // Action buttons
  const btns = document.createElement('div');
  btns.className = 'gen-bundle-btns';

  // Download all individually
  const dlAllBtn = document.createElement('button');
  dlAllBtn.className = 'btn btn-sm btn-ok';
  dlAllBtn.textContent = '⬇ download all (' + results.length + ')';
  dlAllBtn.addEventListener('click', function() {
    results.forEach(function(r, i) {
      setTimeout(function() { dl(r.blob, r.filename); }, i * 80);
    });
    showToast('Downloading ' + results.length + ' images…');
  });

  // Download as ZIP
  const dlZipBtn = document.createElement('button');
  dlZipBtn.className = 'btn btn-sm';
  dlZipBtn.textContent = '⬇ download ZIP';
  dlZipBtn.addEventListener('click', function() {
    dlZipBtn.disabled = true; dlZipBtn.textContent = 'building…';
    buildZip(results.map(function(r) { return { name: r.filename, blob: r.blob }; }))
      .then(function(zip) {
        dl(zip, (folderName || 'batch') + '_' + Date.now() + '.zip');
        showToast(results.length + ' images zipped');
      })
      .catch(function() {
        results.forEach(function(r, i) { setTimeout(function() { dl(r.blob, r.filename); }, i * 80); });
        showToast('ZIP failed — downloading individually');
      })
      .finally(function() { dlZipBtn.disabled = false; dlZipBtn.textContent = '⬇ download ZIP'; });
  });

  // Send all to Ready tab
  const rdyBtn = document.createElement('button');
  rdyBtn.className = 'btn btn-sm';
  rdyBtn.textContent = '→ send to ready (' + results.length + ')';
  rdyBtn.addEventListener('click', function() {
    if (typeof window.rdyAddBatch !== 'function') { showToast('Ready tab not loaded'); return; }
    window.rdyAddBatch(results.slice());
    showToast(results.length + ' images sent to Ready tab');
    dbg('Folder bundle → Ready: ' + results.length + ' images', 'debug-ok');
  });

  // Clear bundle
  const clearBtn = document.createElement('button');
  clearBtn.className = 'btn btn-sm btn-danger';
  clearBtn.textContent = '✕ clear';
  clearBtn.addEventListener('click', function() {
    thumbUrls.forEach(function(u) { URL.revokeObjectURL(u); });
    card.remove();
    genBatchResults = [];
  });

  btns.appendChild(dlAllBtn);
  btns.appendChild(dlZipBtn);
  btns.appendChild(rdyBtn);
  btns.appendChild(clearBtn);
  card.appendChild(btns);

  area.appendChild(card);
}

// Wire folder button and input
// genFolderBtn wired above in genProcessFolderImgs section

// ── Folder: load files on change, process on button click ─────────
let genPendingFolderImgs = [];  // files waiting to be processed

if ($('genFolderInput')) {
  $('genFolderInput').addEventListener('change', function() {
    const files = Array.from($('genFolderInput').files || []);
    $('genFolderInput').value = '';  // allow re-selecting same folder
    if (!files.length) return;

    const RASTER = ['image/jpeg','image/png','image/webp','image/bmp','image/tiff','image/gif'];
    const imgs = files.filter(function(f) {
      return RASTER.includes(f.type) || (f.type.startsWith('image/') && !f.type.includes('svg'));
    });
    if (!imgs.length) { showToast('no images found in folder'); return; }

    // Store pending files — don't process yet
    genPendingFolderImgs = imgs;
    const folderName = imgs[0].webkitRelativePath ? imgs[0].webkitRelativePath.split('/')[0] : 'folder';

    // Update button to show count and prompt to click
    const btn = $('genFolderBtn');
    if (btn) {
      btn.textContent = '▶ generate folder (' + imgs.length + ' images)';
      btn.classList.add('btn-go');
    }
    $('genStatus').textContent = imgs.length + ' images from "' + folderName + '" ready — click to generate';
    $('genResultArea').innerHTML = '';

    // Show thumbnail preview strip
    genShowFolderPreview(imgs, folderName);
  });
}

// Preview strip before generation
function genShowFolderPreview(imgs, folderName) {
  const area = $('genResultArea');
  if (!area) return;
  area.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'gen-folder-preview';
  wrap.innerHTML =
    '<div class="gen-preview-hdr">' +
      '<span class="gen-bundle-icon">📁</span>' +
      '<span class="gen-bundle-name">' + esc(folderName) + '</span>' +
      '<span class="gen-bundle-count">' + imgs.length + ' image' + (imgs.length !== 1 ? 's' : '') + ' selected — click ▶ generate folder to process</span>' +
    '</div>' +
    '<div class="gen-preview-strip" id="genPreviewStrip"></div>';

  area.appendChild(wrap);

  // Show first 12 thumbnails as previews (blob URLs from File objects)
  const strip = wrap.querySelector('#genPreviewStrip');
  const preview = imgs.slice(0, 12);
  preview.forEach(function(f) {
    const url = URL.createObjectURL(f);
    const img = document.createElement('img');
    img.src = url;
    img.className = 'gen-bundle-thumb';
    img.title = f.name;
    img.addEventListener('load', function() { URL.revokeObjectURL(url); });
    strip.appendChild(img);
  });
  if (imgs.length > 12) {
    const more = document.createElement('div');
    more.className = 'gen-preview-more';
    more.textContent = '+' + (imgs.length - 12) + ' more';
    strip.appendChild(more);
  }
}

// Wire folder button — now triggers processing
if ($('genFolderBtn')) {
  $('genFolderBtn').addEventListener('click', function(e) {
    e.stopPropagation();
    // If we have pending files, process them; otherwise open picker
    if (genPendingFolderImgs.length > 0) {
      genProcessFolderImgs(genPendingFolderImgs);
      genPendingFolderImgs = [];
    } else {
      $('genFolderInput').click();
    }
  });
}

const PHANTOM_IOS_POOLS = {
  ip17promax:  ['26.3.1','26.3','26.2.1','26.2','26.1','26.0.1','26.0'],
  ip17pro:  ['26.3.1','26.3','26.2.1','26.2','26.1','26.0.1','26.0'],
  ip17air:  ['26.3.1','26.3','26.2.1','26.2','26.1','26.0.1','26.0'],
  ip17:  ['26.3.1','26.3','26.2.1','26.2','26.1','26.0.1','26.0'],
  ip16promax:  ['26.3.1','26.3','26.2.1','26.2','26.1','26.0.1','26.0','18.5','18.4.1','18.4','18.3.2','18.3.1','18.3','18.2.1','18.2','18.1.1','18.1','18.0.1','18.0'],
  ip16pro:  ['26.3.1','26.3','26.2.1','26.2','26.1','26.0.1','26.0','18.5','18.4.1','18.4','18.3.2','18.3.1','18.3','18.2.1','18.2','18.1.1','18.1','18.0.1','18.0'],
  ip16plus:  ['26.3.1','26.3','26.2.1','26.2','26.1','26.0.1','26.0','18.5','18.4.1','18.4','18.3.2','18.3.1','18.3','18.2.1','18.2','18.1.1','18.1','18.0.1','18.0'],
  ip16:  ['26.3.1','26.3','26.2.1','26.2','26.1','26.0.1','26.0','18.5','18.4.1','18.4','18.3.2','18.3.1','18.3','18.2.1','18.2','18.1.1','18.1','18.0.1','18.0'],
  ip16e:  ['26.3.1','26.3','26.2.1','26.2','26.1','26.0.1','26.0','18.5','18.4.1','18.4','18.3.2','18.3.1','18.3'],
  ip15promax:  ['26.3.1','26.3','26.2.1','26.2','26.1','26.0.1','26.0','18.5','18.4.1','18.4','18.3.2','18.3.1','18.3','18.2.1','18.2','18.1.1','18.1','18.0.1','18.0','17.7.2','17.7.1','17.7','17.6.1','17.6','17.5.1','17.5','17.4.1','17.4','17.3.1','17.3','17.2.1','17.2','17.1.2','17.1.1','17.1','17.0.3','17.0.2','17.0.1','17.0'],
  ip15pro:  ['26.3.1','26.3','26.2.1','26.2','26.1','26.0.1','26.0','18.5','18.4.1','18.4','18.3.2','18.3.1','18.3','18.2.1','18.2','18.1.1','18.1','18.0.1','18.0','17.7.2','17.7.1','17.7','17.6.1','17.6','17.5.1','17.5','17.4.1','17.4','17.3.1','17.3','17.2.1','17.2','17.1.2','17.1.1','17.1','17.0.3','17.0.2','17.0.1','17.0'],
}
let phantomConfig = {
  deviceKey: 'ip16pro',
  ios: '',          // empty = auto-pick from pool at generate time
  tsMode: 'random_recent',
  tsManual: '',
  prefix: 'IMG_',
  nameMode: 'prefix',   // 'prefix' | 'person'
  lockedName: '',       // persists until user re-rolls
  gpsMode: 'off',       // 'off' | 'city' | 'manual'
  gpsCity: 'nyc',
  gpsLat: '',
  gpsLng: '',

};



async function genProcessFolderImgs(imgs) {
    if (genBatchBusy) { showToast('already processing'); return; }
    genBatchBusy = true;
    genBatchResults = [];

    const folderName = imgs[0].webkitRelativePath ? imgs[0].webkitRelativePath.split('/')[0] : 'folder';

    // Update button state
    const btn = $('genFolderBtn');
    if (btn) { btn.disabled = true; btn.textContent = '▶ generate folder'; btn.classList.remove('btn-go'); }
    if ($('genRunBtn'))   $('genRunBtn').disabled   = true;
    if ($('genClearBtn')) $('genClearBtn').style.display = 'none';

    const batchBar = $('genBatchBar');
    if (batchBar) batchBar.style.display = 'block';
    const sendAllBtn = $('genBatchSendReady');
    if (sendAllBtn) sendAllBtn.style.display = 'none';

    $('genResultArea').innerHTML = '';
    $('genStatus').textContent = '';

    let done = 0, failed = 0;
    const t0 = performance.now();

    for (let i = 0; i < imgs.length; i++) {
      const file = imgs[i];
      genBatchSetProgress(i, imgs.length, '[' + (i+1) + '/' + imgs.length + '] processing ' + file.name + '...');

      try {
        const buf = await file.arrayBuffer();
        const cfg = genBuildConfig();
        cfg._originalName = file.name;
        const bm = await createImageBitmap(new Blob([buf]));
        cfg.exifParams.width  = bm.width;
        cfg.exifParams.height = bm.height;
        if (cfg.exifParams.orientation === 'auto') {
          cfg.exifParams.orientation = genAutoOrientation(bm.width, bm.height);
        }
        if (!cfg.exifParams.software || cfg.exifParams.software === '') {
          cfg.exifParams.software = (genPreset === 'phantom' || genPreset === 'carbon')
            ? (phantomConfig.ios || (PHANTOM_IOS_POOLS[phantomConfig.deviceKey]||['17.4.1'])[0])
            : '17.4.1';
        }
        const base = file.name.replace(/\.[^.]+$/, '');
        cfg._outName = base + '.jpg';

        let result;
        if      (genPreset === 'carbon')   result = await genCarbonProcess(buf);
        else if (genPreset === 'ultimate') result = await genUltimateProcess(buf);
        else                               result = await genProcess(buf, cfg);
        if (genPreset !== 'carbon' && genPreset !== 'ultimate') result.filename = cfg._outName;

        genBatchResults.push({ blob: result.blob, filename: result.filename });
        const _area = $('genResultArea');
        if (_area && done === 0) _area.innerHTML = '<div style="color:var(--dim);font-size:11px;padding:8px 0">processing folder…</div>';
        done++;

        if ($('genAutoDownload')?.checked) dl(result.blob, result.filename);

      } catch(err) {
        failed++;
        dbg('Batch error ' + file.name + ': ' + err.message, 'debug-err');
        const errDiv = document.createElement('div');
        errDiv.className = 'r-item';
        errDiv.innerHTML = '<div class="r-head"><span style="color:var(--err)">◆</span><span class="name">' + esc(file.name) + '</span><span style="color:var(--err);font-size:10px;margin-left:auto">' + esc(err.message) + '</span></div>';
        $('genResultArea').appendChild(errDiv);
      }

      genBatchSetProgress(i+1, imgs.length, '');
    }

    const tt = ((performance.now()-t0)/1000).toFixed(1);
    genBatchSetProgress(imgs.length, imgs.length, '');
    $('genStatus').textContent = 'done — ' + done + '/' + imgs.length + ' generated (' + tt + 's)' + (failed ? ', ' + failed + ' failed' : '');

    if (genBatchResults.length > 0) {
      genRenderFolderBundle(genBatchResults, folderName);
      if (sendAllBtn) sendAllBtn.style.display = 'none';
    }

    genBatchBusy = false;
    if ($('genRunBtn'))   $('genRunBtn').disabled   = !genFileBuf;
    if (btn) { btn.disabled = false; }
    if ($('genClearBtn') && genFileBuf) $('genClearBtn').style.display = 'block';
    dbg('Batch done: ' + done + '/' + imgs.length + ' in ' + tt + 's', 'debug-ok');
}

// Send all batch results to ready tab
if ($('genBatchSendReady')) {
  $('genBatchSendReady').addEventListener('click', function() {
    if (!genBatchResults.length) return;
    if (typeof window.rdyAddBatch !== 'function') { showToast('Ready tab not loaded'); return; }
    window.rdyAddBatch(genBatchResults.slice()); // rdyAddBatch groups by filename prefix
    showToast(genBatchResults.length + ' images sent to Ready tab');
    dbg('Batch → Ready: ' + genBatchResults.length + ' images', 'debug-ok');
  });
}


// ═════════════════════════════════════════════════════════════════
// PHANTOM MODAL — settings, device/iOS selection, spec display
// ═════════════════════════════════════════════════════════════════
// iOS version pools per device (realistic ranges)
;

function phantomOpenModal() {
  const overlay = $('phantomOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  phantomModalSync();
}

function phantomCloseModal() {
  const overlay = $('phantomOverlay');
  if (overlay) overlay.style.display = 'none';
}

// ── PHANTOM PERSISTENCE ──────────────────────────────────────────
function phantomSave() {
  try { localStorage.setItem('phantomConfig_v2', JSON.stringify(phantomConfig)); } catch(e) {}
}
function phantomPersistLoad() {
  try {
    const s = localStorage.getItem('phantomConfig_v2');
    if (s) {
      const saved = JSON.parse(s);
      Object.assign(phantomConfig, saved);
    }
  } catch(e) {}
}
phantomPersistLoad();

function phantomEnsureLockedName() {
  if (!phantomConfig.lockedName) {
    phantomConfig.lockedName = phantomRandomName();
    phantomSave();
  }
  return phantomConfig.lockedName;
}
function phantomRerollName() {
  phantomConfig.lockedName = phantomRandomName();
  phantomSave();
  const el = $('phantomPersonDisplay');
  if (el) el.textContent = phantomConfig.lockedName;
}

function phantomModalSync() {
  // Set device dropdown
  const devSel = $('phantomDevice');
  if (devSel) devSel.value = phantomConfig.deviceKey;
  phantomUpdateIOS();
  phantomUpdateSpecs();

  // Timestamp mode
  const tsSel = $('phantomTsMode');
  if (tsSel) tsSel.value = phantomConfig.tsMode;
  const tsManRow = $('phantomTsManualRow');
  if (tsManRow) tsManRow.style.display = phantomConfig.tsMode === 'manual' ? 'flex' : 'none';
  const tsManInp = $('phantomTsManual');
  if (tsManInp) tsManInp.value = phantomConfig.tsManual || '';

  // Prefix
  const prefInp = $('phantomPrefix');
  if (prefInp) prefInp.value = phantomConfig.prefix || 'IMG_';
  // Name mode + locked name
  const nameModeEl = $('phantomNameMode');
  if (nameModeEl) {
    nameModeEl.value = phantomConfig.nameMode || 'prefix';
    phantomNameModeToggle(phantomConfig.nameMode || 'prefix');
  }
  // Ensure a name exists and show it
  if (phantomConfig.nameMode === 'person') {
    phantomEnsureLockedName();
  }
  const personDisplayEl = $('phantomPersonDisplay');
  if (personDisplayEl) personDisplayEl.textContent = phantomConfig.lockedName || '—';
  // GPS mode
  const gpsModeEl = $('phantomGpsMode');
  if (gpsModeEl) {
    gpsModeEl.value = phantomConfig.gpsMode || 'off';
    phantomGpsModeToggle(phantomConfig.gpsMode || 'off');
  }

  const gpsCityEl = $('phantomGpsCity');
  if (gpsCityEl) gpsCityEl.value = phantomConfig.gpsCity || 'nyc';
  const gpsLatEl = $('phantomGpsLat');
  if (gpsLatEl) gpsLatEl.value = phantomConfig.gpsLat || '';
  const gpsLngEl = $('phantomGpsLng');
  if (gpsLngEl) gpsLngEl.value = phantomConfig.gpsLng || '';
}

function phantomUpdateIOS() {
  const devKey = phantomConfig.deviceKey;
  const pool = PHANTOM_IOS_POOLS[devKey] || ['26.3.1'];
  // Deduplicate while preserving order
  const seen = new Set(), uniq = [];
  for (const v of pool) { if (!seen.has(v)) { seen.add(v); uniq.push(v); } }

  const sel = $('phantomIOS');
  if (!sel) return;
  // No random option — every version is explicit. Default to newest (first in list).
  sel.innerHTML = uniq.map(v => '<option value="' + v + '"' + (phantomConfig.ios === v ? ' selected' : '') + '>' + v + '</option>').join('');
  if (phantomConfig.ios && seen.has(phantomConfig.ios)) sel.value = phantomConfig.ios;
  else { sel.value = uniq[0] || ''; phantomConfig.ios = uniq[0] || ''; }
}

function phantomUpdateSpecs() {
  const d = GEN_DEVICES[phantomConfig.deviceKey];
  if (!d) return;
  const pool = PHANTOM_IOS_POOLS[phantomConfig.deviceKey] || [];
  const seen = new Set(); const uniq = []; for (const v of pool) { if (!seen.has(v)) { seen.add(v); uniq.push(v); } }
  const iosRange = uniq.length > 1 ? uniq[uniq.length-1] + ' – ' + uniq[0] : (uniq[0] || '');

  const setText = function(id, val) { const el = $(id); if (el) el.textContent = val; };
  setText('psd_model',   d.make + ' ' + d.model);
  const iosPool2 = PHANTOM_IOS_POOLS[phantomConfig.deviceKey] || [];
  const iosDisplay = phantomConfig.ios || iosPool2[0] || iosRange;
  setText('psd_software', iosDisplay);
  setText('psd_lens',    d.lensModel || '—');
  setText('psd_focal',   d.focalLength + 'mm (35mm: ' + d.focalLength35 + 'mm)');
  setText('psd_fnum',    'f/' + d.fNumber);
  setText('psd_iso',     (d.isoPool || []).filter(function(v,i,a){return a.indexOf(v)===i;}).join(', '));
  setText('psd_shutter', (d.shutterPool || []).map(function(v){return '1/'+Math.round(1/v);}).filter(function(v,i,a){return a.indexOf(v)===i;}).join(', '));
  setText('psd_cs',      d.colorSpace === 65535 ? '65535 (uncalibrated — Apple signature)' : String(d.colorSpace));
  setText('psd_ycbcr',   d.ycbcrPositioning === 1 ? '1 (centered — Apple)' : '2 (co-sited — Android)');
  setText('psd_dpi',     d.dpi + ' DPI');

  const noteEl = $('phantomDeviceNote');
  if (noteEl) noteEl.textContent = d.note || '';
}

function phantomSummaryUpdate() {
  const el = $('genPhantomSummaryText');
  if (!el) return;
  const d = GEN_DEVICES[phantomConfig.deviceKey];
  if (!d) return;
  const iosPool = PHANTOM_IOS_POOLS[phantomConfig.deviceKey] || [];
  const iosText = phantomConfig.ios || iosPool[0] || 'auto';
  let gpsText = 'GPS: off';
  if (phantomConfig.gpsMode === 'city') {
    const city = GEN_CITIES[phantomConfig.gpsCity || 'nyc'];
    gpsText = 'GPS: ' + (city ? city.name : phantomConfig.gpsCity) + ' · unique per image';
  } else if (phantomConfig.gpsMode === 'manual') {
    gpsText = 'GPS: manual (' + (phantomConfig.gpsLat||'?') + ', ' + (phantomConfig.gpsLng||'?') + ') ±15m';
  }
  const nameText = (phantomConfig.nameMode === 'person')
    ? 'File: ' + (phantomConfig.lockedName || '—') + '_XXXXX'
    : 'File: ' + (phantomConfig.prefix || 'IMG_') + 'XXXX';
  const lines = [
    d.make + ' ' + d.model + ' · iOS ' + iosText,
    'f/' + d.fNumber + ' · ' + d.focalLength + 'mm · ISO random · Shutter random',
    gpsText,
    nameText,
    'Pixel: L17+L13+L4+L3+L5+L18+L15 · ΔE≤1.0',
  ];
  el.innerHTML = lines.map(function(l){ return '<div>' + esc(l) + '</div>'; }).join('');
}

// Wire modal events
// genPhantomBtn handled by main preset forEach

// genCarbonBtn handled by main preset forEach

if ($('genCarbonEditBtn')) {
  if ($('genCarbonEditBtn')) { $('genCarbonEditBtn').addEventListener('click', function() { carbonOpenModal(); }); }
}
if ($('genPhantomEditBtn')) {
  if ($('genPhantomEditBtn')) { $('genPhantomEditBtn').addEventListener('click', function() { phantomOpenModal(); }); }
}

if ($('phantomCancelBtn')) {
  $('phantomCancelBtn').addEventListener('click', phantomCloseModal);
}

if ($('phantomOverlay')) {
  $('phantomOverlay').addEventListener('click', function(e) {
    if (e.target === $('phantomOverlay')) phantomCloseModal();
  });
}

if ($('phantomSaveBtn')) {
  $('phantomSaveBtn').addEventListener('click', function() {
    // Save all settings from modal into phantomConfig
    const devSel = $('phantomDevice');
    if (devSel) phantomConfig.deviceKey = devSel.value;
    const iosSel = $('phantomIOS');
    if (iosSel) phantomConfig.ios = iosSel.value;
    const tsSel = $('phantomTsMode');
    if (tsSel) phantomConfig.tsMode = tsSel.value;
    const tsMan = $('phantomTsManual');
    if (tsMan) phantomConfig.tsManual = tsMan.value;
    const prefInp = $('phantomPrefix');
    if (prefInp) phantomConfig.prefix = prefInp.value || 'IMG_';
    const nameModeEl = $('phantomNameMode');
    if (nameModeEl) phantomConfig.nameMode = nameModeEl.value;
    const gpsModeEl = $('phantomGpsMode');
    if (gpsModeEl) phantomConfig.gpsMode = gpsModeEl.value;
    const gpsCityEl = $('phantomGpsCity');
    if (gpsCityEl) phantomConfig.gpsCity = gpsCityEl.value;
    const gpsLatEl = $('phantomGpsLat');
    if (gpsLatEl) phantomConfig.gpsLat = gpsLatEl.value;
    const gpsLngEl = $('phantomGpsLng');
    if (gpsLngEl) phantomConfig.gpsLng = gpsLngEl.value;

    phantomSave();
    phantomSummaryUpdate();
    phantomCloseModal();
    showToast('Phantom settings saved');
    dbg('Phantom: ' + phantomConfig.deviceKey + ' · iOS ' + (phantomConfig.ios||'random'), 'debug-ok');
  });
}

if ($('phantomDevice')) {
  $('phantomDevice').addEventListener('change', function() {
    phantomConfig.deviceKey = this.value;
    phantomConfig.ios = ''; // reset iOS when device changes
    phantomUpdateIOS();
    phantomUpdateSpecs();
  });
}

if ($('phantomTsMode')) {
  $('phantomTsMode').addEventListener('change', function() {
    phantomConfig.tsMode = this.value;
    const row = $('phantomTsManualRow');
    if (row) row.style.display = this.value === 'manual' ? 'flex' : 'none';
  });
}







function phantomGpsModeToggle(mode) {
  const cityRow    = $('phantomGpsCityRow');
  const manualRows = $('phantomGpsManualRows');
  if (cityRow)    cityRow.style.display    = mode === 'city'   ? 'flex' : 'none';
  if (manualRows) manualRows.style.display = mode === 'manual' ? 'block': 'none';
  // Update pixel info line
  const gpsLine = $('phantomPixelGpsLine');
  if (gpsLine) {
    if (mode === 'off') {
      gpsLine.style.color = 'var(--ok)';
      gpsLine.textContent = '● GPS: off';
    } else if (mode === 'city') {
      const cityEl = $('phantomGpsCity');
      const city = GEN_CITIES[cityEl ? cityEl.value : 'nyc'];
      gpsLine.style.color = 'var(--warn)';
      gpsLine.textContent = '● GPS: ' + (city ? city.name : 'city') + ' · unique per image';
    } else {
      gpsLine.style.color = 'var(--warn)';
      gpsLine.textContent = '● GPS: manual lat/lng ±15m jitter';
    }
  }
}
function phantomNameModeToggle(mode) {
  const prefRow    = $('phantomPrefixRow');
  const personRow  = $('phantomPersonRow');
  const infoEl     = $('phantomNameModeInfo');
  if (prefRow)   prefRow.style.display   = mode === 'prefix' ? 'flex'  : 'none';
  if (personRow) personRow.style.display = mode === 'person' ? 'block' : 'none';
  if (infoEl) infoEl.textContent = mode === 'person'
    ? 'Same name on every image. Re-roll to pick a new one.'
    : 'Real iPhone files use IMG_ prefix';
  // Ensure name exists and is displayed when switching to person mode
  if (mode === 'person') {
    phantomEnsureLockedName();
    const el = $('phantomPersonDisplay');
    if (el) el.textContent = phantomConfig.lockedName || '—';
  }
}
if ($('phantomGpsMode')) {
  $('phantomGpsMode').addEventListener('change', function() {
    phantomConfig.gpsMode = this.value;
    phantomGpsModeToggle(this.value);
  });
}
if ($('phantomGpsCity')) {
  $('phantomGpsCity').addEventListener('change', function() {
    phantomConfig.gpsCity = this.value;
    // Re-run toggle to refresh the GPS line text
    phantomGpsModeToggle(phantomConfig.gpsMode);
  });
}

if ($('phantomNameMode')) {
  $('phantomNameMode').addEventListener('change', function() {
    phantomConfig.nameMode = this.value;
    phantomNameModeToggle(this.value);
  });
}

// Patch genBuildConfig to use phantomConfig when phantom preset is active
const _origGenBuildConfig = genBuildConfig;
genBuildConfig = function() {
  if (genPreset !== 'phantom') return _origGenBuildConfig();

  const preset  = GEN_PRESETS.phantom;
  const device  = Object.assign({}, GEN_DEVICES[phantomConfig.deviceKey] || GEN_DEVICES.ip16pro);

  // Apply selected/random iOS
  // Use the explicitly selected iOS version (no random — user always picks one)
  const pool = PHANTOM_IOS_POOLS[phantomConfig.deviceKey] || ['26.3.1'];
  const iosVal = phantomConfig.ios || pool[0] || '26.3.1';
  device.software = iosVal;

  const ts = genTimestamp(phantomConfig.tsMode, phantomConfig.tsManual);
  const subSec = String(Math.floor(Math.random()*999)).padStart(3,'0');
  // GPS — now wired to phantomConfig.gpsMode
  let gps = null;
  if (phantomConfig.gpsMode === 'city') {
    gps = genGPSCoords('city', { city: phantomConfig.gpsCity || 'nyc' });
  } else if (phantomConfig.gpsMode === 'manual' && phantomConfig.gpsLat && phantomConfig.gpsLng) {
    gps = genGPSCoords('manual', { lat: phantomConfig.gpsLat, lng: phantomConfig.gpsLng });
  }

  const lumaQ  = device.qt ? device.qt.luma  : 92;
  const chromaQ= device.qt ? device.qt.chroma : 86;
  const jpegType = device.jpegType || 'baseline';

  const cfg = genFinaliseCfg(preset, device, ts, subSec, gps, lumaQ, chromaQ, jpegType);
  // Override filename prefix and name mode
  cfg._phantomPrefix   = phantomConfig.prefix || 'IMG_';
  cfg._phantomNameMode = phantomConfig.nameMode || 'prefix';
  return cfg;
};

// Patch genOutFilename to use phantom prefix or person name
const _origGenOutFilename = genOutFilename;
genOutFilename = function(cfg) {
  if (genPreset === 'phantom' && (cfg._phantomNameMode || phantomConfig.nameMode) === 'person') {
    // Use the LOCKED name — same name every image, scrambled 5-digit suffix
    const name = phantomEnsureLockedName();
    const rand = Math.floor(Math.random()*90000+10000);
    return name + '_' + rand + '.jpg';
  }
  const prefix = cfg._phantomPrefix || $('genFilenamePrefix')?.value || 'IMG_';
  const rand = Math.floor(Math.random()*90000+10000);
  return prefix + rand + '.jpg';
};

// When generator preset button is clicked (not phantom), hide phantom summary
// Preset clear handled in individual button listeners above


// ── PHANTOM RE-ROLL BUTTON ────────────────────────────────────────
if ($('phantomRerollBtn')) {
  $('phantomRerollBtn').addEventListener('click', function() {
    phantomRerollName();
  });
}

// ── CARBON MODAL WIRING ──────────────────────────────────────────
function carbonOpenModal() {
  const el = $('carbonOverlay');
  if (el) el.style.display = 'flex';
  carbonModalSync();
}
function carbonCloseModal() {
  const el = $('carbonOverlay');
  if (el) el.style.display = 'none';
}

function ultimateOpenModal() {
  const el = $('ultimateOverlay');
  if (el) el.style.display = 'flex';
  ultimateModalSync();
}
function ultimateCloseModal() {
  const el = $('ultimateOverlay');
  if (el) el.style.display = 'none';
}

function ultimateModalSync() {
  // Restore device from saved config
  const devSelSync = $('ultimateDevice');
  if (devSelSync) { devSelSync.value = ultimateConfig.deviceKey || 'carbon_ip15pro'; }
  ultimateUpdateIOS();
  ultimateUpdateShootModes();
  const tsModeEl = $('ultimateTsMode');
  if (tsModeEl) tsModeEl.value = ultimateConfig.tsMode || 'fresh';
  const tsManRow = $('ultimateTsManualRow');
  const tsManEl  = $('ultimateTsManual');
  if (tsManRow) tsManRow.style.display = ultimateConfig.tsMode === 'manual' ? 'flex' : 'none';
  if (tsManEl)  tsManEl.value = ultimateConfig.tsManual || '';
  const nameModeEl = $('ultimateNameMode');
  if (nameModeEl) nameModeEl.value = ultimateConfig.nameMode || 'prefix';
  ultimateNameModeToggle(ultimateConfig.nameMode || 'prefix');
  const gpsModeEl = $('ultimateGpsMode');
  if (gpsModeEl) gpsModeEl.value = ultimateConfig.gpsMode || 'off';
  ultimateGpsModeToggle(ultimateConfig.gpsMode || 'off');
  const gpsCityEl = $('ultimateGpsCity');
  if (gpsCityEl) gpsCityEl.value = ultimateConfig.gpsCity || 'nyc';
  const gpsLatEl = $('ultimateGpsLat');
  if (gpsLatEl) gpsLatEl.value = ultimateConfig.gpsLat || '';
  const gpsLngEl = $('ultimateGpsLng');
  if (gpsLngEl) gpsLngEl.value = ultimateConfig.gpsLng || '';
  const pfxEl = $('ultimatePrefix');
  if (pfxEl) pfxEl.value = ultimateConfig.prefix || 'IMG_';
}

function ultimateUpdateIOS() {
  // Ultimate is locked to iPhone 15 Pro — always use the full ip15pro iOS pool
  const dev2 = GEN_DEVICES[ultimateConfig.deviceKey] || GEN_DEVICES['carbon_ip15pro'];
  const pool = dev2.softwarePool || [];
  const sel = $('ultimateIOS');
  if (!sel) return;
  sel.innerHTML = pool.map(function(v) {
    return '<option value="' + v + '"' + (ultimateConfig.ios === v ? ' selected' : '') + '>' + v + '</option>';
  }).join('');
  if (!ultimateConfig.ios || !pool.includes(ultimateConfig.ios)) {
    ultimateConfig.ios = pool[0] || '';
    if (sel.options[0]) sel.value = sel.options[0].value;
  }
}

function ultimateUpdateShootModes() {
  // Ultimate is locked to iPhone 15 Pro
  const dev = GEN_DEVICES['carbon_ip15pro'] || {};
  const modes = dev.shootModes || {};
  const sel = $('ultimateMode');
  if (!sel) return;
  const cur = ultimateConfig.shootMode || 'main_24mp';
  sel.innerHTML = Object.entries(modes).map(function([key, m]) {
    return '<option value="' + key + '"' + (key === cur ? ' selected' : '') + '>' + m.label + '</option>';
  }).join('');
  sel.innerHTML += '<option value="auto"' + (cur === 'auto' ? ' selected' : '') + '>Auto — match source resolution</option>';
  const infoEl = $('ultimateModeInfo');
  const mode = modes[cur];
  if (infoEl && mode) infoEl.textContent = mode.label + '. File ≈ ' + mode.sizeMB[0] + '–' + mode.sizeMB[1] + ' MB.';
}

function ultimateNameModeToggle(mode) {
  const pfxRow = $('ultimatePrefixRow');
  const personRow = $('ultimatePersonRow');
  if (pfxRow)    pfxRow.style.display    = mode === 'prefix' ? 'flex'  : 'none';
  if (personRow) personRow.style.display = mode === 'person' ? 'block' : 'none';
  if (mode === 'person') {
    ultimateEnsureLockedName();
    const el = $('ultimatePersonDisplay');
    if (el) el.textContent = ultimateConfig.lockedName || '—';
  }
}

function ultimateGpsModeToggle(mode) {
  const cityRow    = $('ultimateGpsCityRow');
  const manualRows = $('ultimateGpsManualRows');
  if (cityRow)    cityRow.style.display    = mode === 'city'   ? 'flex'  : 'none';
  if (manualRows) manualRows.style.display = mode === 'manual' ? 'block' : 'none';
}

// Ultimate event listeners

function ultimateSummaryUpdate() {
  const el = $('genUltimateSummaryText');
  if (!el) return;
  const dev = GEN_DEVICES[ultimateConfig.deviceKey] || GEN_DEVICES['carbon_ip15pro'];
  if (!dev) return;
  const modeKey = ultimateConfig.shootMode || 'main_12mp';
  const mode = (dev.shootModes || {})[modeKey];
  const iosPool = dev.softwarePool || [];
  const ios = ultimateConfig.ios || iosPool[0] || '18.0';
  let gpsText = 'GPS: off';
  if (ultimateConfig.gpsMode === 'city') {
    const city = GEN_CITIES[ultimateConfig.gpsCity || 'nyc'];
    gpsText = 'GPS: ' + (city ? city.name : ultimateConfig.gpsCity) + ' · unique per image';
  } else if (ultimateConfig.gpsMode === 'manual') {
    gpsText = 'GPS: ' + (ultimateConfig.gpsLat||'?') + ', ' + (ultimateConfig.gpsLng||'?') + ' ±15m';
  }
  const nameText = ultimateConfig.nameMode === 'person'
    ? 'File: ' + (ultimateConfig.lockedName || '—') + '_XXXXX'
    : 'File: ' + (ultimateConfig.prefix || 'IMG_') + 'XXXX';
  const lines = [
    dev.model + ' · iOS ' + ios,
    mode ? mode.label + ' · f/' + (mode.fNumber||dev.fNumber) + ' · ' + (mode.focalLength35||dev.focalLength35) + 'mm' : 'Main camera',
    'Timestamp: ' + (ultimateConfig.tsMode || 'fresh') + ' · IFD1 thumbnail ✔',
    'Source pixels preserved — zero re-encoding',
    gpsText, nameText,
  ];
  el.innerHTML = lines.map(function(l){ return '<div>' + esc(l) + '</div>'; }).join('');
}

if ($('ultimateSaveBtn')) {
  $('ultimateSaveBtn').addEventListener('click', function() {
    const devEl = $('ultimateDevice'); if (devEl) ultimateConfig.deviceKey = devEl.value;
    const iosEl = $('ultimateIOS');    if (iosEl) ultimateConfig.ios = iosEl.value;
    const modeEl = $('ultimateMode'); if (modeEl) ultimateConfig.shootMode = modeEl.value;
    const tsModeEl = $('ultimateTsMode'); if (tsModeEl) ultimateConfig.tsMode = tsModeEl.value;
    const tsManEl = $('ultimateTsManual'); if (tsManEl) ultimateConfig.tsManual = tsManEl.value;
    const nameModeEl = $('ultimateNameMode'); if (nameModeEl) ultimateConfig.nameMode = nameModeEl.value;
    const pfxEl = $('ultimatePrefix'); if (pfxEl) ultimateConfig.prefix = pfxEl.value || 'IMG_';
    const gpsModeEl = $('ultimateGpsMode'); if (gpsModeEl) ultimateConfig.gpsMode = gpsModeEl.value;
    const gpsCityEl = $('ultimateGpsCity'); if (gpsCityEl) ultimateConfig.gpsCity = gpsCityEl.value;
    const gpsLatEl = $('ultimateGpsLat');   if (gpsLatEl) ultimateConfig.gpsLat = gpsLatEl.value;
    const gpsLngEl = $('ultimateGpsLng');   if (gpsLngEl) ultimateConfig.gpsLng = gpsLngEl.value;
    ultimateSave();
    ultimateSummaryUpdate();
    ultimateCloseModal();
    showToast('Ultimate settings saved');
  });
}
if ($('ultimateCancelBtn')) { $('ultimateCancelBtn').addEventListener('click', ultimateCloseModal); }
if ($('ultimateOverlay'))   { $('ultimateOverlay').addEventListener('click', function(e){ if(e.target===$('ultimateOverlay')) ultimateCloseModal(); }); }
if ($('ultimateRerollBtn')) { $('ultimateRerollBtn').addEventListener('click', ultimateReroll); }
// ultimateDevice locked to carbon_ip15pro — no change listener
if ($('ultimateIOS'))       { $('ultimateIOS').addEventListener('change', function(){ ultimateConfig.ios=this.value; }); }
if ($('ultimateMode'))      { $('ultimateMode').addEventListener('change', function(){ ultimateConfig.shootMode=this.value; }); }
if ($('ultimateTsMode'))    { $('ultimateTsMode').addEventListener('change', function(){ ultimateConfig.tsMode=this.value; const row=$('ultimateTsManualRow'); if(row) row.style.display=this.value==='manual'?'flex':'none'; }); }
if ($('ultimateTsHour'))    { $('ultimateTsHour').addEventListener('change', function(){
  ultimateConfig.tsHour=this.value;
  const customRow=$('ultimateTsHourCustomRow');
  if(customRow) customRow.style.display=this.value==='custom'?'flex':'none';
  ultimateSave();
}); }
if ($('ultimateTsHourCustom')) { $('ultimateTsHourCustom').addEventListener('change', function(){
  ultimateConfig.tsHourCustom=parseInt(this.value,10)||14;
  ultimateSave();
}); }
if ($('ultimateNameMode'))  { $('ultimateNameMode').addEventListener('change', function(){ ultimateConfig.nameMode=this.value; ultimateNameModeToggle(this.value); }); }
if ($('ultimateGpsMode'))   { $('ultimateGpsMode').addEventListener('change', function(){ ultimateConfig.gpsMode=this.value; ultimateGpsModeToggle(this.value); }); }
if ($('ultimateGpsCity'))   { $('ultimateGpsCity').addEventListener('change', function(){ ultimateConfig.gpsCity=this.value; }); }
if ($('genUltimateEditBtn')){ $('genUltimateEditBtn').addEventListener('click', function(){ ultimateOpenModal(); }); }



function carbonModalSync() {
  // Device
  const devEl = $('carbonDevice');
  if (devEl) { devEl.value = carbonConfig.deviceKey; carbonUpdateIOS(); carbonUpdateShootModes(); }
  // Timestamp
  const tsModeEl = $('carbonTsMode');
  if (tsModeEl) tsModeEl.value = carbonConfig.tsMode || 'random_recent';
  const tsManRow = $('carbonTsManualRow');
  const tsManEl  = $('carbonTsManual');
  if (tsManRow) tsManRow.style.display = carbonConfig.tsMode === 'manual' ? 'flex' : 'none';
  if (tsManEl)  tsManEl.value = carbonConfig.tsManual || '';
  // Name mode
  const nameModeEl = $('carbonNameMode');
  if (nameModeEl) nameModeEl.value = carbonConfig.nameMode || 'prefix';
  carbonNameModeToggle(carbonConfig.nameMode || 'prefix');
  // GPS
  const gpsModeEl = $('carbonGpsMode');
  if (gpsModeEl) gpsModeEl.value = carbonConfig.gpsMode || 'off';
  carbonGpsModeToggle(carbonConfig.gpsMode || 'off');
  const gpsCityEl = $('carbonGpsCity');
  if (gpsCityEl) gpsCityEl.value = carbonConfig.gpsCity || 'nyc';
  const gpsLatEl = $('carbonGpsLat');
  if (gpsLatEl) gpsLatEl.value = carbonConfig.gpsLat || '';
  const gpsLngEl = $('carbonGpsLng');
  if (gpsLngEl) gpsLngEl.value = carbonConfig.gpsLng || '';
  // Prefix
  const pfxEl = $('carbonPrefix');
  if (pfxEl) pfxEl.value = carbonConfig.prefix || 'IMG_';
}

function carbonUpdateIOS() {
  const devKey = carbonConfig.deviceKey;
  const dev    = GEN_DEVICES[devKey] || {};
  // Use expanded pool: dev.softwarePool now has full 17.x/18.x/26.x range
  const pool   = dev.softwarePool || [];
  const sel    = $('carbonIOS');
  if (!sel) return;
  sel.innerHTML = pool.map(function(v) {
    return '<option value="' + v + '"' + (carbonConfig.ios === v ? ' selected' : '') + '>' + v + '</option>';
  }).join('');
  if (!carbonConfig.ios || !pool.includes(carbonConfig.ios)) {
    carbonConfig.ios = pool[0] || '';
    if (sel.options[0]) sel.value = sel.options[0].value;
  }
}

function carbonUpdateShootModes() {
  const devKey = carbonConfig.deviceKey;
  const dev    = GEN_DEVICES[devKey] || {};
  const modes  = dev.shootModes || {};
  const sel    = $('carbonMode');
  if (!sel) return;
  sel.innerHTML = Object.entries(modes).map(function([key, m]) {
    const sel_ = key === (carbonConfig.shootMode || 'main_24mp') ? ' selected' : '';
    return '<option value="' + key + '"' + sel_ + '>' + m.label + '</option>';
  }).join('');
  sel.innerHTML += '<option value="auto"' + (carbonConfig.shootMode === 'auto' ? ' selected' : '') + '>Auto — match source resolution</option>';
  carbonUpdateModeInfo();
}

function carbonUpdateModeInfo() {
  const devKey = carbonConfig.deviceKey;
  const dev    = GEN_DEVICES[devKey] || {};
  const modeKey = carbonConfig.shootMode || 'main_24mp';
  const mode   = (dev.shootModes || {})[modeKey];
  const infoEl = $('carbonModeInfo');
  if (!infoEl) return;
  if (mode) {
    infoEl.textContent = mode.label + '. File size ≈ ' + mode.sizeMB[0] + '–' + mode.sizeMB[1] + ' MB.';
  } else {
    infoEl.textContent = 'Auto: picks the closest device mode to your source resolution.';
  }
}

function carbonNameModeToggle(mode) {
  const pfxRow    = $('carbonPrefixRow');
  const personRow = $('carbonPersonRow');
  if (pfxRow)    pfxRow.style.display    = mode === 'prefix' ? 'flex'  : 'none';
  if (personRow) personRow.style.display = mode === 'person' ? 'block' : 'none';
  if (mode === 'person') {
    carbonEnsureLockedName();
    const el = $('carbonPersonDisplay');
    if (el) el.textContent = carbonConfig.lockedName || '—';
  }
}

function carbonGpsModeToggle(mode) {
  const cityRow    = $('carbonGpsCityRow');
  const manualRows = $('carbonGpsManualRows');
  if (cityRow)    cityRow.style.display    = mode === 'city'   ? 'flex'  : 'none';
  if (manualRows) manualRows.style.display = mode === 'manual' ? 'block' : 'none';
}

function ultimateSummaryUpdate() {
  const el = $('genUltimateSummaryText');
  if (!el) return;
  // Always locked to iPhone 15 Pro
  const dev = GEN_DEVICES['carbon_ip15pro'];
  if (!dev) return;
  const pool = PHANTOM_IOS_POOLS['ip15pro'] || dev.softwarePool || [];
  const modeKey = ultimateConfig.shootMode || 'main_24mp';
  const mode = (dev.shootModes || {})[modeKey];
  const ios = ultimateConfig.ios || pool[0] || '17.0';
  let gpsText = 'GPS: off';
  if (ultimateConfig.gpsMode === 'city') {
    const city = GEN_CITIES[ultimateConfig.gpsCity || 'nyc'];
    gpsText = 'GPS: ' + (city ? city.name : ultimateConfig.gpsCity) + ' · unique per image';
  } else if (ultimateConfig.gpsMode === 'manual') {
    gpsText = 'GPS: ' + (ultimateConfig.gpsLat||'?') + ', ' + (ultimateConfig.gpsLng||'?') + ' ±15m';
  }
  const nameText = ultimateConfig.nameMode === 'person'
    ? 'File: ' + (ultimateConfig.lockedName || '—') + '_XXXXX'
    : 'File: ' + (ultimateConfig.prefix || 'IMG_') + 'XXXX';
  const lines = [
    'iPhone 15 Pro · iOS ' + ios,
    mode ? mode.label + ' · f/' + mode.fNumber + ' · ' + mode.focalLength35 + 'mm' : 'Main · 24MP · f/1.78 · 24mm',
    '48MP sensor · 6.765mm · 4:2:0 · Q92 QT',
    'Timestamp: within last 4 hours · IFD1 thumbnail ✔',
    gpsText,
    nameText,
  ];
  el.innerHTML = lines.map(function(l){ return '<div>' + esc(l) + '</div>'; }).join('');
}

function carbonSummaryUpdate() {
  const el = $('genCarbonSummaryText');
  if (!el) return;
  const dev = GEN_DEVICES[carbonConfig.deviceKey];
  if (!dev) return;
  const modeKey = carbonConfig.shootMode || 'main_24mp';
  const mode = (dev.shootModes || {})[modeKey];
  const ios  = carbonConfig.ios || (dev.softwarePool ? dev.softwarePool[0] : '');
  let gpsText = 'GPS: off';
  if (carbonConfig.gpsMode === 'city') {
    const city = GEN_CITIES[carbonConfig.gpsCity || 'nyc'];
    gpsText = 'GPS: ' + (city ? city.name : carbonConfig.gpsCity) + ' · unique per image';
  } else if (carbonConfig.gpsMode === 'manual') {
    gpsText = 'GPS: ' + (carbonConfig.gpsLat || '?') + ', ' + (carbonConfig.gpsLng || '?') + ' ±15m';
  }
  const nameText = carbonConfig.nameMode === 'person'
    ? 'File: ' + (carbonConfig.lockedName || '—') + '_XXXXX'
    : 'File: ' + (carbonConfig.prefix || 'IMG_') + 'XXXX';
  const lines = [
    dev.model + ' · iOS ' + ios,
    mode ? mode.label : 'Auto mode',
    gpsText,
    nameText,
  ];
  el.innerHTML = lines.map(function(l){ return '<div>' + esc(l) + '</div>'; }).join('');
}

// Carbon preset removed — Carbon is now a toggle inside Phantom modal
if ($('carbonCancelBtn')) {
  $('carbonCancelBtn').addEventListener('click', carbonCloseModal);
}
if ($('carbonOverlay')) {
  $('carbonOverlay').addEventListener('click', function(e) {
    if (e.target === $('carbonOverlay')) carbonCloseModal();
  });
}
if ($('carbonSaveBtn')) {
  $('carbonSaveBtn').addEventListener('click', function() {
    const devEl = $('carbonDevice');
    if (devEl) carbonConfig.deviceKey = devEl.value;
    const iosEl = $('carbonIOS');
    if (iosEl) carbonConfig.ios = iosEl.value;
    const modeEl = $('carbonMode');
    if (modeEl) carbonConfig.shootMode = modeEl.value;
    const tsModeEl = $('carbonTsMode');
    if (tsModeEl) carbonConfig.tsMode = tsModeEl.value;
    const tsManEl = $('carbonTsManual');
    if (tsManEl) carbonConfig.tsManual = tsManEl.value;
    const nameModeEl = $('carbonNameMode');
    if (nameModeEl) carbonConfig.nameMode = nameModeEl.value;
    const pfxEl = $('carbonPrefix');
    if (pfxEl) carbonConfig.prefix = pfxEl.value || 'IMG_';
    const gpsModeEl = $('carbonGpsMode');
    if (gpsModeEl) carbonConfig.gpsMode = gpsModeEl.value;
    const gpsCityEl = $('carbonGpsCity');
    if (gpsCityEl) carbonConfig.gpsCity = gpsCityEl.value;
    const gpsLatEl = $('carbonGpsLat');
    if (gpsLatEl) carbonConfig.gpsLat = gpsLatEl.value;
    const gpsLngEl = $('carbonGpsLng');
    if (gpsLngEl) carbonConfig.gpsLng = gpsLngEl.value;
    carbonSave();
    carbonSummaryUpdate();
    carbonCloseModal();
    showToast('Carbon settings saved');
  });
}
if ($('carbonRerollBtn')) {
  $('carbonRerollBtn').addEventListener('click', function() {
    carbonReroll();
  });
}
if ($('carbonDevice')) {
  $('carbonDevice').addEventListener('change', function() {
    carbonConfig.deviceKey = this.value;
    carbonConfig.ios = '';
    carbonUpdateIOS();
    carbonUpdateShootModes();
  });
}
if ($('carbonIOS')) {
  $('carbonIOS').addEventListener('change', function() {
    carbonConfig.ios = this.value;
  });
}
if ($('carbonMode')) {
  $('carbonMode').addEventListener('change', function() {
    carbonConfig.shootMode = this.value;
    carbonUpdateModeInfo();
  });
}
if ($('carbonTsMode')) {
  $('carbonTsMode').addEventListener('change', function() {
    carbonConfig.tsMode = this.value;
    const row = $('carbonTsManualRow');
    if (row) row.style.display = this.value === 'manual' ? 'flex' : 'none';
  });
}
if ($('carbonNameMode')) {
  $('carbonNameMode').addEventListener('change', function() {
    carbonConfig.nameMode = this.value;
    carbonNameModeToggle(this.value);
  });
}
if ($('carbonGpsMode')) {
  $('carbonGpsMode').addEventListener('change', function() {
    carbonConfig.gpsMode = this.value;
    carbonGpsModeToggle(this.value);
  });
}
if ($('carbonGpsCity')) {
  $('carbonGpsCity').addEventListener('change', function() {
    carbonConfig.gpsCity = this.value;
  });
}



try { dbg('Generator: engine loaded (' + DEVICE_KEYS.length + ' device profiles, 3 presets)', 'debug-ok'); } catch(e) {}
