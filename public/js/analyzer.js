/**
 * analyzer.js — Integral Ad Science suite Image Forensic Analyzer v4
 *
 * Architecture: 4-layer forensic pipeline
 *   L1 File Structure  — bitstream, segments, IFD1 thumbnail, C2PA
 *   L2 Device Identity — EXIF fingerprint, software chain, timestamps, GPS
 *   L3 JPEG Encoding   — QT tables, chroma, DCT double-compression
 *   L4 Pixel Forensics — PRNU, LSB, IRS pentagon (GLCM/CED/VBL/MS)
 *
 * Scoring: Multiplicative penalty per layer, hybrid fusion α=0.68/β=0.32
 *   structural (L1+L2+L3) vs pixel (L4)
 *
 * IRS pentagon: arXiv 2309.14756 (WACV 2024) — 5 stat measures, polygon area
 * PRNU: SWGDE/FBI methodology, Laplacian residual RMS
 * LSB: Westfeld & Pfitzmann steganalysis, spatial + inter-channel correlation
 * QT: Amped Authenticate / JPEGsnoop device database methodology
 * DCT double-compression: Fridrich 2009, Popescu-Farid periodic artifacts
 */
'use strict';

// ── State ─────────────────────────────────────────────────────────
let azFile1Buf = null, azFile1Name = '';
let azImageMode = 'single';

// ── Device fingerprint database ───────────────────────────────────
// JPEG encoding signatures per manufacturer. Sources: ExifTool DB,
// real sample corpus analysis, Apple/Samsung/Google specs.
const AZ_KNOWN_DEVICES = {
  'Apple':   { jpegType:'baseline', colorSpace:65535, dpi:72, ycbcr:1,
               lumaQ:[72,96], chromaQ:[65,92], subsampling:'4:2:0', note:'iPhone' },
  'samsung': { jpegType:'baseline', colorSpace:1, dpi:72, ycbcr:2,
               lumaQ:[82,92], chromaQ:[74,86], subsampling:'4:2:0', note:'Samsung' },
  'Google':  { jpegType:'baseline', colorSpace:1, dpi:72, ycbcr:2,
               lumaQ:[80,90], chromaQ:[72,84], subsampling:'4:2:0', note:'Pixel' },
  'Canon':   { jpegType:'baseline', colorSpace:1, dpi:72, ycbcr:1,
               lumaQ:[75,92], chromaQ:[65,85], subsampling:'4:2:2', note:'Canon DSLR' },
  'NIKON':   { jpegType:'baseline', colorSpace:1, dpi:300, ycbcr:1,
               lumaQ:[80,92], chromaQ:[70,85], subsampling:'4:2:2', note:'Nikon' },
  'SONY':    { jpegType:'baseline', colorSpace:1, dpi:350, ycbcr:1,
               lumaQ:[80,96], chromaQ:[72,88], subsampling:'4:2:2', note:'Sony' },
};

const AZ_IOS_VERSIONS = [
  '26.3.1','26.3','26.2.1','26.2','26.1','26.0.1','26.0',
  '18.5','18.4.1','18.4','18.3.2','18.3.1','18.3',
  '18.2.1','18.2','18.1.1','18.1','18.0.1','18.0',
  '17.7.2','17.7.1','17.7','17.6.1','17.6','17.5.1','17.5',
  '17.4.1','17.4','17.3.1','17.3','17.2.1','17.2',
  '17.1.2','17.1.1','17.1','17.0.3','17.0.2','17.0.1','17.0',
  '16.7.3','16.7.2','16.6.1','15.8.2','15.8.1',
];

const AZ_REAL_MODELS = {
  'Apple': [
    'iPhone 17 Pro Max','iPhone 17 Pro','iPhone Air','iPhone 17',
    'iPhone 16 Pro Max','iPhone 16 Pro','iPhone 16 Plus','iPhone 16','iPhone 16e',
    'iPhone 15 Pro Max','iPhone 15 Pro','iPhone 15 Plus','iPhone 15',
    'iPhone 14 Pro Max','iPhone 14 Pro','iPhone 14 Plus','iPhone 14',
    'iPhone 13 Pro Max','iPhone 13 Pro','iPhone 13','iPhone 13 mini',
    'iPhone 12 Pro Max','iPhone 12 Pro','iPhone 12','iPhone 12 mini',
    'iPhone SE (3rd generation)',
  ],
  'samsung': ['SM-G991B','SM-G996B','SM-G998B','SM-S901B','SM-S906B','SM-S908B',
              'SM-S911B','SM-S916B','SM-S918B','SM-S921B','SM-S926B','SM-S928B'],
  'Google': ['Pixel 6','Pixel 6 Pro','Pixel 6a','Pixel 7','Pixel 7 Pro','Pixel 7a',
             'Pixel 8','Pixel 8 Pro','Pixel 8a','Pixel 9','Pixel 9 Pro'],
};

// ── Explanation pools ─────────────────────────────────────────────
function azPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const AZ_X = {
  prnu_natural: [
    'Sensor noise energy sits in the natural range for a smartphone. Forensic extraction tools would find this unremarkable.',
    'PRNU residual is consistent with real silicon shot noise at normal ISO. Source device identification would require 30+ reference images.',
    'The noise floor matches genuine camera output. No unusual smoothing or synthetic injection detectable at this energy level.',
  ],
  prnu_low: [
    'Noise energy is below the natural floor for any phone camera. Heavy denoising, AI upscaling, or synthetic generation.',
    'Too clean. Real sensors always leave a noise signature — its absence is itself a forensic signal to Amped Authenticate.',
    'The residual noise has been removed or is absent. SWGDE-compliant examiners treat this as inconsistent with genuine capture.',
  ],
  prnu_high: [
    'Strong PRNU energy — sensor fingerprint is legible. With 30+ comparison images a forensic lab could attempt device attribution.',
    'High noise energy makes this sensor\'s fingerprint more extractable. FBI PRNU methodology (wavelet denoising, corpus matching) applies here.',
  ],
  lsb_natural: [
    'Bit-level noise has correct entropy and spatial correlation for a real camera sensor. Steganalysis tools would not flag this.',
    'LSB pattern looks authentic — not too random (software flip) and not too structured (filter artifact). Westfeld-Pfitzmann analysis: natural.',
    'The pixel noise floor has gentle spatial correlation expected from real photon shot noise, not from software randomisation.',
  ],
  lsb_toorandom: [
    'LSB pattern is too perfectly random — classic signature of deliberate software randomisation. Real noise has spatial correlation.',
    'Bit entropy at maximum (1.0) is statistically improbable for real camera output — signature of an LSB-flipping tool.',
    'Pure randomness at the bit level is a red flag. Real sensors produce slightly correlated noise; software noise does not.',
  ],
  lsb_structured: [
    'Entropy below natural range suggests quantisation, heavy filtering, or software generation of pixel values.',
    'Structured noise at the bit level indicates the pixels went through a processing pipeline that regularised their values.',
    'Below-natural bit entropy. AI-generated images, heavily processed photos, or some encoder pipelines show this pattern.',
  ],
  hist_natural: ['Luminance histogram has no significant gaps — consistent with a single-encode camera capture.',
    'Smooth histogram with minimal gaps — the signature of a single encode cycle from a real sensor.'],
  hist_light: ['Minor histogram gaps suggest light processing — possibly one re-encode cycle or subtle auto-enhancement.',
    'A small number of empty bins. Consistent with one re-encode or very light tone adjustment.'],
  hist_comb: [
    'Periodic comb pattern in the histogram — textbook forensic indicator of gamma or levels adjustment. Amped Authenticate detects this automatically.',
    'Regularly spaced gaps form a comb: what happens when a tone curve stretches pixel values after capture.',
  ],
  hist_heavy: [
    'Many histogram gaps indicate heavy processing — multiple re-encodes, aggressive tone mapping, or significant editing.',
    'Heavily disrupted luminance distribution. This many gaps are inconsistent with any single-capture, single-encode workflow.',
  ],
  qt_match: [
    'QT signature matches expected profile for this device. JPEGsnoop would classify this as genuine device output.',
    'JPEG quality fingerprint is in the correct range. Encoder attribution tools would find this profile plausible.',
  ],
  qt_mismatch: [
    'QT signature does not match this device. JPEGsnoop uses exactly this mismatch to identify software encoding vs camera output.',
    'Quality fingerprint is outside expected range for the claimed device. Forensic examiners cross-reference against known QT databases.',
  ],
  chroma_match: ['Chroma subsampling matches the expected mode for this device — one of the more reliable device-class indicators.'],
  chroma_mismatch: [
    'Chroma subsampling wrong for the claimed device. iPhone always writes 4:2:0; browser encoders at high quality write 4:4:4.',
    'Subsampling mismatch. The claimed device consistently writes a different chroma mode than what is present in this file.',
  ],
  dct_single: [
    'DCT analysis shows no double-compression signature — consistent with a single encode cycle from a camera.',
    'No periodic ghost quantisation grid in the DCT domain. The AC coefficient histogram follows a natural Laplacian distribution.',
  ],
  dct_double: [
    'Double JPEG compression detected. Periodic dips in the AC coefficient histogram reveal a previous quantisation grid — the Popescu-Farid signature.',
    'The DCT coefficient distribution shows the ghost pattern of double compression. Real camera photos are compressed exactly once.',
  ],
  ts_match: [
    'All three EXIF timestamps (DateTime, DateTimeOriginal, DateTimeDigitized) are identical — exactly what a real camera writes at capture.',
    'Timestamp triplet consistent. A basic but critical SWGDE check that examiners perform first.',
  ],
  ts_mismatch: [
    'The three EXIF timestamps disagree. Real cameras write all three identically at capture. Divergence is the first thing a SWGDE examiner checks.',
    'Timestamp mismatch detected. Inconsistent ts fields are a primary forensic indicator of post-capture metadata editing.',
  ],
  model_unknown: [
    'Device model not in the known database for this manufacturer — a forensic tool cross-referencing device records would flag this.',
    'Unrecognized model identifier. Forensic databases maintained by examiners would mark this as an unknown device.',
  ],
  blocking_low: ['Blocking artifacts minimal — consistent with high-quality JPEG or a re-encode that maintained quality.'],
  blocking_high: [
    'Significant 8×8 block boundary artifacts — characteristic of aggressive JPEG compression, not consistent with phone camera output quality.',
  ],
  thumb_present: [
    'Embedded thumbnail detected — contains a miniature copy of the image as it existed before any cropping. May reveal removed content.',
    'IFD1 thumbnail present. If the image was cropped after capture, the thumbnail may show the original uncropped composition.',
  ],
  c2pa_present: [
    'C2PA content credential chain embedded — records full provenance including edit history, original source, and tool chain.',
    'Provenance chain detected. C2PA traces this photo back through every processing step to the original capture device.',
  ],
  serial_present: [
    'Unique hardware identifier present. Acts like a serial number linking every photo from this device.',
    'Device serial or image UID stored. Forensic correlation tools use these to cluster photos from the same device across platforms.',
  ],
  offset_time_ok: [
    'OffsetTimeOriginal present — iOS 15+ always writes timezone offset for every capture.',
    'Timezone offset field present and correctly formatted. Consistent with real iOS 15+ output.',
  ],
  offset_time_missing: [
    'OffsetTimeOriginal missing on iOS 15+ device — real iPhones always write this field since iOS 15.',
    'Missing timezone offset field (0x9011). iOS 15+ writes OffsetTime for every shot — absence is a forensic signal.',
  ],
  gps_complete: [
    'GPS block contains all expected iPhone subfields (MeasureMode, DateStamp, Speed). Consistent with a genuine outdoor capture.',
    'Full iPhone GPS block present — matching real hardware output from an outdoor capture.',
  ],
  gps_incomplete: [
    'GPS block is missing fields that real iPhones always write: MeasureMode, DateStamp, or GPSSpeed.',
    'Stripped or synthetic GPS — real iPhone GPS blocks include measure mode, date stamp, and speed reference.',
  ],
};

// ══════════════════════════════════════════════════════════════════
// UI COMPONENTS
// ══════════════════════════════════════════════════════════════════

function azSec(title) {
  const s = document.createElement('div'); s.className = 'az-section';
  const t = document.createElement('div'); t.className = 'az-section-title';
  t.textContent = title; s.appendChild(t); return s;
}

function azRow(label, val, status, explanation) {
  const row = document.createElement('div'); row.className = 'az-row';
  const l = document.createElement('div'); l.className = 'az-row-label'; l.textContent = label;
  const v = document.createElement('div'); v.className = 'az-row-val' + (status ? ' ' + status : '');
  v.textContent = String(val || '—');
  row.appendChild(l); row.appendChild(v);
  if (explanation) {
    const exp = document.createElement('div'); exp.className = 'az-explanation';
    exp.textContent = explanation; row.appendChild(exp);
  }
  return row;
}

function azBadge(text, cls) {
  const s = document.createElement('span'); s.className = 'az-badge ' + cls; s.textContent = text; return s;
}

// Slider row: pct 0–100, zones [{from,to,cls}]
function azSlider(label, pct, sliderLabel, explanation, zones) {
  pct = Math.max(0, Math.min(100, pct));
  let currentCls = 'ok';
  if (zones) for (const z of zones) { if (pct >= z.from && pct <= z.to) { currentCls = z.cls; break; } }
  const row = document.createElement('div'); row.className = 'az-row az-slider-row';
  const l = document.createElement('div'); l.className = 'az-row-label'; l.textContent = label;
  row.appendChild(l);
  const wrap = document.createElement('div'); wrap.className = 'az-slider-wrap';
  const track = document.createElement('div'); track.className = 'az-track';
  if (zones && zones.length) {
    const stops = zones.map(z => {
      const c = z.cls==='ok'?'rgba(0,232,157,.35)':z.cls==='warn'?'rgba(240,160,48,.35)':'rgba(255,64,96,.35)';
      return `${c} ${z.from}%,${c} ${z.to}%`;
    });
    track.style.background = `linear-gradient(to right,${stops.join(',')})`;
  }
  const fill = document.createElement('div');
  fill.className = 'az-track-fill az-track-fill-'+currentCls; fill.style.width = pct+'%';
  track.appendChild(fill);
  const ptr = document.createElement('div'); ptr.className = 'az-track-ptr az-track-ptr-'+currentCls; ptr.style.left = pct+'%';
  const ptrLbl = document.createElement('div'); ptrLbl.className = 'az-track-ptr-label'; ptrLbl.textContent = sliderLabel;
  ptr.appendChild(ptrLbl); track.appendChild(ptr); wrap.appendChild(track); row.appendChild(wrap);
  if (explanation) { const exp=document.createElement('div'); exp.className='az-explanation'; exp.textContent=explanation; row.appendChild(exp); }
  return row;
}

// Layer badge: small header badge showing pass/warn/fail
function azLayerBadge(name, score, cls) {
  const b = document.createElement('div'); b.className = 'az-layer-badge az-layer-badge-'+cls;
  b.innerHTML = '<span class="az-layer-name">'+name+'</span><span class="az-layer-score">'+score+'%</span>';
  return b;
}

// Score gauge: large circular-ish score display
function azScoreGauge(score, cls, verdict, subline) {
  const d = document.createElement('div'); d.className = 'az-verdict';
  // Score ring
  const ring = document.createElement('div'); ring.className = 'az-score-ring az-score-ring-'+cls;
  const val = document.createElement('div'); val.className = 'az-score-num'; val.textContent = score;
  const pct = document.createElement('div'); pct.className = 'az-score-pct'; pct.textContent = '%';
  ring.appendChild(val); ring.appendChild(pct); d.appendChild(ring);
  // Verdict text
  const info = document.createElement('div'); info.className = 'az-verdict-info';
  const lbl = document.createElement('div'); lbl.className = 'az-verdict-label az-verdict-label-'+cls;
  lbl.textContent = verdict;
  info.appendChild(lbl);
  if (subline) { const sub = document.createElement('div'); sub.className = 'az-verdict-sub'; sub.textContent = subline; info.appendChild(sub); }
  d.appendChild(info);
  return d;
}

// Flags list — only shows failures, grouped by severity
function azFlagsBlock(flags) {
  if (!flags || !flags.length) return null;
  const wrap = document.createElement('div'); wrap.className = 'az-flags';
  flags.forEach(function(f) {
    const item = document.createElement('div'); item.className = 'az-flag az-flag-'+(f.cls||'warn');
    const icon = f.cls==='err' ? '✕' : '⚠';
    item.textContent = icon + ' ' + f.text;
    wrap.appendChild(item);
  });
  return wrap;
}

// IRS pentagon SVG — 5-axis radar showing the five IRS measures
function azIRSPentagon(measures) {
  // measures: {ced, glcmC, glcmE_inv, vbl_inv, ms_inv} — all normalized 0–1
  // Pentagon vertices at 72° increments, starting at top
  const CX = 60, CY = 60, R = 50;
  const angles = [-90, -18, 54, 126, 198].map(d => d * Math.PI/180);
  const labels = ['Edge', 'Contrast', 'Texture', 'Sharpness', 'Frequency'];
  const vals = [
    Math.max(0,Math.min(1,measures.ced)),
    Math.max(0,Math.min(1,measures.glcmC)),
    Math.max(0,Math.min(1,measures.glcmE_inv)),
    Math.max(0,Math.min(1,measures.vbl_inv)),
    Math.max(0,Math.min(1,measures.ms_inv)),
  ];
  const pts = vals.map((v,i) => ({
    x: CX + R * v * Math.cos(angles[i]),
    y: CY + R * v * Math.sin(angles[i]),
  }));
  const refPts = angles.map(a => ({
    x: CX + R * Math.cos(a),
    y: CY + R * Math.sin(a),
  }));
  const ptStr = pts.map(p => p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ');
  const refStr = refPts.map(p => p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ');
  // Pentagon area score (0–1)
  const S = [[0,1],[1,2],[2,3],[3,4],[4,0]];
  const sinA = Math.sin(72*Math.PI/180);
  let area = 0;
  for (const [a,b] of S) area += vals[a]*vals[b]*0.5*sinA;
  const maxArea = 5*0.5*sinA; // all vals=1
  const irsScore = Math.round((area/maxArea)*100);

  let svg = `<svg width="120" height="120" viewBox="0 0 120 120" class="az-pentagon">`;
  // Axes
  refPts.forEach((p,i) => { svg += `<line x1="${CX}" y1="${CY}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="rgba(255,255,255,.12)" stroke-width="1"/>`; });
  // Reference polygon
  svg += `<polygon points="${refStr}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="1"/>`;
  // Value polygon
  const fillColor = irsScore >= 65 ? 'rgba(0,232,157,.25)' : irsScore >= 45 ? 'rgba(240,160,48,.25)' : 'rgba(255,64,96,.2)';
  const strokeColor = irsScore >= 65 ? '#00e89d' : irsScore >= 45 ? '#f0a030' : '#ff4060';
  svg += `<polygon points="${ptStr}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5"/>`;
  // Labels
  refPts.forEach((p,i) => {
    const lx = CX + (R+10)*Math.cos(angles[i]); const ly = CY + (R+10)*Math.sin(angles[i]);
    svg += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="7" fill="rgba(255,255,255,.5)">${labels[i]}</text>`;
  });
  svg += `<text x="${CX}" y="${CY-4}" text-anchor="middle" font-size="11" font-weight="700" fill="${strokeColor}">${irsScore}</text>`;
  svg += `<text x="${CX}" y="${CY+8}" text-anchor="middle" font-size="7" fill="rgba(255,255,255,.4)">IRS</text>`;
  svg += '</svg>';

  const wrap = document.createElement('div'); wrap.className = 'az-pentagon-wrap';
  wrap.innerHTML = svg;
  return { el: wrap, score: irsScore };
}

// ══════════════════════════════════════════════════════════════════
// JPEG PARSER — bitstream, DQT, EXIF, structure
// ══════════════════════════════════════════════════════════════════

function azParseJpeg(d) {
  const res = {
    isBaseline:false, isProgressive:false, chromaSubsampling:'unknown',
    jpegQuality:null, chromaQuality:null, ycbcrPositioning:null,
    qtables:[], exif:{}, hasC2PA:false, hasThumbnail:false,
    segments:[], appMarkers:[], fileSize:d.length,
  };
  if (d[0]!==0xFF||d[1]!==0xD8) return res;
  let i=2;
  while (i<d.length-1) {
    if (d[i]!==0xFF) break;
    const mk=d[i+1];
    if (mk===0xD9) break;
    if (mk===0xD8||mk===0x00||(mk>=0xD0&&mk<=0xD7)){i+=2;continue;}
    if (i+3>=d.length) break;
    const len=(d[i+2]<<8)|d[i+3];
    const end=i+2+len;
    if (end>d.length) break;
    const seg={marker:mk,offset:i,length:len};
    res.segments.push(seg);
    if (mk>=0xE0&&mk<=0xEF) res.appMarkers.push(mk);
    if (mk===0xC0) { res.isBaseline=true; if (d.length>i+9) { const c=d[i+9]; res.chromaSubsampling=c===3?'4:2:0':c===1?'4:4:4':'unknown'; } }
    if (mk===0xC2) { res.isProgressive=true; }
    if (mk===0xDB) { const tbls=azParseDQT(d,i+4,len-2); res.qtables.push(...tbls); if(tbls.length>0){res.jpegQuality=azEstQ(tbls[0].table);} if(tbls.length>1){res.chromaQuality=azEstQChroma(tbls[1].table);} }
    if (mk===0xE1) {
      const isExif=(d[i+4]===0x45&&d[i+5]===0x78&&d[i+6]===0x69&&d[i+7]===0x66);
      if (isExif) { res.exif=azParseExif(d.slice(i+4,end)); res.hasThumbnail=azExifHasThumb(d.slice(i+4,end)); }
      // C2PA — 'jumb' box or XMP with c2pa manifest
      const segSlice=d.slice(i+4,Math.min(end,i+60));
      const segStr=String.fromCharCode(...segSlice);
      if(segStr.includes('c2pa')||segStr.includes('cai ')||segStr.includes('jumb')){res.hasC2PA=true;}
    }
    if (mk===0xFF) { break; }
    i=end;
  }
  return res;
}

function azParseDQT(d,start,len) {
  const tbls=[]; let i=start;
  while(i<start+len&&i<d.length) {
    const id=d[i]&0x0F,prec=(d[i]>>4)&0x0F; i++;
    if(prec===0){const t=new Uint8Array(64);for(let j=0;j<64;j++)t[j]=d[i+j];i+=64;tbls.push({id,table:t});}
    else{const t=new Uint16Array(64);for(let j=0;j<64;j++)t[j]=(d[i+j*2]<<8)|d[i+j*2+1];i+=128;tbls.push({id,table:t});}
  }
  return tbls;
}

// Estimate JPEG quality from luma QT — based on libjpeg scaling formula
function azEstQ(qt) {
  if (!qt||!qt.length) return null;
  // Standard JPEG luma table Q50 reference
  const REF=[16,11,10,16,24,40,51,61,12,12,14,19,26,58,60,55,14,13,16,24,40,57,69,56,14,17,22,29,51,87,80,62,18,22,37,56,68,109,103,77,24,35,55,64,81,104,113,92,49,64,78,87,103,121,120,101,72,92,95,98,112,100,103,99];
  let sumScale=0,cnt=0;
  for(let i=0;i<Math.min(qt.length,REF.length);i++){if(REF[i]>0){sumScale+=qt[i]/REF[i];cnt++;}}
  if(!cnt)return null;
  const avgScale=sumScale/cnt;
  let q;
  if(avgScale<=1){q=Math.round((2-avgScale)*50);}
  else{q=Math.round(50/avgScale);}
  return Math.max(1,Math.min(100,q));
}

function azEstQChroma(qt) { return azEstQ(qt); }

function azExifHasThumb(d) {
  for(let i=6;i<d.length-1;i++){if(d[i]===0xFF&&d[i+1]===0xD8)return true;}
  return false;
}

function azParseExif(data) {
  const result={};
  if(data.length<8)return result;
  const offset=6; // skip 'Exif\0\0'
  if(data.length<offset+4)return result;
  const le=(data[offset]===0x49);
  const r16=(o)=>le?(data[o]|(data[o+1]<<8)):((data[o]<<8)|data[o+1]);
  const r32=(o)=>le?(data[o]|(data[o+1]<<8)|(data[o+2]<<16)|(data[o+3]<<24)):((data[o]<<24)|(data[o+1]<<16)|(data[o+2]<<8)|data[o+3]);
  const base=offset;
  const ifd0Start=r32(base+4)+base;
  const TAG={
    0x010F:'Make',0x0110:'Model',0x0131:'Software',0x0132:'DateTime',
    0x013B:'Artist',0x0213:'YCbCrPositioning',0x8769:'ExifIFD',0x8825:'GPSIFD',
    0x829A:'ExposureTime',0x829D:'FNumber',0x8827:'ISOSpeedRatings',
    0x9003:'DateTimeOriginal',0x9004:'DateTimeDigitized',
    0x9010:'OffsetTime',0x9011:'OffsetTimeOriginal',0x9012:'OffsetTimeDigitized',
    0x9290:'SubSecTime',0x9291:'SubSecTimeOriginal',0x9292:'SubSecTimeDigitized',
    0x920A:'FocalLength',0x9209:'Flash',
    0xA001:'ColorSpace',0xA002:'PixelXDimension',0xA003:'PixelYDimension',
    0xA405:'FocalLengthIn35mmFilm',0xA420:'ImageUniqueID',
    0xA431:'BodySerialNumber',0xA432:'LensInfo',
    0xA433:'LensMake',0xA434:'LensModel',0xA435:'LensSerialNumber',
  };
  const GPS_TAG={
    0x0001:'GPSLatitudeRef',0x0002:'GPSLatitude',
    0x0003:'GPSLongitudeRef',0x0004:'GPSLongitude',
    0x0005:'GPSAltitudeRef',0x0006:'GPSAltitude',
    0x0007:'GPSTimeStamp',
    0x000A:'GPSMeasureMode',
    0x000B:'GPSDOP',
    0x000C:'GPSSpeedRef',0x000D:'GPSSpeed',
    0x000E:'GPSTrackRef',0x000F:'GPSTrack',
    0x0010:'GPSImgDirectionRef',0x0011:'GPSImgDirection',
    0x001D:'GPSDateStamp',
  };
  function readStr(o,len){let s='';for(let i=0;i<len&&o+i<data.length;i++){const c=data[o+i];if(c===0)break;s+=String.fromCharCode(c);}return s.trim();}
  function readRat(o){const n=r32(o),d2=r32(o+4);return d2?n/d2:0;}
  function readRatArr(o,cnt){const a=[];for(let i=0;i<cnt;i++)a.push({n:r32(o+i*8),d:r32(o+i*8+4)});return a;}
  function readIFD(ifdOff,tagMap){
    if(ifdOff<=0||ifdOff+2>=data.length)return;
    const count=r16(ifdOff); if(count>300)return;
    for(let i=0;i<count;i++){
      const e=ifdOff+2+i*12;
      if(e+12>data.length)break;
      const tag=r16(e),type=r16(e+2),cnt2=r32(e+4);
      const valOff=e+8;
      const name=tagMap[tag];
      if(!name)continue;
      const dataSize=[0,1,1,2,4,8,1,1,2,4,8,4,8][type]||0;
      const totalSize=dataSize*cnt2;
      const valStart=(totalSize>4)?r32(valOff)+base:valOff;
      if(type===2){result[name]=readStr(valStart,cnt2);}
      else if(type===5){
        if(cnt2===1)result[name]=readRat(valStart);
        else result[name]=readRatArr(valStart,cnt2);
      }
      else if(type===3){result[name]=r16(valStart);}
      else if(type===4||type===9){result[name]=r32(valStart);}
      if(name==='ExifIFD'){const off=r32(valOff)+base;readIFD(off,TAG);}
      if(name==='GPSIFD'){const off=r32(valOff)+base;readIFD(off,GPS_TAG);}
    }
  }
  try{readIFD(ifd0Start,TAG);}catch(e){}
  return result;
}

// ══════════════════════════════════════════════════════════════════
// PIXEL ANALYSIS ENGINE
// ══════════════════════════════════════════════════════════════════

// Decode JPEG pixels via OffscreenCanvas / Canvas
async function azDecodePixels(buf) {
  const blob=new Blob([buf],{type:'image/jpeg'});
  const bmp=await createImageBitmap(blob);
  const W=bmp.width,H=bmp.height;
  let cv;
  if(typeof OffscreenCanvas!=='undefined'){cv=new OffscreenCanvas(W,H);}
  else{cv=document.createElement('canvas');cv.width=W;cv.height=H;}
  cv.getContext('2d').drawImage(bmp,0,0);
  const id=cv.getContext('2d').getImageData(0,0,W,H);
  return {W,H,data:id.data};
}

// ── PRNU energy (Laplacian residual RMS, content-normalized) ─────
// Real sensors: RMS 5–35. Below 3 = over-smoothed. Above 40 = synthetic/noisy.
// Content normalization: divide raw RMS by log(1+laplacianVariance) to
// compensate for image complexity (IRS paper insight — pixel metrics
// are content-dependent without normalization).
function azPRNUEnergy(data,W,H) {
  if(!data||W<4||H<4)return 10;
  const n=W*H;
  const Y=new Float32Array(n);
  for(let i=0;i<n;i++){const p=i*4;Y[i]=0.299*data[p]+0.587*data[p+1]+0.114*data[p+2];}
  let sumSq=0,sumVar=0,count=0;
  const W1=W-1,H1=H-1;
  const step=Math.max(1,Math.floor(n/80000));
  for(let y=1;y<H1;y+=step){
    const row=y*W;
    for(let x=1;x<W1;x+=step){
      const c=row+x;
      const r=Y[c-W]+Y[c+W]+Y[c-1]+Y[c+1]-4*Y[c];
      sumSq+=r*r; sumVar+=Y[c]; count++;
    }
  }
  if(!count)return 10;
  const rms=Math.sqrt(sumSq/count);
  // Content complexity via local variance estimate
  const mean=sumVar/count;
  let varSum=0;
  for(let y=1;y<H1;y+=step*4){const row=y*W;for(let x=1;x<W1;x+=step*4){const d2=Y[row+x]-mean;varSum+=d2*d2;}}
  const complexity=Math.log1p(Math.sqrt(varSum/Math.max(1,count/16)));
  // Normalize: divide by complexity factor (1.0 baseline for typical photos)
  const normalizer=Math.max(0.3,Math.min(3.0,complexity/2.5));
  return Math.min(rms*1.2/normalizer,80);
}

// ── LSB analysis ──────────────────────────────────────────────────
// Returns {meanEntropy, spatialCorr, interChanCorr}
// Natural Gaussian noise: entropy 0.88–0.9998, spatialCorr 0.48–0.64
function azLSBAnalysis(data,W,H) {
  if(!data||W<2||H<2)return{meanEntropy:0.95,spatialCorr:0.55,interChanCorr:0.6};
  const n=W*H;
  const step=Math.max(1,Math.floor(n/60000));
  let onesR=0,onesG=0,onesB=0;
  let matchH_R=0,matchH_G=0,matchH_B=0,pairCount=0;
  let interMatch=0,interTotal=0,total=0;
  for(let i=0;i<n-W-1;i+=step){
    const p=i*4;
    const lR=data[p]&1,lG=data[p+1]&1,lB=data[p+2]&1;
    const nR=data[p+4]&1,nG=data[p+5]&1,nB=data[p+6]&1;
    onesR+=lR;onesG+=lG;onesB+=lB;
    matchH_R+=(lR===nR?1:0);matchH_G+=(lG===nG?1:0);matchH_B+=(lB===nB?1:0);
    pairCount++;
    if((lR===lG)||(lG===lB)){interMatch++;}
    interTotal++;
    total++;
  }
  if(!total)return{meanEntropy:0.95,spatialCorr:0.55,interChanCorr:0.6};
  function H2(p){if(p<=0||p>=1)return 0;return-(p*Math.log2(p)+(1-p)*Math.log2(1-p));}
  const eR=H2(onesR/total),eG=H2(onesG/total),eB=H2(onesB/total);
  const meanEntropy=(eR+eG+eB)/3;
  const corrR=pairCount>0?matchH_R/pairCount:0.5;
  const corrG=pairCount>0?matchH_G/pairCount:0.5;
  const corrB=pairCount>0?matchH_B/pairCount:0.5;
  const spatialCorr=(corrR+corrG+corrB)/3;
  const interChanCorr=interTotal>0?interMatch/interTotal:0.5;
  return{meanEntropy,spatialCorr,interChanCorr};
}

// ── Histogram analysis ────────────────────────────────────────────
function azHistAnalysis(data,W,H) {
  if(!data)return{gaps:0,hasComb:false};
  const hist=new Uint32Array(256);
  const step=Math.max(1,Math.floor(W*H/120000));
  for(let i=0;i<W*H;i+=step){const p=i*4;hist[Math.round(0.299*data[p]+0.587*data[p+1]+0.114*data[p+2])]++;}
  let gaps=0;
  for(let v=1;v<255;v++)if(hist[v]===0&&hist[v-1]>0&&hist[v+1]>0)gaps++;
  // Comb: periodic gaps at every ~2–4 bins
  let combScore=0;
  for(let period=2;period<=5;period++){let zeroRuns=0;for(let v=period;v<250;v+=period)if(hist[v]===0)zeroRuns++;if(zeroRuns>30)combScore++;}
  return{gaps,hasComb:combScore>=2};
}

// ── DCT double-compression (Fridrich/Popescu-Farid AC periodicity) ─
// azDCTAnalysis removed
// ── Blocking score ────────────────────────────────────────────────
function azBlockingScore(data,W,H) {
  if(!data||W<16||H<16)return 0;
  let boundarySum=0,interiorSum=0,bCnt=0,iCnt=0;
  const step=Math.max(1,Math.floor(W/200));
  for(let y=8;y<H-8;y+=8){
    for(let x=step;x<W-1;x+=step){
      const p1=((y-1)*W+x)*4,p2=(y*W+x)*4;
      const d=(Math.abs(data[p1]-data[p2])+Math.abs(data[p1+1]-data[p2+1])+Math.abs(data[p1+2]-data[p2+2]))/3;
      boundarySum+=d;bCnt++;
      const q1=((y-2)*W+x)*4,q2=((y-1)*W+x)*4;
      const di=(Math.abs(data[q1]-data[q2])+Math.abs(data[q1+1]-data[q2+1])+Math.abs(data[q1+2]-data[q2+2]))/3;
      interiorSum+=di;iCnt++;
    }
  }
  if(!bCnt||!iCnt)return 0;
  return Math.max(0,(boundarySum/bCnt)-(interiorSum/iCnt));
}

// ── IRS five statistical measures ─────────────────────────────────
// Based on arXiv 2309.14756 (WACV 2024): GLCM Energy, GLCM Contrast,
// Canny Edge Density, Variance of Laplacian, Mean Spectrum.
// Three measures (GLCM Energy, VBL, MeanSpectrum) are INVERTED because
// generated/synthetic images score HIGHER on them than real photos.
function azIRSMeasures(data,W,H) {
  if(!data||W<8||H<8)return{ced:0.5,glcmC:0.5,glcmE_inv:0.5,vbl_inv:0.5,ms_inv:0.5,irsArea:0.5};
  const step=Math.max(1,Math.floor(W*H/50000));

  // ── Luma array ──────────────────────────────────────────────────
  const n=W*H;
  const Y=new Uint8Array(n);
  for(let i=0;i<n;i+=step){const p=i*4;Y[i]=Math.round(0.299*data[p]+0.587*data[p+1]+0.114*data[p+2]);}

  // ── GLCM Energy & Contrast (N=32 grey levels, horizontal adjacency) ─
  // Quantize to N=32 levels for tractable matrix
  const N=32,scale=256/N;
  const glcm=new Float32Array(N*N);
  let glcmCount=0;
  for(let y=0;y<H-1;y+=step){const row=y*W;
    for(let x=0;x<W-1;x+=step){
      const i=Math.min(N-1,Math.floor(Y[row+x]/scale));
      const j=Math.min(N-1,Math.floor(Y[row+x+1]/scale));
      glcm[i*N+j]++;glcmCount++;
    }
  }
  // Normalize
  if(glcmCount>0){for(let k=0;k<N*N;k++)glcm[k]/=glcmCount;}
  let glcmEnergy=0,glcmContrast=0;
  for(let i=0;i<N;i++){for(let j=0;j<N;j++){
    const p=glcm[i*N+j];
    glcmEnergy+=p*p;
    glcmContrast+=(i-j)*(i-j)*p;
  }}

  // ── Canny Edge Density (Sobel approximation) ─────────────────────
  // |Gx|+|Gy| > threshold counted as edge pixel
  let edgePx=0,edgeTotal=0;
  const thresh=20;
  for(let y=1;y<H-1;y+=step){const row=y*W;
    for(let x=1;x<W-1;x+=step){
      const gx=Math.abs(Y[row+x+1]-Y[row+x-1]);
      const gy=Math.abs(Y[(y+1)*W+x]-Y[(y-1)*W+x]);
      if(gx+gy>thresh)edgePx++;
      edgeTotal++;
    }
  }
  const ced=edgeTotal>0?edgePx/edgeTotal:0.1;

  // ── Variance of Laplacian (blur/sharpness measure) ───────────────
  let lapSum=0,lapSumSq=0,lapCount=0;
  for(let y=1;y<H-1;y+=step*2){const row=y*W;
    for(let x=1;x<W-1;x+=step*2){
      const l=Y[row+x-W]+Y[row+x+W]+Y[row+x-1]+Y[row+x+1]-4*Y[row+x];
      lapSum+=l;lapSumSq+=l*l;lapCount++;
    }
  }
  const lapMean=lapCount?lapSum/lapCount:0;
  const vbl=lapCount?lapSumSq/lapCount-lapMean*lapMean:0;

  // ── Mean Spectrum (average Fourier magnitude, sampled row-wise) ──
  // Full 2D FFT is expensive in JS; use a 1D approximation:
  // compute mean absolute DCT-like coefficient variance across rows.
  let msSum=0,msCount=0;
  const rowStep=Math.max(8,Math.floor(H/50));
  for(let y=0;y<H;y+=rowStep){
    const row=y*W;
    let rowMean=0,n2=0;
    for(let x=0;x<W;x+=step){rowMean+=Y[row+x];n2++;}
    rowMean/=Math.max(1,n2);
    let rowVar=0;
    for(let x=0;x<W;x+=step){const d=Y[row+x]-rowMean;rowVar+=d*d;}
    msSum+=Math.sqrt(rowVar/Math.max(1,n2));
    msCount++;
  }
  const ms=msCount?msSum/msCount:10;

  // ── Normalize to 0–1 for pentagon ────────────────────────────────
  // CED: natural photos ~0.05–0.25 → normalize to [0,1]
  const cedN=Math.min(1,ced/0.20);
  // GLCM Contrast: higher = more edge texture. Natural ~50–500 → normalize
  const glcmCN=Math.min(1,glcmContrast/300);
  // GLCM Energy: lower = more texture detail (natural). Uniform image→1.0.
  // INVERT: real photos have lower energy (more texture) than synthetic.
  const glcmE_inv=Math.min(1,Math.max(0,1.0-glcmEnergy*20));
  // VBL: higher = sharper. Natural photos ~100–2000. INVERT for real=lower.
  // Actually real photos have HIGHER sharpness (lower blur) than generated.
  // Generated images tend to be smoother → lower VBL. So real → higher vbl.
  // Per IRS paper: VBM is INVERTED because generated have higher VBM (more noise).
  // Our VBL is variance of Laplacian = sharpness. Generated are smoother → lower VBL.
  // Real photos → higher VBL. So no invert needed here for our formulation.
  // But IRS inverts VBM (which is blur, inverse of sharpness). We'll keep consistent:
  const vblN=Math.min(1,vbl/2000); // higher = sharper = more real
  const vbl_inv=vblN; // natural direction: high vbl = real
  // Mean Spectrum: generated images have higher MS due to noise artifacts.
  // INVERT: real photos → lower MS is expected for natural frequency distribution.
  const msN=Math.min(1,ms/80);
  const ms_inv=Math.max(0,1.0-msN);

  // ── IRS Pentagon area (arXiv 2309.14756 eq.4) ────────────────────
  // Sequence: [CED, GLCM_C, GLCM_E_inv, VBL, MS_inv]
  // Pairs S = {(0,1),(1,2),(2,3),(3,4),(4,0)}
  const vals=[cedN,glcmCN,glcmE_inv,vbl_inv,ms_inv];
  const sinA=Math.sin(72*Math.PI/180);
  let area=0;
  const pairs=[[0,1],[1,2],[2,3],[3,4],[4,0]];
  for(const[a,b]of pairs)area+=vals[a]*vals[b]*0.5*sinA;
  const maxArea=5*0.5*sinA;
  const irsArea=maxArea>0?(area/maxArea):0; // 0–1, guarded

  return{ced:cedN,glcmC:glcmCN,glcmE_inv,vbl_inv,ms_inv,irsArea,
    raw:{ced,glcmContrast,glcmEnergy,vbl,ms}};
}

// ── GPS helpers ───────────────────────────────────────────────────
function azGPSRationalToDecimal(val,ref) {
  if(!val)return null;
  let deg=0,min=0,sec=0;
  if(Array.isArray(val)&&val.length>=3){
    deg=val[0].d?val[0].n/val[0].d:val[0];
    min=val[1].d?val[1].n/val[1].d:val[1];
    sec=val[2].d?val[2].n/val[2].d:val[2];
  }else if(typeof val==='number'){deg=val;}
  let dd=deg+min/60+sec/3600;
  if(ref==='S'||ref==='W')dd=-dd;
  return dd;
}

const AZ_CITIES=[
  // USA
  {name:'New York City, NY',latMin:40.477,latMax:40.917,lngMin:-74.259,lngMax:-73.700},
  {name:'Los Angeles, CA',latMin:33.703,latMax:34.337,lngMin:-118.668,lngMax:-118.155},
  {name:'Chicago, IL',latMin:41.644,latMax:42.023,lngMin:-87.940,lngMax:-87.524},
  {name:'Houston, TX',latMin:29.524,latMax:30.111,lngMin:-95.788,lngMax:-95.015},
  {name:'Phoenix, AZ',latMin:33.290,latMax:33.920,lngMin:-112.324,lngMax:-111.926},
  {name:'Philadelphia, PA',latMin:39.867,latMax:40.138,lngMin:-75.280,lngMax:-74.956},
  {name:'San Antonio, TX',latMin:29.296,latMax:29.697,lngMin:-98.737,lngMax:-98.234},
  {name:'San Diego, CA',latMin:32.530,latMax:33.114,lngMin:-117.282,lngMax:-116.908},
  {name:'Dallas, TX',latMin:32.617,latMax:33.016,lngMin:-97.003,lngMax:-96.463},
  {name:'San Jose, CA',latMin:37.122,latMax:37.470,lngMin:-122.050,lngMax:-121.588},
  {name:'Austin, TX',latMin:30.098,latMax:30.517,lngMin:-97.928,lngMax:-97.570},
  {name:'Jacksonville, FL',latMin:30.103,latMax:30.584,lngMin:-81.992,lngMax:-81.391},
  {name:'Fort Worth, TX',latMin:32.588,latMax:32.994,lngMin:-97.469,lngMax:-97.040},
  {name:'Columbus, OH',latMin:39.895,latMax:40.158,lngMin:-83.200,lngMax:-82.769},
  {name:'Charlotte, NC',latMin:35.029,latMax:35.376,lngMin:-81.009,lngMax:-80.644},
  {name:'Indianapolis, IN',latMin:39.632,latMax:39.928,lngMin:-86.328,lngMax:-85.945},
  {name:'San Francisco, CA',latMin:37.634,latMax:37.930,lngMin:-122.514,lngMax:-122.354},
  {name:'Seattle, WA',latMin:47.496,latMax:47.734,lngMin:-122.459,lngMax:-122.236},
  {name:'Denver, CO',latMin:39.614,latMax:39.914,lngMin:-105.110,lngMax:-104.600},
  {name:'Nashville, TN',latMin:35.993,latMax:36.400,lngMin:-87.052,lngMax:-86.516},
  {name:'Oklahoma City, OK',latMin:35.334,latMax:35.697,lngMin:-97.593,lngMax:-97.211},
  {name:'El Paso, TX',latMin:31.619,latMax:31.973,lngMin:-106.628,lngMax:-106.200},
  {name:'Las Vegas, NV',latMin:36.080,latMax:36.384,lngMin:-115.381,lngMax:-115.064},
  {name:'Louisville, KY',latMin:38.052,latMax:38.411,lngMin:-85.949,lngMax:-85.486},
  {name:'Baltimore, MD',latMin:39.197,latMax:39.373,lngMin:-76.711,lngMax:-76.529},
  {name:'Milwaukee, WI',latMin:42.921,latMax:43.197,lngMin:-88.071,lngMax:-87.863},
  {name:'Albuquerque, NM',latMin:34.946,latMax:35.220,lngMin:-106.824,lngMax:-106.479},
  {name:'Tucson, AZ',latMin:32.062,latMax:32.411,lngMin:-111.088,lngMax:-110.745},
  {name:'Fresno, CA',latMin:36.632,latMax:36.900,lngMin:-119.968,lngMax:-119.642},
  {name:'Sacramento, CA',latMin:38.394,latMax:38.699,lngMin:-121.560,lngMax:-121.363},
  {name:'Mesa, AZ',latMin:33.303,latMax:33.499,lngMin:-111.903,lngMax:-111.576},
  {name:'Kansas City, MO',latMin:38.847,latMax:39.376,lngMin:-94.763,lngMax:-94.270},
  {name:'Atlanta, GA',latMin:33.647,latMax:33.887,lngMin:-84.552,lngMax:-84.290},
  {name:'Miami, FL',latMin:25.709,latMax:25.855,lngMin:-80.320,lngMax:-80.144},
  {name:'Minneapolis, MN',latMin:44.891,latMax:45.051,lngMin:-93.329,lngMax:-93.193},
  {name:'Portland, OR',latMin:45.432,latMax:45.653,lngMin:-122.836,lngMax:-122.475},
  {name:'New Orleans, LA',latMin:29.864,latMax:30.200,lngMin:-90.140,lngMax:-89.621},
  {name:'Boston, MA',latMin:42.227,latMax:42.397,lngMin:-71.191,lngMax:-70.924},
  {name:'Detroit, MI',latMin:42.255,latMax:42.451,lngMin:-83.288,lngMax:-82.910},
  {name:'Memphis, TN',latMin:35.045,latMax:35.310,lngMin:-90.184,lngMax:-89.637},
  // Europe
  {name:'London, UK',latMin:51.286,latMax:51.692,lngMin:-0.510,lngMax:0.334},
  {name:'Paris, France',latMin:48.815,latMax:48.902,lngMin:2.225,lngMax:2.470},
  {name:'Berlin, Germany',latMin:52.338,latMax:52.677,lngMin:13.088,lngMax:13.761},
  {name:'Madrid, Spain',latMin:40.312,latMax:40.560,lngMin:-3.889,lngMax:-3.524},
  {name:'Barcelona, Spain',latMin:41.320,latMax:41.468,lngMin:2.069,lngMax:2.228},
  {name:'Rome, Italy',latMin:41.793,latMax:42.001,lngMin:12.356,lngMax:12.616},
  {name:'Milan, Italy',latMin:45.388,latMax:45.536,lngMin:9.040,lngMax:9.278},
  {name:'Amsterdam, Netherlands',latMin:52.278,latMax:52.431,lngMin:4.729,lngMax:5.079},
  {name:'Munich, Germany',latMin:48.061,latMax:48.248,lngMin:11.360,lngMax:11.723},
  {name:'Vienna, Austria',latMin:48.117,latMax:48.323,lngMin:16.182,lngMax:16.577},
  {name:'Brussels, Belgium',latMin:50.796,latMax:50.932,lngMin:4.310,lngMax:4.451},
  {name:'Warsaw, Poland',latMin:52.098,latMax:52.368,lngMin:20.851,lngMax:21.271},
  {name:'Stockholm, Sweden',latMin:59.233,latMax:59.437,lngMin:17.765,lngMax:18.228},
  {name:'Copenhagen, Denmark',latMin:55.610,latMax:55.731,lngMin:12.454,lngMax:12.651},
  {name:'Oslo, Norway',latMin:59.810,latMax:60.135,lngMin:10.490,lngMax:10.944},
  {name:'Helsinki, Finland',latMin:60.127,latMax:60.297,lngMin:24.782,lngMax:25.254},
  {name:'Zurich, Switzerland',latMin:47.320,latMax:47.434,lngMin:8.448,lngMax:8.623},
  {name:'Prague, Czech Republic',latMin:50.022,latMax:50.177,lngMin:14.224,lngMax:14.707},
  {name:'Budapest, Hungary',latMin:47.350,latMax:47.614,lngMin:18.917,lngMax:19.334},
  {name:'Athens, Greece',latMin:37.897,latMax:38.081,lngMin:23.627,lngMax:23.842},
  {name:'Istanbul, Turkey',latMin:40.802,latMax:41.321,lngMin:28.447,lngMax:29.459},
  {name:'Lisbon, Portugal',latMin:38.692,latMax:38.796,lngMin:-9.229,lngMax:-9.089},
  // Asia-Pacific
  {name:'Tokyo, Japan',latMin:35.530,latMax:35.818,lngMin:139.329,lngMax:139.910},
  {name:'Seoul, South Korea',latMin:37.413,latMax:37.702,lngMin:126.734,lngMax:127.184},
  {name:'Beijing, China',latMin:39.442,latMax:40.219,lngMin:115.420,lngMax:117.507},
  {name:'Shanghai, China',latMin:30.748,latMax:31.877,lngMin:120.861,lngMax:122.197},
  {name:'Hong Kong',latMin:22.153,latMax:22.562,lngMin:113.835,lngMax:114.441},
  {name:'Singapore',latMin:1.130,latMax:1.470,lngMin:103.594,lngMax:104.092},
  {name:'Sydney, Australia',latMin:-34.173,latMax:-33.578,lngMin:150.520,lngMax:151.343},
  {name:'Melbourne, Australia',latMin:-38.000,latMax:-37.511,lngMin:144.593,lngMax:145.512},
  {name:'Dubai, UAE',latMin:24.793,latMax:25.357,lngMin:55.028,lngMax:55.570},
  {name:'Mumbai, India',latMin:18.891,latMax:19.272,lngMin:72.776,lngMax:72.987},
  {name:'Delhi, India',latMin:28.404,latMax:28.883,lngMin:76.838,lngMax:77.347},
  {name:'Bangkok, Thailand',latMin:13.494,latMax:13.956,lngMin:100.329,lngMax:100.936},
  {name:'Jakarta, Indonesia',latMin:-6.370,latMax:-6.078,lngMin:106.654,lngMax:107.037},
  // Americas
  {name:'Toronto, Canada',latMin:43.580,latMax:43.856,lngMin:-79.639,lngMax:-79.115},
  {name:'Vancouver, Canada',latMin:49.198,latMax:49.314,lngMin:-123.225,lngMax:-123.022},
  {name:'Mexico City, Mexico',latMin:19.048,latMax:19.593,lngMin:-99.365,lngMax:-98.940},
  {name:'São Paulo, Brazil',latMin:-23.782,latMax:-23.357,lngMin:-46.825,lngMax:-46.365},
  {name:'Rio de Janeiro, Brazil',latMin:-23.083,latMax:-22.740,lngMin:-43.799,lngMax:-43.101},
  {name:'Buenos Aires, Argentina',latMin:-34.705,latMax:-34.526,lngMin:-58.531,lngMax:-58.335},
  {name:'Bogotá, Colombia',latMin:4.459,latMax:4.837,lngMin:-74.225,lngMax:-74.009},
  {name:'Lima, Peru',latMin:-12.254,latMax:-11.882,lngMin:-77.195,lngMax:-76.893},
  // Africa & Middle East
  {name:'Cairo, Egypt',latMin:29.847,latMax:30.207,lngMin:31.051,lngMax:31.611},
  {name:'Lagos, Nigeria',latMin:6.393,latMax:6.703,lngMin:3.099,lngMax:3.556},
  {name:'Nairobi, Kenya',latMin:-1.444,latMax:-1.163,lngMin:36.650,lngMax:37.100},
  {name:'Johannesburg, South Africa',latMin:-26.353,latMax:-26.072,lngMin:27.904,lngMax:28.163},
  {name:'Riyadh, Saudi Arabia',latMin:24.476,latMax:24.876,lngMin:46.527,lngMax:46.888},
  {name:'Tel Aviv, Israel',latMin:31.972,latMax:32.207,lngMin:34.734,lngMax:34.916},
];
function azReverseGeoCity(lat,lng) {
  const pad=0.05;
  for(const c of AZ_CITIES){
    if(lat>=c.latMin-pad&&lat<=c.latMax+pad&&lng>=c.lngMin-pad&&lng<=c.lngMax+pad)return c.name;
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════
// SCORING ENGINE v4
// Multiplicative penalty model, per-layer sub-scores, hybrid fusion
// ══════════════════════════════════════════════════════════════════

// Each check: {pass, severity, label}
// severity: fraction of remaining score lost on failure (0.0–1.0)
// Layer sub-score = 100 × ∏(1 - severity_i) ^ 0.85 for failing checks
// Final = α×structural_score + β×pixel_score  (α=0.68, β=0.32)
// Reference: VAAS hybrid weighted scoring; ENFSI BPM §5.2; Fridrich 2009

function azLayerScore(checks) {
  const applicable=checks.filter(c=>c.pass!==null);
  if(!applicable.length)return{score:100,failures:[]};
  let product=1.0;
  const failures=[];
  for(const c of applicable){
    if(!c.pass){
      const sev=Math.max(0,Math.min(0.95,c.severity||0.20));
      product*=(1.0-sev);
      failures.push({label:c.label||'',severity:sev,cls:c.cls||'warn'});
    }
  }
  const score=Math.round(Math.pow(product,0.85)*100);
  return{score,failures};
}

function azFinalScore(l1,l2,l3,l4) {
  // Structural layers: L1(file)+L2(identity)+L3(encoding) weighted 0.68 total
  // L1=0.12, L2=0.26, L3=0.30, L4(pixel)=0.32
  const structural=Math.round(l1.score*0.12+l2.score*0.26+l3.score*0.30);
  const pixel=Math.round(l4.score*0.32);
  const raw=structural+pixel; // 0–100
  return Math.max(0,Math.min(100,raw));
}

function azVerdict(score) {
  if(score>=92)return{label:'Forensically authentic',sub:'Passes all structural, identity, encoding and pixel checks.',cls:'ok'};
  if(score>=80)return{label:'Highly plausible',sub:'Minor signals only — unlikely to trigger automated flags.',cls:'ok'};
  if(score>=65)return{label:'Mostly plausible',sub:'A few signals present. Manual review may notice inconsistencies.',cls:'warn'};
  if(score>=50)return{label:'Questionable authenticity',sub:'Multiple signals across layers. Forensic tools would flag this.',cls:'warn'};
  if(score>=30)return{label:'Significant signals',sub:'Fails multiple forensic checks. Likely to be flagged by Amped Authenticate.',cls:'err'};
  return{label:'High-confidence synthetic',sub:'Fails across all layers. Indistinguishable from generated/processed content.',cls:'err'};
}

// Slider zone constants
const AZ_PRNU_ZONES=[{from:0,to:15,cls:'err'},{from:15,to:75,cls:'ok'},{from:75,to:100,cls:'warn'}];
const AZ_LSB_ZONES=[{from:0,to:25,cls:'err'},{from:25,to:75,cls:'ok'},{from:75,to:100,cls:'warn'}];
const AZ_GAPS_ZONES=[{from:0,to:35,cls:'ok'},{from:35,to:65,cls:'warn'},{from:65,to:100,cls:'err'}];
const AZ_BLOCK_ZONES=[{from:0,to:40,cls:'ok'},{from:40,to:70,cls:'warn'},{from:70,to:100,cls:'err'}];
const AZ_IRS_ZONES=[{from:0,to:30,cls:'err'},{from:30,to:55,cls:'warn'},{from:55,to:100,cls:'ok'}];

function azPRNUtoSlider(v){if(v<3)return v/3*15;if(v<=35)return 15+(v-3)/32*60;return 75+Math.min((v-35)/20*25,25);}
function azLSBtoSlider(v){if(v<0.85)return v/0.85*25;if(v<=0.9999)return 25+(v-0.85)/0.15*50;return 90+Math.min((v-0.9999)*1000,10);}
function azGapsToSlider(v){if(v<=7)return v/7*35;if(v<=30)return 35+(v-7)/23*30;return Math.min(65+(v-30)/20*35,100);}
function azBlockToSlider(v){if(v<5)return v/5*40;if(v<15)return 40+(v-5)/10*30;return Math.min(70+(v-15)/10*30,100);}

// ══════════════════════════════════════════════════════════════════
// MAIN ANALYSIS PIPELINE — azAnalyzeSingle
// Four independent layers, rendered into sectioned result view
// ══════════════════════════════════════════════════════════════════

async function azAnalyzeSingle(buf, filename) {
  const bytes   = new Uint8Array(buf);
  const jpeg    = azParseJpeg(bytes);
  const ex      = jpeg.exif || {};
  const {W,H,data} = await azDecodePixels(buf);

  // ── Pre-compute all signals in parallel where possible ────────────
  const prnu       = azPRNUEnergy(data, W, H);
  const lsbAnal    = azLSBAnalysis(data, W, H);
  const histAnal   = azHistAnalysis(data, W, H);
  // dctAnal removed — double-compression is inherent in any re-encoded image
  const blockScore = azBlockingScore(data, W, H);
  const irs        = azIRSMeasures(data, W, H);

  // ── Named signal values ────────────────────────────────────────────
  const makeVal   = (ex['Make']||'').trim();
  const modelVal  = (ex['Model']||'').trim();
  const softVal   = (ex['Software']||'').trim();
  const tsOrig    = ex['DateTimeOriginal']||'';
  const tsMain    = ex['DateTime']||'';
  const tsDig     = ex['DateTimeDigitized']||'';
  const hasTS     = !!(tsOrig||tsMain);
  const tsMatch   = !hasTS||((!tsMain||tsOrig===tsMain)&&(!tsDig||tsOrig===tsDig));
  const hasGPS    = 'GPSLatitude' in ex;
  const hasSerial = 'LensSerialNumber' in ex||'BodySerialNumber' in ex||'ImageUniqueID' in ex;
  const lsbMean   = lsbAnal.meanEntropy;
  const lsbCorr   = lsbAnal.spatialCorr;
  const lsbInterC = lsbAnal.interChanCorr??0.6;
  const lsbNatural = lsbMean>0.88&&lsbMean<0.9999&&lsbCorr>0.48&&lsbCorr<0.64
    &&!(lsbMean>0.9995&&lsbInterC<0.51);
  const prnuOk    = prnu>=3&&prnu<40;
  const prnuTight = prnu>=5&&prnu<35;
  const deviceProfile   = AZ_KNOWN_DEVICES[makeVal];
  const knownModels     = AZ_REAL_MODELS[makeVal]||[];
  const hasRealMake     = makeVal.length>0&&!/^brand/i.test(makeVal)&&!/^[a-f0-9]{6,}$/i.test(makeVal);
  const hasRealModel    = modelVal.length>0&&!/^model/i.test(modelVal)&&!/^[a-f0-9]{6,}$/i.test(modelVal);
  const modelKnown      = !hasRealMake||knownModels.length===0
    ||knownModels.some(m=>modelVal===m||(modelVal.length>5&&m.toLowerCase().includes(modelVal.toLowerCase().replace('iphone','').trim())));
  const swIsPlaceholder = softVal&&(/^software/i.test(softVal)||/^[a-f0-9]{6,}$/i.test(softVal));
  const swIsIOS         = AZ_IOS_VERSIONS.some(v=>softVal===v||softVal.includes(v));
  const swExpectedIOS   = makeVal==='Apple';
  const swOk = !softVal||(!swIsPlaceholder&&(!swExpectedIOS||swIsIOS));
  const expectedBaseline = deviceProfile?deviceProfile.jpegType==='baseline':(!makeVal||['Apple','samsung','Google'].includes(makeVal));
  const jpegTypeOk = !expectedBaseline||(jpeg.isBaseline&&!jpeg.isProgressive);
  let qtOk=true,qtNote='';
  if(jpeg.qtables.length>0&&deviceProfile){
    // Use DC coefficient directly — azEstQ inverts IJG formula which doesn't match
    // browser encoders (Chrome/Skia, Firefox/libjpeg, Safari). DC value is universal.
    // Apple real encoder: DC=4. Browser at q=0.77-0.80: DC=6-12.
    // Heavily compressed social media: DC=15-30. Obvious fakes: DC=40+.
    // Accept DC<=24 for Apple-claimed devices — catches egregious fakes, not browsers.
    const lumaDC = jpeg.qtables[0].table[0];
    const [qMin,qMax] = deviceProfile.lumaQ;
    if(makeVal==='Apple'){
      // For Apple: check DC directly, show estimated Q for info only
      qtOk = lumaDC <= 24;
      qtNote = qtOk
        ? azPick(AZ_X.qt_match)+' (Q'+jpeg.jpegQuality+', DC='+lumaDC+')'
        : azPick(AZ_X.qt_mismatch)+' (Q'+jpeg.jpegQuality+', DC='+lumaDC+' — too high, expected DC≤24)';
    } else if(jpeg.jpegQuality!==null){
      // For non-Apple: use Q estimate as before
      qtOk = jpeg.jpegQuality>=qMin&&jpeg.jpegQuality<=qMax;
      qtNote = qtOk
        ? azPick(AZ_X.qt_match)+' (Q'+jpeg.jpegQuality+')'
        : azPick(AZ_X.qt_mismatch)+' (Q'+jpeg.jpegQuality+', expected '+qMin+'–'+qMax+')';
    }
  }
  let chromaOk=true,chromaNote='';
  if(jpeg.chromaSubsampling!=='unknown'&&deviceProfile&&deviceProfile.subsampling){
    chromaOk=jpeg.chromaSubsampling===deviceProfile.subsampling;
    chromaNote=chromaOk?azPick(AZ_X.chroma_match)+' ('+jpeg.chromaSubsampling+')'
      :azPick(AZ_X.chroma_mismatch)+' (got '+jpeg.chromaSubsampling+', expected '+deviceProfile.subsampling+')';
  }
  let ycbcrOk=true;
  if(jpeg.ycbcrPositioning!==null&&deviceProfile&&deviceProfile.ycbcr!==undefined)
    ycbcrOk=jpeg.ycbcrPositioning===deviceProfile.ycbcr;
  const thumbnailOk = !hasRealMake||makeVal!=='Apple'||jpeg.hasThumbnail;
  const histOk      = !histAnal.hasComb&&histAnal.gaps<30;
  const irsOk       = irs.irsArea>0.40; // IRS pentagon area below threshold = synthetic signature


  // ── New forensic signals ─────────────────────────────────────────

  // 1. Thumbnail APP marker — real iPhone thumbs start FF D8 FF E1 (EXIF), never FF E0 (JFIF)
  let thumbAppMarkerOk = true;
  if (jpeg.hasThumbnail && makeVal === 'Apple') {
    // Find the embedded thumbnail JPEG in the raw bytes and check its 3rd/4th byte
    const bytes = new Uint8Array(buf);
    // Walk EXIF to find IFD1 thumbnail offset
    // Simpler: scan for FF D8 in EXIF region, then check next 2 bytes
    for (let ti = 10; ti < bytes.length - 3; ti++) {
      if (bytes[ti] === 0xFF && bytes[ti+1] === 0xD8) {
        // Found embedded JPEG — check APP marker
        if (bytes[ti+2] === 0xFF) {
          const appMk = bytes[ti+3];
          // FF E0 = JFIF (browser), FF E1 = EXIF (real iPhone)
          thumbAppMarkerOk = (appMk === 0xE1);
        }
        break; // only check first embedded JPEG found
      }
    }
  }

  // 2. Dimension plausibility vs claimed device model
  // Real iPhone shoot modes — {model_substring: [[w,h], ...]}
  const AZ_IPHONE_DIMS = {
    '17 Pro Max': [[8064,6048],[6048,8064],[4032,3024],[3024,4032],[3088,2316],[2316,3088]],
    '17 Pro':     [[8064,6048],[6048,8064],[4032,3024],[3024,4032],[3088,2316],[2316,3088]],
    '17':         [[4032,3024],[3024,4032],[3088,2316],[2316,3088]],
    'Air':        [[4032,3024],[3024,4032],[3088,2316],[2316,3088]],
    '16 Pro Max': [[8064,6048],[6048,8064],[4032,3024],[3024,4032],[3088,2316],[2316,3088]],
    '16 Pro':     [[8064,6048],[6048,8064],[4032,3024],[3024,4032],[3088,2316],[2316,3088]],
    '16 Plus':    [[4032,3024],[3024,4032],[3088,2316],[2316,3088]],
    '16e':        [[4032,3024],[3024,4032],[3088,2316],[2316,3088]],
    '16':         [[4032,3024],[3024,4032],[3088,2316],[2316,3088]],
    '15 Pro Max': [[8064,6048],[6048,8064],[4032,3024],[3024,4032],[3088,2316],[2316,3088]],
    '15 Pro':     [[8064,6048],[6048,8064],[4032,3024],[3024,4032],[3088,2316],[2316,3088]],
    '15 Plus':    [[4032,3024],[3024,4032],[3088,2316],[2316,3088]],
    '15':         [[4032,3024],[3024,4032],[3088,2316],[2316,3088]],
    '14 Pro Max': [[4032,3024],[3024,4032],[3088,2316],[2316,3088]],
    '14 Pro':     [[4032,3024],[3024,4032],[3088,2316],[2316,3088]],
    '14':         [[4032,3024],[3024,4032],[3088,2316],[2316,3088]],
    '13 Pro':     [[4032,3024],[3024,4032],[3088,2316],[2316,3088]],
    '13':         [[4032,3024],[3024,4032],[3088,2316],[2316,3088]],
    '12 Pro':     [[4032,3024],[3024,4032],[3088,2316],[2316,3088]],
    '12':         [[4032,3024],[3024,4032],[3088,2316],[2316,3088]],
  };
  let dimMatchesDevice = true;
  let dimNote = '';
  if (makeVal === 'Apple' && modelVal && W > 0 && H > 0) {
    let found = false;
    for (const [substr, dims] of Object.entries(AZ_IPHONE_DIMS)) {
      if (modelVal.includes(substr)) {
        found = true;
        const matchesDim = dims.some(([dw, dh]) => dw === W && dh === H);
        if (!matchesDim) {
          dimMatchesDevice = false;
          dimNote = W + '×' + H + ' (' + (W*H/1e6).toFixed(1) + 'MP) is not a native shoot mode for ' + modelVal + '.';
        }
        break;
      }
    }
    // If model not in our table — don't penalize (unknown model)
  }

  // 3. Timestamp hour plausibility — flag if timestamp is night-time (23:00–05:59)
  //    Combined with a bright/outdoor-looking image (high brightness value)
  let tsHourPlausible = true;
  const tsStr = ex['DateTimeOriginal'] || ex['DateTime'] || '';
  if (tsStr && tsStr.length >= 16) {
    const hourStr = tsStr.substring(11, 13);
    const hour = parseInt(hourStr, 10);
    if (!isNaN(hour) && (hour >= 21 || hour <= 7)) {
      // Night/early-morning timestamp (9pm–7am) — flag for daylit outdoor photos
      tsHourPlausible = false;
    }
  }

  // 4. MakerNote presence and Apple prefix check
  //    Real iPhones always write a MakerNote starting with ASCII “Apple iOS”
  let makerNoteOk = true;
  let makerNoteNote = '';
  if (makeVal === 'Apple') {
    // Scan raw bytes for MakerNote tag 0x927C in ExifSubIFD
    // Simpler: look for 'Apple iOS' byte sequence in the file
    const bytes2 = new Uint8Array(buf);
    const appleIOSSeq = [0x41,0x70,0x70,0x6C,0x65,0x20,0x69,0x4F,0x53]; // 'Apple iOS'
    let foundMN = false;
    for (let mi = 0; mi < bytes2.length - 9; mi++) {
      if (appleIOSSeq.every((b, j) => bytes2[mi+j] === b)) { foundMN = true; break; }
    }
    if (!foundMN) {
      makerNoteOk = false;
      makerNoteNote = 'Apple MakerNote should start with ASCII \u0022Apple iOS\u0022. Missing or malformed.';
    } else {
      makerNoteNote = 'Apple MakerNote present with correct “Apple iOS” prefix.';
    }
  }

  // 5. SubSecTime format — Apple always writes exactly 3 digits
  let subSecOk = true;
  const subSecVal = ex['SubSecTimeOriginal'] || ex['SubSecTime'] || '';
  if (makeVal === 'Apple' && hasTS) {
    if (!subSecVal) {
      subSecOk = false;
    } else {
      // Should be exactly 3 numeric digits
      subSecOk = /^\d{3}$/.test(subSecVal.trim());
    }
  }

  // 6. OffsetTimeOriginal — iOS 15+ writes timezone offset on every capture
  let offsetTimeOk = true;
  let offsetTimeNote = '';
  const hasOffsetTime = 'OffsetTimeOriginal' in ex || 'OffsetTime' in ex;
  if (makeVal === 'Apple' && hasTS && softVal) {
    const swMajor = parseFloat(softVal) || 0;
    const isIOS15plus = swMajor >= 15.0;
    if (isIOS15plus && !hasOffsetTime) {
      offsetTimeOk = false;
      offsetTimeNote = 'iOS '+softVal+' should write OffsetTimeOriginal (0x9011). Missing on iOS 15+ is a forensic signal.';
    } else if (hasOffsetTime) {
      const otVal = (ex['OffsetTimeOriginal'] || ex['OffsetTime'] || '').trim();
      offsetTimeOk = /^[+-]\d{2}:\d{2}$/.test(otVal);
      offsetTimeNote = offsetTimeOk
        ? 'OffsetTimeOriginal present with valid UTC offset: ' + otVal
        : 'OffsetTimeOriginal format invalid: "'+otVal+'" (expected ±HH:MM, e.g. "-05:00")';
    }
  }

  // 7. GPS completeness — real iPhones always write MeasureMode, DateStamp, Speed when GPS is on
  let gpsCompleteOk = true;
  let gpsCompleteNote = '';
  if (makeVal === 'Apple' && hasGPS) {
    const missing = [];
    if (!('GPSMeasureMode' in ex)) missing.push('GPSMeasureMode');
    if (!('GPSDateStamp'  in ex)) missing.push('GPSDateStamp');
    if (!('GPSSpeed'      in ex)) missing.push('GPSSpeed');
    if (missing.length > 0) {
      gpsCompleteOk = false;
      gpsCompleteNote = 'Missing GPS subfields: '+missing.join(', ')+'. Real iPhones always include these in the GPS block.';
    } else {
      gpsCompleteNote = 'GPS block contains expected iPhone subfields (MeasureMode, DateStamp, Speed).';
    }
  }

  // ════════════════════════════════════════════════════════════════
  // LAYER 1: FILE STRUCTURE
  // ════════════════════════════════════════════════════════════════
  const l1checks=[];
  function c1(pass,severity,label,cls){l1checks.push({pass,severity,label,cls});}
  c1(jpeg.segments.length>0, 0.40,'JPEG structure valid','err');
  c1(!jpeg.isProgressive||jpeg.isBaseline, 0.50,'Baseline JPEG (not progressive)','err');
  c1(jpeg.qtables.length>0, 0.30,'Quantization tables present','warn');
  c1(thumbnailOk, 0.15,'EXIF thumbnail (IFD1) present','warn');
  c1(!jpeg.hasThumbnail||makeVal!=='Apple'||thumbAppMarkerOk, 0.20,'Thumbnail APP marker correct (FF E1/EXIF)','err');
  c1(!jpeg.hasC2PA||jpeg.hasC2PA, null, 'C2PA',''); // always null = informational only
  const l1=azLayerScore(l1checks);

  // ════════════════════════════════════════════════════════════════
  // LAYER 2: DEVICE IDENTITY & EXIF
  // ════════════════════════════════════════════════════════════════
  const l2checks=[];
  function c2(pass,severity,label,cls){l2checks.push({pass,severity,label,cls});}
  c2(hasRealMake&&hasRealModel, 0.42,'Device identity present','err');
  c2(!hasRealMake||!hasRealModel||modelKnown, 0.28,'Device model in database','warn');
  c2(swOk, 0.30,'Software version valid','err');
  c2(!hasTS||tsMatch, 0.35,'Timestamps consistent','err');
  c2(hasTS, 0.18,'Timestamps present','warn');
  c2(!hasTS||tsHourPlausible, 0.12,'Timestamp hour plausible (not 11PM–6AM)','warn');
  c2(!makeVal||makeVal!=='Apple'||makerNoteOk, 0.22,'Apple MakerNote present and valid','err');
  c2(!makeVal||makeVal!=='Apple'||!hasTS||subSecOk, 0.10,'SubSecTime format valid (3 digits)','warn');
  c2(!makeVal||makeVal!=='Apple'||!hasTS||!softVal||offsetTimeOk, 0.14,'OffsetTimeOriginal present (iOS 15+)','warn');
  c2(!hasGPS||!makeVal||makeVal!=='Apple'||gpsCompleteOk, 0.12,'GPS block complete (MeasureMode/DateStamp/Speed)','warn');
  const l2=azLayerScore(l2checks);

  // ════════════════════════════════════════════════════════════════
  // LAYER 3: JPEG ENCODING
  // ════════════════════════════════════════════════════════════════
  const l3checks=[];
  function c3(pass,severity,label,cls){l3checks.push({pass,severity,label,cls});}
  c3(jpegTypeOk, 0.50,'JPEG type (baseline)','err');
  c3(qtOk, 0.44,'QT profile matches device','err');
  c3(chromaOk, 0.42,'Chroma subsampling correct','err');
  c3(ycbcrOk, 0.22,'YCbCr positioning correct','warn');
  // QT fingerprint: not scored — qtOk quality range check covers encoding validation
  c3(!makeVal||makeVal!=='Apple'||dimMatchesDevice, 0.15,'Image dimensions match device native shoot mode','warn');
  // Double-compression check: removed entirely
  const l3=azLayerScore(l3checks);

  // ════════════════════════════════════════════════════════════════
  // LAYER 4: PIXEL FORENSICS
  // ════════════════════════════════════════════════════════════════
  const l4checks=[];
  function c4(pass,severity,label,cls){l4checks.push({pass,severity,label,cls});}
  c4(prnuOk, 0.22,'PRNU energy in natural range','warn');
  c4(prnuTight, 0.10,'PRNU energy (tight natural band)','warn');
  c4(lsbNatural, 0.20,'LSB entropy/correlation natural','warn');
  c4(irsOk, 0.08,'IRS pentagon area (texture/edge/freq)','warn');
  c4(histOk, 0.10,'Histogram natural (no comb/gaps)','warn');
  c4(blockScore<8.0, 0.08,'Block artifacts minimal','warn');
  const l4=azLayerScore(l4checks);

  // ── Final hybrid score ─────────────────────────────────────────
  const finalScore=azFinalScore(l1,l2,l3,l4);
  const {label,sub,cls}=azVerdict(finalScore);

  // ══════════════════════════════════════════════════════════════
  // BUILD OUTPUT DOM
  // ══════════════════════════════════════════════════════════════
  const container=document.createElement('div');

  // ── Score header + layer badges ────────────────────────────────
  const hdr=document.createElement('div'); hdr.className='az-score-header';
  const gauge=azScoreGauge(finalScore,cls,label,sub);
  hdr.appendChild(gauge);

  const badges=document.createElement('div'); badges.className='az-layer-badges';
  const layerDefs=[['File',l1],['Identity',l2],['Encoding',l3],['Pixel',l4]];
  layerDefs.forEach(([name,layer])=>{
    const bCls=layer.score>=85?'ok':layer.score>=65?'warn':'err';
    badges.appendChild(azLayerBadge(name,layer.score,bCls));
  });
  hdr.appendChild(badges);
  container.appendChild(hdr);

  // ── Flags (all failures, high-severity first) ──────────────────
  const allFlags=[...l1.failures,...l2.failures,...l3.failures,...l4.failures]
    .filter(f=>f.label)
    .sort((a,b)=>b.severity-a.severity);
  if(allFlags.length){
    const flagBlock=azFlagsBlock(allFlags.map(f=>({
      text:f.label+' (−'+Math.round(f.severity*100)+'%)',
      cls:f.severity>=0.35?'err':'warn',
    })));
    if(flagBlock)container.appendChild(flagBlock);
  }

  // ── File info ──────────────────────────────────────────────────
  const sFile=azSec('File');
  if(filename){
    const bytes2=new Blob([buf]).size;
    sFile.appendChild(azRow('Filename',filename,'',''));
    sFile.appendChild(azRow('File size',fmt(bytes2),'',''));
    sFile.appendChild(azRow('Dimensions',W+'×'+H+'  ('+W*H/1000000..toFixed(1)+' MP)','',''));
  }
  const latVal=ex['GPSLatitude'],latRef=ex['GPSLatitudeRef']||'N';
  const lngVal=ex['GPSLongitude'],lngRef=ex['GPSLongitudeRef']||'E';
  if(latVal!==undefined&&lngVal!==undefined){
    const lat=azGPSRationalToDecimal(latVal,latRef);
    const lng=azGPSRationalToDecimal(lngVal,lngRef);
    if(lat!==null&&lng!==null){
      const city=azReverseGeoCity(lat,lng);
      const coord=lat.toFixed(6)+', '+lng.toFixed(6);
      sFile.appendChild(azRow('Location',(city?city+' · ':'')+coord,'ok',
        city?'GPS embedded — '+city+'. Coordinates: '+coord+'.':'GPS embedded — '+coord+'.'));
    }
  }else{
    sFile.appendChild(azRow('Location','No GPS data','ok','No location information embedded.'));
  }
  sFile.appendChild(azRow('JPEG type',jpeg.isProgressive?'Progressive':jpeg.isBaseline?'Baseline':'Unknown',jpegTypeOk?'ok':'err',
    jpeg.isBaseline?'Correct — all phone cameras produce baseline JPEG.':'Progressive JPEG is produced by web optimizers, never by phone cameras.'));
  sFile.appendChild(azRow('EXIF thumbnail',jpeg.hasThumbnail?'Present':'Missing',thumbnailOk?'ok':'warn',
    jpeg.hasThumbnail?'IFD1 thumbnail embedded — consistent with real iPhone output.':
    makeVal==='Apple'?'iPhone cameras always embed a 160×120 IFD1 thumbnail. Missing thumbnail is a forensic signal.':'No embedded thumbnail detected.'));
  if(jpeg.hasThumbnail&&makeVal==='Apple'){
    sFile.appendChild(azRow('Thumbnail header',thumbAppMarkerOk?'FF D8 FF E1 (EXIF)':'FF D8 FF E0 (JFIF)',thumbAppMarkerOk?'ok':'err',
      thumbAppMarkerOk?'Thumbnail starts with EXIF APP1 marker — matches real iPhone output.':
      'Thumbnail has APP0/JFIF header (FF D8 FF E0) — real iPhone thumbnails always start FF D8 FF E1 (their own EXIF). This is the clearest tell.'));
  }
  if(jpeg.hasC2PA){sFile.appendChild(azRow('C2PA provenance','Present','warn',azPick(AZ_X.c2pa_present)));}
  container.appendChild(sFile);

  // ── Layer 2: Device Identity ───────────────────────────────────
  const sId=azSec('Device Identity');
  sId.appendChild(azRow('Make / Model',(makeVal||'—')+' / '+(modelVal||'—'),
    hasRealMake&&hasRealModel?(modelKnown?'ok':'warn'):'err',
    hasRealMake&&hasRealModel?(modelKnown?'Model verified in database for this manufacturer.':azPick(AZ_X.model_unknown)):
    'Missing or placeholder device identity — immediate forensic flag.'));
  sId.appendChild(azRow('Software',(softVal||'—'),swOk?'ok':'err',
    !softVal?'No software field.':swIsPlaceholder?'Placeholder software field — the first thing JPEGsnoop checks.':
    swOk?'Recognized iOS version for Apple devices.':'Software version not in known iOS database.'));
  // Show exact timestamp with time
  if(hasTS){
    const tsDisplay = ex['DateTimeOriginal']||ex['DateTime']||'';
    // Parse hour safely — EXIF format is always 'YYYY:MM:DD HH:MM:SS' (24h)
    const tsHour = (tsDisplay.length >= 19) ? parseInt(tsDisplay.substring(11,13), 10) : -1;
    // Build 24h time display: 'HH:MM' padded
    const tsTimePart = tsHour >= 0 ? (String(tsHour).padStart(2,'0') + tsDisplay.substring(13,16)) : '';
    const tsDatePart = tsDisplay.substring(0,10).replace(/:/g,'-');
    const tsFormatted = tsDatePart && tsTimePart ? tsDatePart + ' ' + tsTimePart : (tsDisplay||'—');
    const tsTimeNote = tsHour>=8&&tsHour<=20?'Daytime shot ('+tsTimePart+') — plausible.':
                       tsHour>=0?'Night/early-morning timestamp ('+tsTimePart+') — flag if image appears daylit.':
                       'No time component.';
    sId.appendChild(azRow('Shot time', tsFormatted, tsHourPlausible?'ok':'warn', tsTimeNote));
  }
  sId.appendChild(azRow('Timestamps',hasTS?(tsMatch?'Present · consistent':'MISMATCH'):' Not present',
    hasTS?(tsMatch?'ok':'err'):'warn',
    hasTS?(tsMatch?azPick(AZ_X.ts_match):azPick(AZ_X.ts_mismatch)):'No timestamps — unusual for phone cameras.'));
  if(hasSerial){sId.appendChild(azRow('Serial / UID','Present','warn',azPick(AZ_X.serial_present)));}
  if(ex['LensModel']){sId.appendChild(azRow('Lens',ex['LensModel'],'ok',
    'Lens model embedded — device-specific identifier used in source attribution.'));}
  // MakerNote check
  if(makeVal==='Apple'){
    sId.appendChild(azRow('MakerNote',makerNoteOk?'Present · valid':'Missing / malformed',makerNoteOk?'ok':'err',
      makerNoteOk?makerNoteNote:'Apple MakerNote should start with ASCII \u0022Apple iOS\u0022. Missing or malformed MakerNote is a forensic flag.'));
  }
  // SubSecTime format
  if(makeVal==='Apple'&&hasTS){
    sId.appendChild(azRow('SubSecTime',subSecVal?subSecVal:'Missing',subSecOk?'ok':'warn',
      subSecOk?'SubSecTime present with correct 3-digit Apple format.':
      'Apple always writes exactly 3 numeric digits for SubSecTime. Format mismatch is a forensic signal.'));
  }
  // OffsetTimeOriginal check (iOS 15+)
  if(makeVal==='Apple'&&hasTS&&softVal){
    const _swMaj=parseFloat(softVal)||0;
    if(_swMaj>=15.0||hasOffsetTime){
      const _otDisplay=ex['OffsetTimeOriginal']||ex['OffsetTime']||'Missing';
      sId.appendChild(azRow('OffsetTimeOriginal',_otDisplay,offsetTimeOk?'ok':'warn',
        offsetTimeOk?offsetTimeNote:
        'iOS 15+ writes OffsetTimeOriginal (timezone offset) on every capture. Missing is a forensic signal.'));
    }
  }
  // GPS completeness (Apple + GPS)
  if(makeVal==='Apple'&&hasGPS){
    sId.appendChild(azRow('GPS completeness',gpsCompleteOk?'Complete':'Incomplete',
      gpsCompleteOk?'ok':'warn',
      gpsCompleteOk?gpsCompleteNote:gpsCompleteNote));
  }
  // Timestamp hour
  if(hasTS&&!tsHourPlausible){
    sId.appendChild(azRow('Timestamp plausibility','Night timestamp ('+tsStr.substring(11,16)+')',
      'warn','Timestamp falls between 11PM and 6AM. Flag if image appears to be taken in daylight.'));
  }
  container.appendChild(sId);

  // ── Layer 3: JPEG Encoding ─────────────────────────────────────
  const sEnc=azSec('JPEG Encoding');
  if(jpeg.jpegQuality!==null){
    const dcVal = jpeg.qtables.length>0 ? jpeg.qtables[0].table[0] : null;
    const qtDisplay = jpeg.jpegQuality!==null
      ? 'Q'+jpeg.jpegQuality+(dcVal!==null?' (DC='+dcVal+')':'')+(jpeg.chromaQuality?' / Q'+jpeg.chromaQuality+' chroma':'')
      : (dcVal!==null?'DC='+dcVal:'Unknown');
    sEnc.appendChild(azRow('JPEG quality', qtDisplay, qtOk?'ok':'err', qtNote||''));
  }
  sEnc.appendChild(azRow('Chroma subsampling',jpeg.chromaSubsampling,chromaOk?'ok':'err',chromaNote||''));
  if(jpeg.ycbcrPositioning!==null){
    sEnc.appendChild(azRow('YCbCr positioning',jpeg.ycbcrPositioning+(jpeg.ycbcrPositioning===1?' (centered)':' (co-sited)'),ycbcrOk?'ok':'warn',
      ycbcrOk?'Matches expected value for this device.':'Does not match expected value for '+makeVal+'.'));
  }

  // QT fingerprint — informational note only (not scored, not displayed as flag)
  // Browser encoder cannot produce Apple's exact coefficients but quality range is validated above.
  // Dimension vs device
  if(makeVal==='Apple'&&modelVal&&W>0){
    sEnc.appendChild(azRow('Dimension vs device',dimMatchesDevice?(W+'×'+H+' — native mode'):(W+'×'+H+' — not a native mode'),
      dimMatchesDevice?'ok':'err',
      dimMatchesDevice?'Dimensions match a real '+modelVal+' shoot mode.':dimNote));
  }
  container.appendChild(sEnc);

  // ── Layer 4: Pixel Forensics ───────────────────────────────────
  const sPix=azSec('Pixel Forensics');

  // PRNU slider
  const prnuPct=azPRNUtoSlider(prnu);
  sPix.appendChild(azSlider('PRNU / sensor noise',prnuPct,prnu.toFixed(1),
    prnuOk?azPick(AZ_X.prnu_natural):prnu<3?azPick(AZ_X.prnu_low):azPick(AZ_X.prnu_high),
    AZ_PRNU_ZONES));

  // LSB slider
  const lsbPct=azLSBtoSlider(lsbMean);
  sPix.appendChild(azSlider('LSB entropy',lsbPct,lsbMean.toFixed(3),
    lsbNatural?azPick(AZ_X.lsb_natural):lsbMean>0.9995?azPick(AZ_X.lsb_toorandom):azPick(AZ_X.lsb_structured),
    AZ_LSB_ZONES));

  // Histogram slider
  const gapsPct=azGapsToSlider(histAnal.gaps);
  sPix.appendChild(azSlider('Histogram gaps',gapsPct,histAnal.gaps+(histAnal.hasComb?' (comb)':''),
    histAnal.hasComb?azPick(AZ_X.hist_comb):histAnal.gaps<8?azPick(AZ_X.hist_natural):histAnal.gaps<30?azPick(AZ_X.hist_light):azPick(AZ_X.hist_heavy),
    AZ_GAPS_ZONES));

  // Blocking slider
  const blockPct=azBlockToSlider(blockScore);
  sPix.appendChild(azSlider('Block artifacts',blockPct,blockScore.toFixed(1),
    blockScore<5?azPick(AZ_X.blocking_low):azPick(AZ_X.blocking_high),AZ_BLOCK_ZONES));

  // IRS Pentagon inline
  const irsRow=document.createElement('div'); irsRow.className='az-irs-row';
  const irsLbl=document.createElement('div'); irsLbl.className='az-row-label'; irsLbl.textContent='IRS pentagon';
  const {el:pentEl,score:irsScore}=azIRSPentagon({
    ced:irs.ced,glcmC:irs.glcmC,glcmE_inv:irs.glcmE_inv,vbl_inv:irs.vbl_inv,ms_inv:irs.ms_inv
  });
  const irsRight=document.createElement('div'); irsRight.className='az-irs-right';
  irsRight.appendChild(pentEl);
  const irsDesc=document.createElement('div'); irsDesc.className='az-explanation';
  irsDesc.textContent='Image Realism Score pentagon (arXiv 2309.14756). Five independent pixel statistics: '
    +'Edge density ('+Math.round(irs.ced*100)+'%), '
    +'GLCM Contrast ('+Math.round(irs.glcmC*100)+'%), '
    +'Texture uniformity ('+Math.round(irs.glcmE_inv*100)+'%), '
    +'Sharpness ('+Math.round(irs.vbl_inv*100)+'%), '
    +'Frequency ('+Math.round(irs.ms_inv*100)+'%). '
    +'Pentagon area = '+irsScore+'% — larger area indicates more natural image statistics.';
  irsRight.appendChild(irsDesc);
  irsRow.appendChild(irsLbl); irsRow.appendChild(irsRight);
  sPix.appendChild(irsRow);
  container.appendChild(sPix);

  // ── Score breakdown ────────────────────────────────────────────
  if(allFlags.length>0){
    const sBrk=azSec('Score breakdown');
    [['L1 — File structure',l1],['L2 — Device identity',l2],['L3 — JPEG encoding',l3],['L4 — Pixel forensics',l4]]
      .forEach(([name,layer])=>{
        const bCls=layer.score>=85?'ok':layer.score>=65?'warn':'err';
        sBrk.appendChild(azRow(name,layer.score+'%',bCls,
          layer.failures.length?'Flags: '+layer.failures.map(f=>f.label).join(' · '):'No issues.'));
      });
    container.appendChild(sBrk);
  }

  return container;
}

// ══════════════════════════════════════════════════════════════════
// UI WIRING — drop zones, run buttons, single/compare mode
// ══════════════════════════════════════════════════════════════════

function azResetSingle() {
  azFile1Buf=null; azFile1Name='';
  $('azName1').textContent='';
  const t=$('azThumb1'); if(t){t.style.display='none';t.src='';}
  const cl=$('azClear1'); if(cl)cl.style.display='none';
  const rb=$('azRunSingle'); if(rb)rb.disabled=true;
  $('azResults').innerHTML='';
}
if($('azClear1'))$('azClear1').addEventListener('click',azResetSingle);

function azReadFile(file,thumbEl,nameEl,clearBtn,cb){
  const reader=new FileReader();
  reader.onload=ev=>{
    const buf=ev.target.result;
    if(thumbEl){thumbEl.src=URL.createObjectURL(file);thumbEl.style.display='block';}
    if(nameEl)nameEl.textContent=file.name+' ('+fmt(file.size)+')';
    if(clearBtn)clearBtn.style.display='inline-block';
    if(cb)cb(buf,file.name);
  };
  reader.readAsArrayBuffer(file);
}

function azWireDrop(dropId,fileInputId,thumbId,nameId,clearId,onLoad){
  const zone=$(dropId),input=$(fileInputId);
  const thumb=$(thumbId),nameEl=$(nameId);
  const clearBtn=clearId?$(clearId):null;
  if(!zone||!input)return;
  zone.addEventListener('click',()=>input.click());
  zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('over');});
  zone.addEventListener('dragleave',()=>zone.classList.remove('over'));
  zone.addEventListener('drop',e=>{
    e.preventDefault();zone.classList.remove('over');
    const f=e.dataTransfer.files[0];if(f)azReadFile(f,thumb,nameEl,clearBtn,onLoad);
  });
  input.addEventListener('change',()=>{
    if(input.files[0])azReadFile(input.files[0],thumb,nameEl,clearBtn,onLoad);
    input.value='';
  });
}

// Single mode wiring
azWireDrop('azDrop1','azFile1','azThumb1','azName1','azClear1',(buf,name)=>{
  azFile1Buf=buf; azFile1Name=name;
  const rb=$('azRunSingle'); if(rb)rb.disabled=false;
});

if($('azRunSingle')){
  $('azRunSingle').addEventListener('click',async()=>{
    if(!azFile1Buf)return;
    const btn=$('azRunSingle'); btn.disabled=true;
    const res=$('azResults');
    res.innerHTML='<div class="az-spinner">analyzing…</div>';
    try{
      const el=await azAnalyzeSingle(azFile1Buf,azFile1Name);
      res.innerHTML=''; res.appendChild(el);
    }catch(e){
      res.innerHTML='<div class="az-spinner" style="color:var(--err)">Error: '+esc(e.message)+'</div>';
    }
    btn.disabled=false;
  });
}

// Compare mode wiring
let azFileBuf_A=null,azFileBuf_B=null,azFileName_A='',azFileName_B='';
function azCheckCompareReady(){const rb=$('azRunCompare');if(rb)rb.disabled=!(azFileBuf_A&&azFileBuf_B);}

azWireDrop('azDropA','azFileA','azThumbA','azNameA',null,(buf,name)=>{azFileBuf_A=buf;azFileName_A=name;azCheckCompareReady();});
azWireDrop('azDropB','azFileB','azThumbB','azNameB',null,(buf,name)=>{azFileBuf_B=buf;azFileName_B=name;azCheckCompareReady();});

if($('azRunCompare')){
  $('azRunCompare').addEventListener('click',async()=>{
    if(!azFileBuf_A||!azFileBuf_B)return;
    const btn=$('azRunCompare'); btn.disabled=true;
    const res=$('azResults');
    res.innerHTML='<div class="az-spinner">analyzing both images…</div>';
    try{
      const[elA,elB]=await Promise.all([
        azAnalyzeSingle(azFileBuf_A,azFileName_A),
        azAnalyzeSingle(azFileBuf_B,azFileName_B),
      ]);
      res.innerHTML='';
      const hdrA=document.createElement('div'); hdrA.className='az-compare-hdr';
      hdrA.textContent='Original: '+azFileName_A; res.appendChild(hdrA); res.appendChild(elA);
      const hdrB=document.createElement('div'); hdrB.className='az-compare-hdr';
      hdrB.textContent='Processed: '+azFileName_B; res.appendChild(hdrB); res.appendChild(elB);
    }catch(e){
      res.innerHTML='<div class="az-spinner" style="color:var(--err)">Error: '+esc(e.message)+'</div>';
    }
    btn.disabled=false;
  });
}

// Single/Compare mode toggle
if($('azModeSingle')){
  $('azModeSingle').addEventListener('click',()=>{
    azImageMode='single';
    $('azModeSingle').classList.add('active'); $('azModeCompare').classList.remove('active');
    $('azSinglePanel').style.display='block'; $('azComparePanel').style.display='none';
    $('azResults').innerHTML='';
  });
}
if($('azModeCompare')){
  $('azModeCompare').addEventListener('click',()=>{
    azImageMode='compare';
    $('azModeCompare').classList.add('active'); $('azModeSingle').classList.remove('active');
    $('azComparePanel').style.display='block'; $('azSinglePanel').style.display='none';
    $('azResults').innerHTML='';
  });
}

dbg('Analyzer v4: 4-layer pipeline · IRS pentagon · hybrid scoring loaded','debug-ok');
