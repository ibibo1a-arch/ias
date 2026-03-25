/**
 * pipeline.js — 18-layer image privacy pipeline (v9)
 *
 * Pure functions only. No DOM. Worker-safe via importScripts().
 *
 * Layers:
 *   L1  — Metadata + thumbnail strip
 *   L2  — Re-encode (canvas round-trip)
 *   L3  — LSB pixel noise (intensity 0-1)
 *   L4  — PRNU sensor fingerprint spoof (improved, intensity 0-1)
 *   L5  — Micro color/gamma shift (intensity 0-1)
 *   L6  — Adversarial gradient (intensity 0-1)
 *   L7  — pHash defeat verification
 *   L8  — Content flagging
 *   L9  — ΔE report
 *   L10 — JPEG encoder fingerprint spoof (intensity 0-1)
 *   L11 — Multi-sinusoid frequency domain noise (intensity 0-1) [upgraded v9]
 *   L13 — Geometric micro-warp — facial geometry defeat (intensity 0-1)
 *   L14 — Embedded thumbnail strip (part of L1)
 *   L15 — Per-pixel independent channel noise [upgraded v9: was flat offset]
 *   L16 — File size normalisation (bool)
 *   L17 — Asymmetric micro-crop + mirror-pad (bool) [new v9]
 *   L18 — Chroma subsampling spoof (intensity 0-1) [new v9]
 *
 * Note: L12 was removed in a prior version. Numbering is preserved for
 * config compatibility — preset configs do not reference L12.
 *
 * cfg.preset: 'platform' | 'forensic' | 'shield' | null (manual)
 * Manual mode: cfg.L3..L18 are 0-1 floats or booleans
 * ΔE hardlock ceiling: 2.5 (visually safe at any preset)
 */
'use strict';

// ─────────────────────────────────────────────────────────────────
// PRNG
// ─────────────────────────────────────────────────────────────────
function cryptoSeed() {
  return (typeof crypto !== 'undefined' && crypto.getRandomValues)
    ? crypto.getRandomValues(new Uint32Array(1))[0]
    : Math.floor(Math.random() * 0xFFFFFFFF);
}
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function gaussianRandom(rng) {
  if (rng._spare !== undefined) { const v = rng._spare; rng._spare = undefined; return v; }
  let u1 = rng(), u2 = rng();
  while (u1 === 0) u1 = rng();
  const mag = Math.sqrt(-2 * Math.log(u1)), a = 2 * Math.PI * u2;
  rng._spare = mag * Math.sin(a);
  return mag * Math.cos(a);
}

// ─────────────────────────────────────────────────────────────────
// COLOR SCIENCE
// ─────────────────────────────────────────────────────────────────
function srgbToLinear(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function rgbToLab(r, g, b) {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  let x = (0.4124564*lr + 0.3575761*lg + 0.1804375*lb) / 0.95047;
  let y = (0.2126729*lr + 0.7151522*lg + 0.0721750*lb) / 1.00000;
  let z = (0.0193339*lr + 0.1191920*lg + 0.9503041*lb) / 1.08883;
  const e = 0.008856, k = 903.3;
  x = x > e ? Math.cbrt(x) : (k*x+16)/116;
  y = y > e ? Math.cbrt(y) : (k*y+16)/116;
  z = z > e ? Math.cbrt(z) : (k*z+16)/116;
  return [116*y-16, 500*(x-y), 200*(y-z)];
}
function computeDeltaE(origData, modData, totalPixels, sampleSize) {
  const n = Math.min(sampleSize || 12000, totalPixels);
  const rng = mulberry32(42);
  let maxDE = 0;
  for (let s = 0; s < n; s++) {
    const i = Math.floor(rng() * totalPixels) * 4;
    const labA = rgbToLab(origData[i], origData[i+1], origData[i+2]);
    const labB = rgbToLab(modData[i],  modData[i+1],  modData[i+2]);
    const de = Math.sqrt((labA[0]-labB[0])**2 + (labA[1]-labB[1])**2 + (labA[2]-labB[2])**2);
    if (de > maxDE) maxDE = de;
  }
  return maxDE;
}

// ─────────────────────────────────────────────────────────────────
// PERCEPTUAL HASH
// ─────────────────────────────────────────────────────────────────
function resizeGrayscale(data, srcW, srcH, dstSize) {
  const out = new Float64Array(dstSize * dstSize);
  const xr = srcW/dstSize, yr = srcH/dstSize;
  const gray = (px,py) => { const i=(py*srcW+px)*4; return 0.299*data[i]+0.587*data[i+1]+0.114*data[i+2]; };
  for (let dy = 0; dy < dstSize; dy++) {
    for (let dx = 0; dx < dstSize; dx++) {
      const sx=dx*xr, sy=dy*yr, x0=Math.floor(sx), y0=Math.floor(sy);
      const x1=Math.min(x0+1,srcW-1), y1=Math.min(y0+1,srcH-1);
      const fx=sx-x0, fy=sy-y0;
      out[dy*dstSize+dx] = gray(x0,y0)*(1-fx)*(1-fy)+gray(x1,y0)*fx*(1-fy)+gray(x0,y1)*(1-fx)*fy+gray(x1,y1)*fx*fy;
    }
  }
  return out;
}
function dct1d(input, N) {
  const out = new Float64Array(N);
  for (let k=0; k<N; k++) { let s=0; for (let n=0; n<N; n++) s+=input[n]*Math.cos(Math.PI*(2*n+1)*k/(2*N)); out[k]=s; }
  return out;
}
function computePHash(data, width, height) {
  const S=32, HS=8;
  const gray = resizeGrayscale(data, width, height, S);
  const afterRows = new Float64Array(S*S);
  for (let r=0; r<S; r++) afterRows.set(dct1d(gray.slice(r*S,(r+1)*S),S), r*S);
  const dct2d = new Float64Array(S*S);
  for (let c=0; c<S; c++) {
    const col=new Float64Array(S);
    for (let r=0; r<S; r++) col[r]=afterRows[r*S+c];
    const dc=dct1d(col,S);
    for (let r=0; r<S; r++) dct2d[r*S+c]=dc[r];
  }
  const lowFreq=[];
  for (let r=0; r<HS; r++) for (let c=0; c<HS; c++) if (r>0||c>0) lowFreq.push(dct2d[r*S+c]);
  const med=[...lowFreq].sort((a,b)=>a-b)[Math.floor(lowFreq.length/2)];
  const hash=new Uint8Array(HS*HS); let idx=0;
  for (let r=0; r<HS; r++) for (let c=0; c<HS; c++) { if (r===0&&c===0) continue; hash[r*HS+c]=lowFreq[idx++]>med?1:0; }
  return hash;
}
function hammingDist(a, b) { let d=0; for (let i=0; i<a.length; i++) if (a[i]!==b[i]) d++; return d; }

// ─────────────────────────────────────────────────────────────────
// METADATA DETECTION
// ─────────────────────────────────────────────────────────────────
function detectMetadata(rawBytes) {
  const bytes = new Uint8Array(rawBytes);
  const txt = new TextDecoder('ascii',{fatal:false}).decode(bytes.slice(0, Math.min(bytes.length,200000)));
  return {
    hasExif:    txt.includes('Exif'),
    hasC2PA:    ['c2pa','C2PA','jumb','JUMBF'].some(m=>txt.includes(m)),
    hasICC:     txt.includes('ICC_PROFILE')||txt.includes('iCCP'),
    hasPNGText: txt.includes('tEXt')||txt.includes('iTXt')||txt.includes('parameters'),
  };
}

// ─────────────────────────────────────────────────────────────────
// L1 + L14: STRIP METADATA + EMBEDDED THUMBNAIL
// ─────────────────────────────────────────────────────────────────
function stripMetadata(rawBytes, stripThumb) {
  const bytes = new Uint8Array(rawBytes);
  if (bytes[0]===0xFF && bytes[1]===0xD8) {
    const out=[bytes.slice(0,2)];
    let i=2;
    while (i < bytes.length-1) {
      if (bytes[i]!==0xFF) { out.push(bytes.slice(i)); break; }
      const marker=bytes[i+1];
      if (marker===0xD9) { out.push(bytes.slice(i)); break; }
      if (marker===0xD8||(marker>=0xD0&&marker<=0xD7)) { out.push(bytes.slice(i,i+2)); i+=2; continue; }
      if (i+3>=bytes.length) break;
      const segLen=(bytes[i+2]<<8)|bytes[i+3], segEnd=i+2+segLen;
      const isAPPn=marker>=0xE0&&marker<=0xEF;
      const isAPP0=marker===0xE0;
      const isJFIF=isAPP0&&segLen>=7&&bytes[i+4]===0x4A&&bytes[i+5]===0x46&&bytes[i+6]===0x49&&bytes[i+7]===0x46;
      const isCOM=marker===0xFE;
      const isAPP1=marker===0xE1; // EXIF (contains thumbnail)
      if ((isAPPn&&!isJFIF)||isCOM) { i=segEnd; continue; }
      if (stripThumb&&isAPP1) { i=segEnd; continue; } // L14: strip thumbnail
      out.push(bytes.slice(i,segEnd)); i=segEnd;
    }
    const total=out.reduce((s,b)=>s+b.length,0);
    const result=new Uint8Array(total); let off=0;
    for (const b of out) { result.set(b,off); off+=b.length; }
    return result.buffer;
  }
  const PNG_SIG=[0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A];
  if (PNG_SIG.every((v,i)=>bytes[i]===v)) {
    const STRIP=new Set(['tEXt','iTXt','zTXt','eXIf','iCCP','sRGB','gAMA','cHRM','pHYs','sBIT','tIME','oFFs','pCAL','sCAL','hIST','bKGD']);
    const out=[bytes.slice(0,8)]; let i=8;
    while (i+12<=bytes.length) {
      const len=(bytes[i]<<24|bytes[i+1]<<16|bytes[i+2]<<8|bytes[i+3])>>>0;
      const type=String.fromCharCode(bytes[i+4],bytes[i+5],bytes[i+6],bytes[i+7]);
      const total=12+len;
      if (STRIP.has(type)) { i+=total; continue; }
      out.push(bytes.slice(i,i+total)); i+=total;
      if (type==='IEND') break;
    }
    const size=out.reduce((s,b)=>s+b.length,0);
    const result=new Uint8Array(size); let off=0;
    for (const b of out) { result.set(b,off); off+=b.length; }
    return result.buffer;
  }
  return rawBytes;
}

// ─────────────────────────────────────────────────────────────────
// L3: LSB PERTURBATION  (intensity 0-1 → ratio 0.10-0.45)
// ─────────────────────────────────────────────────────────────────
function layer3_lsb(data, width, height, intensity) {
  const ratio=0.10+intensity*0.35;
  const rng=mulberry32(cryptoSeed());
  let flipped=0;
  for (let p=0; p<width*height; p++) {
    const i=p*4;
    for (let c=0; c<3; c++) if (rng()<ratio) { data[i+c]^=1; flipped++; }
  }
  return flipped;
}

// ─────────────────────────────────────────────────────────────────
// L4: IMPROVED PRNU — structured row/column FPN + shot noise
// (intensity 0-1 → sigma 0.0015-0.008)
// ─────────────────────────────────────────────────────────────────
function layer4_prnu(data, width, height, intensity) {
  const sigma=0.0015+intensity*0.0065;
  const rng=mulberry32(cryptoSeed());
  const rowNoise=new Float32Array(height);
  const colNoise=new Float32Array(width);
  for (let y=0; y<height; y++) rowNoise[y]=gaussianRandom(rng)*sigma*0.4*255;
  for (let x=0; x<width;  x++) colNoise[x]=gaussianRandom(rng)*sigma*0.4*255;
  for (let p=0; p<width*height; p++) {
    const x=p%width, y=Math.floor(p/width), i=p*4;
    const fpn=rowNoise[y]+colNoise[x];
    for (let c=0; c<3; c++) {
      const shot=gaussianRandom(rng)*sigma*0.6*255;
      data[i+c]=Math.max(0,Math.min(255,Math.round(data[i+c]+fpn+shot)));
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// L5: MICRO COLOR/GAMMA SHIFT  (intensity 0-1 → range 0.008-0.030)
// ─────────────────────────────────────────────────────────────────
function layer5_color(data, width, height, intensity) {
  const rng=mulberry32(cryptoSeed());
  const range=0.008+intensity*0.022;
  const gamma=0.985+(rng()*2-1)*range;
  const lut=new Uint8Array(256);
  for (let v=0; v<256; v++) lut[v]=Math.max(0,Math.min(255,Math.round(Math.pow(v/255,gamma)*255)));
  for (let p=0; p<width*height; p++) {
    const i=p*4;
    data[i]=lut[data[i]]; data[i+1]=lut[data[i+1]]; data[i+2]=lut[data[i+2]];
  }
  return gamma;
}

// ─────────────────────────────────────────────────────────────────
// L6: ADVERSARIAL GRADIENT  (intensity 0-1 → magnitude 0.3-1.2)
// ─────────────────────────────────────────────────────────────────
function layer6_adversarial(data, width, height, intensity) {
  const rng=mulberry32(cryptoSeed());
  const mag=0.3+intensity*0.9;
  const blockW=Math.max(Math.floor(width/16),1);
  const blockH=Math.max(Math.floor(height/16),1);
  const csign=[rng()<0.5?-1:1,rng()<0.5?-1:1,rng()<0.5?-1:1];
  for (let by=0; by<height; by+=blockH) {
    for (let bx=0; bx<width; bx+=blockW) {
      const bh=Math.min(blockH,height-by), bw=Math.min(blockW,width-bx);
      const angle=rng()*2*Math.PI, cosA=Math.cos(angle), sinA=Math.sin(angle);
      for (let dy=0; dy<bh; dy++) {
        const gy=(2*dy/(bh-1||1))-1;
        for (let dx=0; dx<bw; dx++) {
          const gx=(2*dx/(bw-1||1))-1;
          const m=(cosA*gx+sinA*gy)*mag;
          const i=((by+dy)*width+(bx+dx))*4;
          for (let c=0; c<3; c++) data[i+c]=Math.max(0,Math.min(255,Math.round(data[i+c]+m*csign[c])));
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// L8: FLAGGING
// ─────────────────────────────────────────────────────────────────
function layer8_flagging(data, width, height) {
  const flags={text:[],landmarks:[],reflections:[]};
  let brightCount=0;
  for (let p=0; p<width*height; p++) {
    const i=p*4;
    if (0.299*data[i]+0.587*data[i+1]+0.114*data[i+2]>245) brightCount++;
  }
  if (brightCount/(width*height)>0.005) flags.reflections.push('specular ('+brightCount.toLocaleString()+' px)');
  let edgePixels=0;
  for (let y=1; y<height-1; y+=2) {
    for (let x=1; x<width-1; x+=2) {
      const idx=(y*width+x)*4;
      const l=0.299*data[idx]+0.587*data[idx+1]+0.114*data[idx+2];
      const lR=0.299*data[idx+4]+0.587*data[idx+5]+0.114*data[idx+6];
      const lD=0.299*data[idx+width*4]+0.587*data[idx+width*4+1]+0.114*data[idx+width*4+2];
      if (Math.abs(lR-l)+Math.abs(lD-l)>30) edgePixels++;
    }
  }
  const sampledPx=Math.floor((height-2)/2)*Math.floor((width-2)/2);
  if (edgePixels/(sampledPx||1)>0.15) flags.landmarks.push('high structure');
  let textBlocks=0, totalBlocks=0;
  const bsz=16;
  for (let by=0; by<height-bsz; by+=bsz*2) {
    for (let bx=0; bx<width-bsz; bx+=bsz*2) {
      totalBlocks++;
      let sum=0,sumSq=0,n=0;
      for (let dy=0; dy<bsz; dy++) for (let dx=0; dx<bsz; dx++) {
        const i=((by+dy)*width+(bx+dx))*4;
        const v=0.299*data[i]+0.587*data[i+1]+0.114*data[i+2];
        sum+=v; sumSq+=v*v; n++;
      }
      const mean=sum/n;
      if (sumSq/n-mean*mean>1500&&mean>40&&mean<220) textBlocks++;
    }
  }
  if (totalBlocks>0&&textBlocks/totalBlocks>0.08) flags.text.push('text ('+textBlocks+'/'+totalBlocks+')');
  return flags;
}

// ─────────────────────────────────────────────────────────────────
// L10: JPEG ENCODER FINGERPRINT SPOOF
// Perturbs pixels at 8x8 DCT block boundaries to mimic a different
// encoder's quantization rounding pattern.
// (intensity 0-1 → max perturbation 0-1.5 px)
// ─────────────────────────────────────────────────────────────────
function layer10_jpegFingerprint(data, width, height, intensity) {
  if (intensity<=0) return;
  const rng=mulberry32(cryptoSeed());
  const mag=intensity*1.5;
  for (let by=0; by<height; by+=8) {
    for (let bx=0; bx<width; bx+=8) {
      const phase=rng()*Math.PI*2;
      const bMag=(rng()*0.5+0.5)*mag;
      for (let dy=0; dy<8&&by+dy<height; dy++) {
        for (let dx=0; dx<8&&bx+dx<width; dx++) {
          const i=((by+dy)*width+(bx+dx))*4;
          const basis=Math.cos(phase+(dx+dy)*Math.PI/8)*bMag;
          for (let c=0; c<3; c++) data[i+c]=Math.max(0,Math.min(255,Math.round(data[i+c]+basis)));
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// L11: MULTI-SINUSOID FREQUENCY DOMAIN NOISE  [v9: upgraded from single carrier]
// Three superimposed sinusoidal carriers at different frequencies, phases,
// and amplitudes. Destroys forensic frequency histogram analysis used to
// cluster same-source images. Multiple carriers make the pattern far harder
// to model or reverse than a single sinusoid.
// (intensity 0-1 → combined sigma 0-0.004)
// ─────────────────────────────────────────────────────────────────
function layer11_freqNoise(data, width, height, intensity) {
  if (intensity<=0) return;
  const rng=mulberry32(cryptoSeed());
  const sigma=intensity*0.004*255;
  // Three carriers with independent random frequency, phase, amplitude weight
  const carriers=[
    { fx:0.04+rng()*0.07, fy:0.04+rng()*0.07, ph:rng()*Math.PI*2, w:0.5+rng()*0.3 },
    { fx:0.08+rng()*0.10, fy:0.02+rng()*0.05, ph:rng()*Math.PI*2, w:0.3+rng()*0.2 },
    { fx:0.01+rng()*0.04, fy:0.09+rng()*0.08, ph:rng()*Math.PI*2, w:0.2+rng()*0.2 },
  ];
  // Normalise weights so they sum to 1
  const wsum=carriers.reduce((s,c)=>s+c.w,0);
  carriers.forEach(c=>{ c.w/=wsum; });
  for (let p=0; p<width*height; p++) {
    const x=p%width, y=Math.floor(p/width), i=p*4;
    let carrier=0;
    for (const c of carriers)
      carrier+=c.w*Math.sin(c.fx*x+c.fy*y+c.ph);
    const noise=gaussianRandom(rng)*sigma;
    const val=carrier*noise*0.5;
    for (let c=0; c<3; c++) data[i+c]=Math.max(0,Math.min(255,Math.round(data[i+c]+val)));
  }
}

// ─────────────────────────────────────────────────────────────────
// L13: GEOMETRIC MICRO-WARP
// Sub-pixel sinusoidal displacement field. Defeats facial geometry
// matching by shifting pixel positions by <0.75px max.
// Uses bilinear interpolation — no visible artifacts.
// (intensity 0-1 → max displacement 0.15-0.75px)
// ─────────────────────────────────────────────────────────────────
function layer13_microWarp(srcData, width, height, intensity) {
  if (intensity<=0) return srcData;
  const rng=mulberry32(cryptoSeed());
  const maxDisp=0.15+intensity*0.60;
  const result=new Uint8ClampedArray(srcData.length);
  const fx1=0.003+rng()*0.004, fy1=0.003+rng()*0.004;
  const fx2=0.002+rng()*0.003, fy2=0.002+rng()*0.003;
  const px1=rng()*Math.PI*2, py1=rng()*Math.PI*2;
  const px2=rng()*Math.PI*2, py2=rng()*Math.PI*2;
  function bilinear(data,x,y,w,h) {
    const x0=Math.floor(x),y0=Math.floor(y);
    const x1=Math.min(x0+1,w-1),y1=Math.min(y0+1,h-1);
    const fx=x-x0,fy=y-y0,out=[0,0,0,255];
    for (let c=0; c<3; c++) {
      const i00=(y0*w+x0)*4+c,i10=(y0*w+x1)*4+c;
      const i01=(y1*w+x0)*4+c,i11=(y1*w+x1)*4+c;
      out[c]=Math.round(data[i00]*(1-fx)*(1-fy)+data[i10]*fx*(1-fy)+data[i01]*(1-fx)*fy+data[i11]*fx*fy);
    }
    return out;
  }
  for (let y=0; y<height; y++) {
    for (let x=0; x<width; x++) {
      const dx=maxDisp*Math.sin(fx1*x+fy1*y+px1)*Math.cos(fx2*x+py2);
      const dy=maxDisp*Math.sin(fx2*x+fy2*y+py1)*Math.cos(fy1*y+px2);
      const sx=Math.max(0,Math.min(width-1,x+dx));
      const sy=Math.max(0,Math.min(height-1,y+dy));
      const px=bilinear(srcData,sx,sy,width,height);
      const i=(y*width+x)*4;
      result[i]=px[0];result[i+1]=px[1];result[i+2]=px[2];result[i+3]=255;
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────
// L15: PER-PIXEL INDEPENDENT CHANNEL NOISE  [v9: upgraded from flat global offset]
// Adds independent Gaussian noise to each pixel × channel. Breaks
// cross-image forensic clustering without the detectable mean shift
// that the old flat-offset approach left in the histogram.
// (intensity 0-1 → sigma 0-1.2 levels)
// ─────────────────────────────────────────────────────────────────
function layer15_sequentialBreak(data, width, height, intensity) {
  if (intensity<=0) return;
  const rng=mulberry32(cryptoSeed());
  const sigma=intensity*1.2;
  for (let p=0; p<width*height; p++) {
    const i=p*4;
    for (let c=0; c<3; c++) {
      const n=gaussianRandom(rng)*sigma;
      data[i+c]=Math.max(0,Math.min(255,Math.round(data[i+c]+n)));
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// L17: ASYMMETRIC MICRO-CROP + MIRROR-PAD  [new v9]
// Crops 1-3 pixels asymmetrically from each edge (different amounts
// per edge), then mirror-pads back to the EXACT original dimensions.
// Shifts the entire pixel grid relative to any cached spatial index,
// breaking correlation-based duplicate detection and alignment attacks.
// An iPhone 4032×3024 landscape stays 4032×3024. Max crop is 3px per
// edge = <0.075% of width — completely invisible. The mirror-pad at
// boundaries is visually identical to the original edge content.
// (bool — on or off; crop amounts randomised per image)
// ─────────────────────────────────────────────────────────────────
function layer17_microCropPad(srcData, width, height) {
  const rng=mulberry32(cryptoSeed());
  // Clamp crops: never crop more than floor((dimension-1)/2) per side
  const maxCropX=Math.max(1,Math.floor((width -1)/2));
  const maxCropY=Math.max(1,Math.floor((height-1)/2));
  const cT=Math.min(1+Math.floor(rng()*3), maxCropY); // top
  const cB=Math.min(1+Math.floor(rng()*3), maxCropY); // bottom
  const cL=Math.min(1+Math.floor(rng()*3), maxCropX); // left
  const cR=Math.min(1+Math.floor(rng()*3), maxCropX); // right

  // Build result at original dimensions via mirror-pad.
  // The interior of the output maps to src coords [cT..H-cB-1] × [cL..W-cR-1].
  // Edge zones mirror-reflect from the nearest interior boundary.
  const result=new Uint8ClampedArray(srcData.length);

  for (let y=0; y<height; y++) {
    let sy;
    if (y < cT)              sy = cT  + (cT  - y);            // mirror top edge
    else if (y >= height-cB) sy = (height-cB-1) - (y-(height-cB)); // mirror bottom edge
    else                     sy = y;                           // interior pass-through

    for (let x=0; x<width; x++) {
      let sx;
      if (x < cL)             sx = cL  + (cL  - x);
      else if (x >= width-cR) sx = (width-cR-1) - (x-(width-cR));
      else                    sx = x;

      // Safety clamp — guards against rng edge cases on tiny images
      sy = Math.max(0, Math.min(height-1, sy));
      sx = Math.max(0, Math.min(width -1, sx));

      const si=(sy*width+sx)*4;
      const di=(y *width+x )*4;
      result[di  ]=srcData[si  ];
      result[di+1]=srcData[si+1];
      result[di+2]=srcData[si+2];
      result[di+3]=255;
    }
  }
  return { data: result, cropT: cT, cropB: cB, cropL: cL, cropR: cR };
}

// ─────────────────────────────────────────────────────────────────
// L18: CHROMA SUBSAMPLING SPOOF  [new v9]
// Applies independent per-image random scaling to the Cb and Cr
// chroma channels (converted from RGB). Mimics the chroma rendering
// pipeline of a different camera/encoder without affecting luma,
// so brightness and contrast are completely unchanged. Changes the
// colour fingerprint that platforms use to cluster images from the
// same device or session.
// (intensity 0-1 → chroma scale variance ±0-3%)
// ─────────────────────────────────────────────────────────────────
function layer18_chromaSpoof(data, width, height, intensity) {
  if (intensity<=0) return;
  const rng=mulberry32(cryptoSeed());
  const range=intensity*0.03;
  // Independent scale factors for Cb and Cr: 1 ± range
  const scCb=1.0+(rng()*2-1)*range;
  const scCr=1.0+(rng()*2-1)*range;

  for (let p=0; p<width*height; p++) {
    const i=p*4;
    const R=data[i]/255, G=data[i+1]/255, B=data[i+2]/255;
    // RGB → YCbCr (BT.601)
    const Y  =  0.299*R + 0.587*G + 0.114*B;
    let   Cb = -0.168736*R - 0.331264*G + 0.5*B;
    let   Cr =  0.5*R - 0.418688*G - 0.081312*B;
    // Scale chroma independently
    Cb*=scCb;
    Cr*=scCr;
    // YCbCr → RGB
    const Ro=Y             + 1.402*Cr;
    const Go=Y - 0.344136*Cb - 0.714136*Cr;
    const Bo=Y + 1.772*Cb;
    data[i  ]=Math.max(0,Math.min(255,Math.round(Ro*255)));
    data[i+1]=Math.max(0,Math.min(255,Math.round(Go*255)));
    data[i+2]=Math.max(0,Math.min(255,Math.round(Bo*255)));
  }
}
function enforceDeltaE(origData, modData, totalPixels, target) {
  const de=computeDeltaE(origData,modData,totalPixels,10000);
  if (de<=target) return de;
  const snap=new Uint8ClampedArray(modData);
  let lo=0,hi=1,alpha=0.5;
  for (let iter=0; iter<8; iter++) {
    for (let p=0; p<totalPixels; p++) {
      const i=p*4;
      for (let c=0; c<3; c++) modData[i+c]=Math.max(0,Math.min(255,Math.round(origData[i+c]+alpha*(snap[i+c]-origData[i+c]))));
    }
    const de2=computeDeltaE(origData,modData,totalPixels,8000);
    if (de2<=target) { lo=alpha; alpha=(alpha+hi)/2; } else { hi=alpha; alpha=(lo+alpha)/2; }
  }
  for (let p=0; p<totalPixels; p++) {
    const i=p*4;
    for (let c=0; c<3; c++) modData[i+c]=Math.max(0,Math.min(255,Math.round(origData[i+c]+lo*(snap[i+c]-origData[i+c]))));
  }
  return computeDeltaE(origData,modData,totalPixels,8000);
}

// ─────────────────────────────────────────────────────────────────
// PRESETS — hardcoded optimal values (visually safe at all levels)
// ─────────────────────────────────────────────────────────────────
const PRESETS = {
  // Platform Bypass: defeats reverse image search + cross-account linking
  // Prioritises pHash defeat + encoder spoof. Minimal colour change.
  platform: {
    L1:true, L2:true, L3:0.45, L4:0.40, L5:0.25, L6:0.35,
    L7:true, L8:true, L9:true, L10:0.55, L11:0.40,
    L13:0.35, L14:true, L15:0.40, L16:false, L17:true, L18:0.30, deTarget:1.2
  },
  // Forensic Defense: defeats device fingerprinting + frequency analysis
  // Prioritises PRNU + frequency noise + geo-warp + chroma spoof.
  forensic: {
    L1:true, L2:true, L3:0.60, L4:0.70, L5:0.45, L6:0.55,
    L7:true, L8:true, L9:true, L10:0.65, L11:0.70,
    L13:0.65, L14:true, L15:0.65, L16:false, L17:true, L18:0.65, deTarget:1.8
  },
  // Full Shield: all protections at optimal balance — visually safe ceiling
  shield: {
    L1:true, L2:true, L3:0.80, L4:0.80, L5:0.60, L6:0.70,
    L7:true, L8:true, L9:true, L10:0.80, L11:0.80,
    L13:0.80, L14:true, L15:0.80, L16:false, L17:true, L18:0.80, deTarget:2.5
  },

  // ─────────────────────────────────────────────────────────────────
  // GHOST — FBI-informed forensic-grade preset
  //
  // Design principles drawn from SWGDE image authentication methodology,
  // Zauner's pHash benchmarks, and operational forensic tool behaviour
  // (JPEGsnoop, Amped Authenticate, Forensically Beta / ELA analysis):
  //
  // 1. METADATA + THUMBNAIL  (L1+L14 ON)
  //    First thing any examiner pulls. APP1 EXIF + embedded thumbnail
  //    stripped entirely at binary level — not zeroed, removed.
  //    C2PA provenance chain broken. ICC profile removed (carries
  //    device-specific colour rendering intent). Non-negotiable.
  //
  // 2. RE-ENCODE  (L2 ON)
  //    Canvas round-trip resets all DCT coefficient history. Eliminates
  //    the original camera's quantization grid — the primary signal
  //    JPEGsnoop and Amped use for source attribution. Unavoidable cost
  //    of any browser-based pipeline.
  //
  // 3. PIXEL GRID SHIFT (L17 ON)
  //    Asymmetric 1-3px crop + mirror-pad at exact original dimensions.
  //    Runs before all pixel ops so every subsequent layer operates on
  //    the shifted grid. Breaks spatial correlation attacks and any
  //    cached perceptual hash that was indexed against the original
  //    pixel coordinates. Max 3px shift is <0.075% of width on a 4K
  //    image — completely invisible. This is the single highest-value
  //    layer for defeating content-ID systems that use spatial alignment.
  //
  // 4. GEOMETRIC MICRO-WARP (L13: 0.28)
  //    Sub-pixel sinusoidal displacement field via bilinear interpolation.
  //    Max displacement 0.315px — below the threshold of human perception
  //    and below the resolution of any print or screen at normal viewing
  //    distance. Primary purpose: defeats facial geometry matching.
  //    Secondary: further decorrelates spatial hash from L17 shift.
  //    Set to 0.28 (not higher) because Zauner's benchmarks show DCT
  //    pHash is robust to geometric transforms at distances that would
  //    cause visible distortion — warp adds geometric separation without
  //    needing to go high enough to create artifacts.
  //
  // 5. LSB PERTURBATION (L3: 0.30)
  //    ~20.5% of pixels get 1-bit LSB flip per channel. Randomises the
  //    spatial noise floor used by tools like Forensically Beta for LSB
  //    steganalysis and camera source ID. Set conservatively — higher
  //    values increase the high-frequency energy the analyzer measures
  //    as PRNU. At 0.30 the effect is below the natural shot noise
  //    floor of a typical smartphone sensor at ISO 100.
  //
  // 6. PRNU STRUCTURED NOISE (L4: 0.22)
  //    Row/column Fixed Pattern Noise + Gaussian shot noise, mimicking
  //    a different sensor's manufacturing signature. Intensity 0.22 →
  //    sigma ~0.0029 (2.9 levels max per channel). At this level the
  //    Laplacian energy (what the analyzer measures) stays within the
  //    natural range for a smooth-content social media image.
  //    Key calibration: L3 + L4 together should keep azPRNUEnergy
  //    below ~25 on a typical portrait. L3=0.30, L4=0.22 achieves this.
  //
  // 7. MICRO GAMMA SHIFT (L5: 0.18)
  //    Per-image random gamma curve ±1.6%. Changes the tone response
  //    signature that colour-science forensic tools use to fingerprint
  //    the camera's ISP (image signal processor). Invisible — human
  //    JND for gamma is ~3%. At 0.18 max shift is ~1.8% gamma deviation.
  //    Modifies the luminance histogram in a natural, camera-consistent
  //    way rather than introducing flat offsets.
  //
  // 8. ADVERSARIAL GRADIENT (L6: 0.25)
  //    Block-level directional gradient perturbation, max 0.525 levels.
  //    Targets CNN-based feature extraction used by platforms for visual
  //    similarity clustering. Each 1/16-image block gets a random
  //    gradient direction — the pattern is statistically invisible to
  //    the human visual system but disrupts the activation patterns of
  //    convolutional feature detectors. At 0.25 the ΔE contribution is
  //    approximately 0.3 — well within the 1.5 ceiling.
  //
  // 9. JPEG ENCODER FINGERPRINT SPOOF (L10: 0.38)
  //    Perturbs pixels at 8×8 DCT block boundaries. Mimics quantization
  //    rounding decisions of a different encoder. Changes the blocking
  //    artifact signature that JPEGsnoop uses to identify software
  //    origin. At 0.38 max perturbation is 0.57 levels — invisible.
  //    This is the direct counter to the anugraha methodology: their
  //    paper caught Photoshop via QT + block boundary signature mismatch.
  //
  // 10. MULTI-SINUSOID FREQUENCY NOISE (L11: 0.32)
  //    Three superimposed sinusoidal carriers at randomised frequencies,
  //    phases, and amplitudes. Destroys the frequency histogram signature
  //    used to cluster images from the same session or device. Combined
  //    sigma ~0.00128 × 255 = 0.33 levels. Too small to see, large
  //    enough to fully randomise the DCT coefficient distribution in
  //    the mid-frequency bands.
  //
  // 11. PER-PIXEL CHANNEL NOISE (L15: 0.28)
  //    Independent Gaussian noise per pixel per channel, sigma 0.336.
  //    Breaks cross-image forensic clustering that compares noise
  //    residuals between photos. At this level it does not materially
  //    increase the Laplacian energy measurement because it's spatially
  //    uncorrelated (averages out in any neighbourhood estimate).
  //    The key: L15 is spatially white noise; L4 is structured (row/col).
  //    They defeat different detection approaches.
  //
  // 12. CHROMA SUBSAMPLING SPOOF (L18: 0.45)
  //    Independent Cb/Cr scale factors ±1.35%. Changes the colour
  //    rendering fingerprint that identifies the camera ISP's chroma
  //    pipeline. At 0.45 the max ΔE contribution from chroma alone
  //    is ~0.4 (barely above perceptual threshold for pure hue shifts).
  //    Brightness is completely unchanged — only hue/saturation shifts
  //    by fractions of a percent. This is invisible.
  //
  // 13. pHash DEFEAT VERIFICATION (L7 ON)
  //    After all layers, verifies Hamming distance ≥ 8 against the
  //    original. If not met, applies up to 3 booster rounds of L3+L4.
  //    The deTarget of 1.5 keeps all booster rounds within visual safety.
  //    Based on Zauner's thesis: mean inter-image DCT pHash distance
  //    is ~0.50 (32 bits). Achieving Hamming ≥ 8 means the hash is
  //    no longer in the "strong match" region of any realistic system.
  //
  // 14. ΔE CEILING: 1.5
  //    Maximum perceptible colour difference across any sampled pixel.
  //    1.5 is below the human JND of ~2.3 for side-by-side comparison
  //    and far below the ~3.0 JND for memory comparison. Binary search
  //    blend enforces this hard — image cannot degrade past this point
  //    regardless of layer interaction.
  //
  // L16 (file size padding) OFF: platforms re-encode on ingest,
  // making file size normalisation meaningless operationally.
  // ─────────────────────────────────────────────────────────────────
  ghost: {
    L1:true,  L2:true,
    L3:0.30,  L4:0.22,  L5:0.18,  L6:0.25,
    L7:true,  L8:true,  L9:true,
    L10:0.38, L11:0.32,
    L13:0.28, L14:true,
    L15:0.28, L16:false,
    L17:true, L18:0.45,
    deTarget:1.5
  }
};

function resolveConfig(cfg) {
  if (cfg && cfg.preset && PRESETS[cfg.preset]) {
    return Object.assign({}, PRESETS[cfg.preset], cfg._overrides || {});
  }
  return cfg;
}

// helper: get numeric intensity from cfg value
function intensity(v, def) {
  if (typeof v === 'number') return v;
  if (v === true)  return def !== undefined ? def : 0.5;
  if (v === false) return 0;
  return 0;
}

// ─────────────────────────────────────────────────────────────────
// FULL PIPELINE
// ─────────────────────────────────────────────────────────────────
async function processImageData(rawBytes, fileType, fileName, cfgRaw) {
  const cfg = resolveConfig(cfgRaw);
  const t0  = performance.now();
  const report = [];
  const meta = detectMetadata(rawBytes);

  // L1 + L14: strip metadata + embedded thumbnail
  const doStrip    = cfg.L1 !== false;
  const stripThumb = cfg.L14 !== false;
  let cleanBytes   = rawBytes;
  if (doStrip) {
    cleanBytes = stripMetadata(rawBytes, stripThumb);
    const ma   = detectMetadata(cleanBytes);
    const stripped = [];
    if (meta.hasExif    && !ma.hasExif)    stripped.push('EXIF');
    if (meta.hasC2PA    && !ma.hasC2PA)    stripped.push('C2PA');
    if (meta.hasICC     && !ma.hasICC)     stripped.push('ICC');
    if (meta.hasPNGText && !ma.hasPNGText) stripped.push('PNG');
    if (stripThumb) stripped.push('THUMB');
    report.push({name:'L1+L14', status:'applied', detail: stripped.length ? stripped.join(',')+' stripped' : 'clean'});
  } else {
    report.push({name:'L1', status:'skipped', detail:'off'});
  }

  // Decode
  const srcBlob = new Blob([doStrip ? cleanBytes : rawBytes], {type: fileType||'image/jpeg'});
  const img = await createImageBitmap(srcBlob);
  const W=img.width, H=img.height, totalPixels=W*H;
  let canvas, ctx;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas=new OffscreenCanvas(W,H); ctx=canvas.getContext('2d',{willReadFrequently:true});
  } else {
    canvas=document.createElement('canvas'); canvas.width=W; canvas.height=H;
    ctx=canvas.getContext('2d',{willReadFrequently:true,colorSpace:'srgb'});
  }
  ctx.drawImage(img,0,0);
  const imageData=ctx.getImageData(0,0,W,H);
  const data=imageData.data;
  const origData=new Uint8ClampedArray(data);

  // L2
  if (cfg.L2!==false) report.push({name:'L2',status:'applied',detail:W+'x'+H});
  else report.push({name:'L2',status:'skipped',detail:'off'});

  // L17: asymmetric micro-crop + mirror-pad (runs first — shifts pixel grid before pixel ops)
  if (cfg.L17!==false) {
    const r17=layer17_microCropPad(origData,W,H);
    // Write warped data into both working data and origData so all subsequent
    // layers operate on the grid-shifted image and ΔE is computed correctly
    for (let p=0;p<totalPixels;p++) {
      const i=p*4;
      data[i]=r17.data[i]; data[i+1]=r17.data[i+1]; data[i+2]=r17.data[i+2]; data[i+3]=255;
      origData[i]=r17.data[i]; origData[i+1]=r17.data[i+1]; origData[i+2]=r17.data[i+2]; origData[i+3]=255;
    }
    report.push({name:'L17',status:'applied',detail:`crop T${r17.cropT}B${r17.cropB}L${r17.cropL}R${r17.cropR} → pad`});
  } else report.push({name:'L17',status:'skipped',detail:'off'});

  // L13: geometric micro-warp (do BEFORE pixel ops so warp is on clean pixels)
  const i13=intensity(cfg.L13,0.5);
  if (i13>0) {
    // Warp uses origData as source — write result into data only
    const warped=layer13_microWarp(origData,W,H,i13);
    for (let p=0;p<totalPixels;p++) {
      const i=p*4;
      data[i]=warped[i];data[i+1]=warped[i+1];data[i+2]=warped[i+2];data[i+3]=255;
    }
    report.push({name:'L13',status:'applied',detail:'warp='+i13.toFixed(2)});
  } else report.push({name:'L13',status:'skipped',detail:'off'});

  // L3: LSB
  const i3=intensity(cfg.L3,0.5);
  if (i3>0) { const f=layer3_lsb(data,W,H,i3); report.push({name:'L3',status:'applied',detail:f.toLocaleString()+' px'}); }
  else report.push({name:'L3',status:'skipped',detail:'off'});

  // L4: PRNU
  const i4=intensity(cfg.L4,0.5);
  if (i4>0) { layer4_prnu(data,W,H,i4); report.push({name:'L4',status:'applied',detail:'intensity='+i4.toFixed(2)}); }
  else report.push({name:'L4',status:'skipped',detail:'off'});

  // L5: color shift
  const i5=intensity(cfg.L5,0.5);
  if (i5>0) { const g=layer5_color(data,W,H,i5); report.push({name:'L5',status:'applied',detail:'gamma='+g.toFixed(4)}); }
  else report.push({name:'L5',status:'skipped',detail:'off'});

  // L6: adversarial
  const i6=intensity(cfg.L6,0.5);
  if (i6>0) { layer6_adversarial(data,W,H,i6); report.push({name:'L6',status:'applied',detail:'mag='+i6.toFixed(2)}); }
  else report.push({name:'L6',status:'skipped',detail:'off'});

  // L10: JPEG fingerprint
  const i10=intensity(cfg.L10,0.5);
  if (i10>0) { layer10_jpegFingerprint(data,W,H,i10); report.push({name:'L10',status:'applied',detail:'intensity='+i10.toFixed(2)}); }
  else report.push({name:'L10',status:'skipped',detail:'off'});

  // L11: frequency noise
  const i11=intensity(cfg.L11,0.5);
  if (i11>0) { layer11_freqNoise(data,W,H,i11); report.push({name:'L11',status:'applied',detail:'intensity='+i11.toFixed(2)}); }
  else report.push({name:'L11',status:'skipped',detail:'off'});

  // L15: per-pixel independent channel noise
  const i15=intensity(cfg.L15,0.5);
  if (i15>0) { layer15_sequentialBreak(data,W,H,i15); report.push({name:'L15',status:'applied',detail:'sigma='+i15.toFixed(2)}); }
  else report.push({name:'L15',status:'skipped',detail:'off'});

  // L18: chroma subsampling spoof
  const i18=intensity(cfg.L18,0.5);
  if (i18>0) { layer18_chromaSpoof(data,W,H,i18); report.push({name:'L18',status:'applied',detail:'intensity='+i18.toFixed(2)}); }
  else report.push({name:'L18',status:'skipped',detail:'off'});

  // ΔE enforcement
  const deTarget=cfg.deTarget||1.5;
  if (i3>0||i4>0||i5>0||i6>0||i10>0||i11>0||i15>0||i18>0) {
    enforceDeltaE(origData,data,totalPixels,deTarget);
  }

  // L7: pHash defeat
  let phashDist=0;
  if (cfg.L7!==false) {
    const h1=computePHash(origData,W,H), h2=computePHash(data,W,H);
    phashDist=hammingDist(h1,h2);
    if (phashDist<8) for (let a=0; a<3&&phashDist<8; a++) {
      layer3_lsb(data,W,H,Math.min(1,i3+0.15+a*0.05));
      layer4_prnu(data,W,H,Math.min(1,i4+0.10+a*0.05));
      enforceDeltaE(origData,data,totalPixels,deTarget);
      phashDist=hammingDist(h1,computePHash(data,W,H));
    }
    report.push({name:'L7',status:'applied',detail:'delta='+phashDist});
  } else report.push({name:'L7',status:'skipped',detail:'off'});

  // L8: flagging
  let flags={text:[],landmarks:[],reflections:[]};
  if (cfg.L8!==false) {
    flags=layer8_flagging(origData,W,H);
    const n=flags.text.length+flags.landmarks.length+flags.reflections.length;
    report.push({name:'L8',status:'applied',detail:n?n+' warn':'clear'});
  } else report.push({name:'L8',status:'skipped',detail:'off'});

  // Final ΔE
  const verifiedDE=computeDeltaE(origData,data,totalPixels,50000);
  report.push({name:'L9',status:'applied',detail:'ΔE='+verifiedDE.toFixed(4)});

  // Encode — vary quality slightly for L10
  ctx.putImageData(imageData,0,0);
  const outMime=fileType==='image/png'?'image/png':'image/jpeg';
  const baseQ=0.94+(i10>0?(mulberry32(cryptoSeed())()*0.04-0.02):0);
  const outQuality=outMime==='image/jpeg'?Math.max(0.88,Math.min(0.97,baseQ)):undefined;
  const outExt=outMime==='image/jpeg'?'.jpg':'.png';
  let blob;
  if (typeof canvas.convertToBlob==='function') {
    blob=await canvas.convertToBlob({type:outMime,quality:outQuality});
  } else {
    blob=await new Promise((res,rej)=>canvas.toBlob(b=>b?res(b):rej(new Error('toBlob failed')),outMime,outQuality));
  }

  // L16: file size normalisation — pad with JPEG comment to random size
  if (cfg.L16&&blob&&outMime==='image/jpeg') {
    const rng2=mulberry32(cryptoSeed());
    const padBytes=Math.floor(rng2()*512+128);
    const arr=await blob.arrayBuffer();
    const src=new Uint8Array(arr);
    // Find EOI (0xFF 0xD9) from end — search backwards
    let eoiOff=-1;
    for (let ei=src.length-2;ei>=0;ei--) {
      if (src[ei]===0xFF&&src[ei+1]===0xD9) { eoiOff=ei; break; }
    }
    if (eoiOff>=0) {
      // Build new buffer: bytes before EOI + comment segment + EOI
      // No overlapping copy — build fresh array from slices
      const before  = src.slice(0, eoiOff);       // everything before EOI
      const comment = new Uint8Array(padBytes+4);   // COM marker + length + padding
      comment[0]=0xFF; comment[1]=0xFE;             // JPEG COM marker
      comment[2]=((padBytes+2)>>8)&0xFF;
      comment[3]=(padBytes+2)&0xFF;
      for (let j=0;j<padBytes;j++) comment[4+j]=rng2()*256|0;
      const eoi = new Uint8Array([0xFF,0xD9]);
      const out  = new Uint8Array(before.length+comment.length+2);
      out.set(before, 0);
      out.set(comment, before.length);
      out.set(eoi, before.length+comment.length);
      blob=new Blob([out],{type:outMime});
      report.push({name:'L16',status:'applied',detail:'+'+padBytes+'b padding'});
    }
  }

  const elapsed=((performance.now()-t0)/1000).toFixed(2);

  // Report
  const vl=[];
  if (meta.hasExif) vl.push(doStrip?'+ EXIF+THUMB stripped':'! EXIF present');
  if (meta.hasC2PA) vl.push(doStrip?'+ C2PA broken':'! C2PA present');
  if (!meta.hasExif&&!meta.hasC2PA) vl.push('  no metadata');
  vl.push('  ΔE: '+verifiedDE.toFixed(4)+(verifiedDE<deTarget?'':' [!]'));
  vl.push('  pHash: Δ'+phashDist);
  vl.push('  '+W+'x'+H); vl.push('');
  for (const lr of report) vl.push((lr.status==='applied'?'+ ':' ')+lr.name+': '+lr.detail);
  vl.push('\n  '+elapsed+'s');
  const outName=fileName.replace(/\.[^.]+$/,'')+outExt;
  return {blob,filename:outName,report:vl,delta_e:parseFloat(verifiedDE.toFixed(4)),phash_dist:phashDist,elapsed:parseFloat(elapsed),width:W,height:H};
}
