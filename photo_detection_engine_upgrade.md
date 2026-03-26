# Photo-Based Suspicious User Detection: State-of-the-Art Engine Upgrade

**Document Type:** Research & Architecture Specification  
**Scope:** Image-only, stateless, real-time analysis  
**Constraints:** No face recognition · No reverse image search · No cross-account comparison · No external APIs  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Industry Landscape: How Leading Platforms Detect Fraudulent Photos](#2-industry-landscape)
3. [Deep Research Insights: Forensic Science Foundations](#3-deep-research-insights)
4. [Threat Model: Who Uploads Fake Photos and How](#4-threat-model)
5. [Core Detection Systems Architecture](#5-core-detection-systems-architecture)
6. [Module 1 — Compression & Processing History Engine](#6-module-1--compression--processing-history-engine)
7. [Module 2 — Cross-Image Consistency Engine](#7-module-2--cross-image-consistency-engine)
8. [Module 3 — Synthetic / AI-Generated Image Detector](#8-module-3--synthetic--ai-generated-image-detector)
9. [Module 4 — Platform-Origin Fingerprint Engine](#9-module-4--platform-origin-fingerprint-engine)
10. [Module 5 — Noise & Sensor Pattern Analysis](#10-module-5--noise--sensor-pattern-analysis)
11. [Module 6 — Metadata & File Forensics](#11-module-6--metadata--file-forensics)
12. [Module 7 — Editing & Post-Processing Detection](#12-module-7--editing--post-processing-detection)
13. [Module 8 — Scene & Lifestyle Consistency](#13-module-8--scene--lifestyle-consistency)
14. [Risk Scoring Model](#14-risk-scoring-model)
15. [False Positive Protection](#15-false-positive-protection)
16. [Non-Breaking Upgrade Strategy](#16-non-breaking-upgrade-strategy)
17. [Implementation Roadmap](#17-implementation-roadmap)
18. [Adversarial Scenarios & Countermeasures](#18-adversarial-scenarios--countermeasures)
19. [Performance Targets & Pipeline Design](#19-performance-targets--pipeline-design)
20. [References & Academic Sources](#20-references--academic-sources)

---

## 1. Executive Summary

Dating platforms face a distinct and difficult fraud problem: bad actors upload profile photos that were **not taken by the real account owner** — images stolen from social media, purchased from stock sites, AI-generated, or scraped in bulk. Unlike social networks, dating platforms make profile photos the primary trust signal, so photo fraud is the foundational attack vector for romance scams, catfishing, and bot networks.

This document specifies an upgrade to an existing photo analyzer engine that closes the gap between the current system and the state-of-the-art detection used by leading platforms. The upgrade is:

- **Stateless** — each upload batch is analyzed in isolation with no cross-account database lookups
- **Real-time capable** — parallelized pipeline targeting < 3 seconds for a full profile set
- **Non-breaking** — layered on top of existing infrastructure via feature flags
- **Multi-signal** — eight independent forensic modules whose outputs are fused into a single 0–100 risk score

The primary question the engine answers:

> *"Do these images look like they were taken by the same real person for this account — or do they look downloaded / reused from external sources?"*

---

## 2. Industry Landscape: How Leading Platforms Detect Fraudulent Photos

### 2.1 The Industry Problem

Romance scam losses exceeded **$1.3 billion in 2022** (FTC data), with bad actors primarily weaponizing fraudulent dating profiles. In 2024, cybersecurity researchers identified over **1.2 million AI-generated profiles** across major dating platforms — most designed for financial fraud, data harvesting, or psychological manipulation. The scale of the problem has driven a wave of public investment in photo detection infrastructure across the industry.

Research from major platforms consistently shows that **fake profiles and scam risk are users' #1 safety concern**, with approximately 46% of female users expressing anxiety over whether their matches are authentic.

### 2.2 The Two-Layer Detection Architecture Used Industry-Wide

Analysis of public technical disclosures, academic partnerships, and platform trust & safety documentation reveals that leading platforms use a **two-layer approach**:

**Layer 1 — Upload-Time Photo Forensics (Passive)**  
Runs automatically on every uploaded photo. No user interaction required. Analyzes the images themselves for forensic signals of inauthenticity. This is the layer this document focuses on upgrading.

**Layer 2 — Liveness Verification (Active, on Suspicion)**  
Triggered when Layer 1 raises flags above a threshold, or required at onboarding in regulated markets. Requires the user to take a real-time selfie video for liveness and face-match verification, powered by 3D liveness technology. Industry outcomes from this layer include 60% reductions in bad actor exposure and 40% drops in suspicious behavior reports.

> **Important:** This document exclusively addresses **Layer 1** — passive forensic analysis of uploaded photos. It explicitly excludes all face matching, identity databases, liveness checks, and cross-account comparisons. It represents the most privacy-preserving and technically sophisticated component of the detection stack.

### 2.3 What Leading Platforms Actually Look For (Non-Attributed)

Based on public trust & safety research, academic collaboration papers, and technical forensic literature, leading platforms' passive photo analysis engines examine the following signals:

| Signal Category | What It Detects |
|----------------|-----------------|
| **Compression history** | Images that have been saved → downloaded → re-saved multiple times, indicating sourcing from external platforms |
| **Metadata anomalies** | Absent, stripped, or inconsistent EXIF data; multiple devices apparent in one profile |
| **AI/GAN generation** | Synthetic faces created by generative models (StyleGAN, DALL-E, Midjourney, etc.) |
| **Platform origin fingerprints** | Compression and resizing patterns that identify images sourced from social media |
| **Cross-image consistency** | Mismatched device noise, inconsistent compression pipelines across a profile's images |
| **Editing artifacts** | Over-processing, skin smoothing, filter pipelines inconsistent with organic phone photography |
| **Behavioral signals** | Rapid uploads, images renamed uniformly, bulk upload patterns |

The most sophisticated platforms combine **at least five of these signals** before triggering any action, explicitly requiring multiple independent detections to protect legitimate users.

### 2.4 Key Industry Finding: The Multi-Signal Requirement

A major lesson from operational trust & safety teams: **single-signal detection has unacceptably high false positive rates**. Real users:
- Use multiple devices over time
- Edit and filter their photos
- Take screenshots of their own images to re-share
- Upload old photos from different eras of their life

The industry standard is to require **at least 3 corroborating signals** before taking automated action, with a human moderation review layer for edge cases. The best-performing systems (those achieving ~95% accuracy on spam/scam profiles while reducing user-reported false positives by 45%) all use ensemble signal fusion rather than single-feature classification.

---

## 3. Deep Research Insights: Forensic Science Foundations

### 3.1 JPEG Compression Forensics — The Core Forensic Primitive

JPEG compression is the backbone of digital image forensics. Understanding it deeply is essential because virtually all fraud involves saving, re-encoding, and uploading images, and **each re-encoding cycle leaves irreversible traces**.

#### How JPEG Compression Works (Relevant to Forensics)

1. The image is divided into 8×8 pixel blocks
2. Each block undergoes a **Discrete Cosine Transform (DCT)**, converting spatial pixel values to frequency coefficients
3. Coefficients are divided by a **quantization table** (QT) — this is lossy and irreversible
4. The quantized coefficients are entropy-coded and stored

The quantization step is the forensic gold mine. Different cameras, apps, and platforms use different quantization tables (or quality factors). When an image is JPEG-compressed, it carries the fingerprint of that specific quantization table in its DCT coefficient distribution.

#### Double JPEG Compression (DJPEG) Detection

When an image is **saved → re-opened → re-saved**, the following forensic trace emerges:

- The DCT coefficients are quantized **twice** — once by the original encoder, once by the second encoder
- This creates characteristic **histogram anomalies** in the DCT coefficient distribution
- Specifically: if Q2 > Q1 (second quality higher than first), the coefficients exhibit "blocking artifacts" from the coarser first quantization that survive the second pass
- If Q2 ≤ Q1, the double compression is harder to detect but still leaves statistical traces in the distribution of AC coefficient residuals

**Operational significance for dating fraud:** A user who downloads an image from social media and uploads it has subjected it to at minimum 3 compression cycles: original capture → platform upload compression → re-download → platform re-upload. Each cycle leaves detectable traces. A real user photographing themselves and uploading directly has a compression history of 1–2 cycles maximum.

**Academic grounding:** Detection methods relying on DCT coefficient analysis (Mode Based First Digit Features, third-order polynomial fitting on AC coefficient distribution convergence curves) achieve high accuracy even for same-quantization-table double compression, historically the hardest case. Recent convolutional autoencoder approaches further improve robustness.

#### Quantization Table Estimation

Even without access to the original quantization table, it is possible to **estimate** the quantization table used in a prior compression pass by analyzing the periodic patterns in DCT coefficient histograms. This is the foundation of "ghost image" detection — a forged region has a different compression history than the authentic surrounding.

For profile photo analysis, quantization table mismatches **across images in the same profile** are a powerful cross-image consistency signal.

### 3.2 Multi-Generation Image Detection

Each generation of save-download-re-save adds:

- **Blocking artifacts** — visible 8×8 grid-aligned degradation in uniform regions
- **Ringing artifacts** — halos around high-contrast edges from successive lossy encoding
- **Histogram smoothing** — pixel value distributions become unnaturally smooth as information is averaged across multiple quantization passes
- **Frequency domain traces** — the power spectrum of natural images follows a 1/f² decay law; multiple re-encodings alter this decay curve in detectable ways

**Practical implementation:** Compute the azimuthal average of the 2D FFT of each image. Natural, once-compressed photos cluster in a predictable band. Multiply-processed images deviate from this band in measurable ways.

### 3.3 Platform-Specific Compression Signatures

Different social media platforms apply characteristic processing pipelines to every image they host. These pipelines function as **involuntary watermarks**:

| Platform Type | Known Processing Characteristics |
|--------------|----------------------------------|
| **Major social network (photo-focused)** | Aggressive JPEG re-encoding, strip all EXIF, resize to platform max dimensions, convert color profile, apply perceptual quality optimization |
| **Short-form video platform** | Frame extraction with additional compression, characteristic color normalization, thumbnail quality JPEG |
| **Messaging apps** | Variable quality compression (often 70–85%), resize to fit preview dimensions, strip geotag metadata |
| **Screenshot capture** | PNG-to-JPEG conversion artifacts if re-saved, device-specific screenshot borders/UI chrome residuals |
| **Stock/professional photo sites** | Watermark residuals (even after "removal"), very high quality JPEG (90–95), perceptual sharpening applied at export |

These signatures are detectable through:
1. **Resolution fingerprinting** — platform-specific output dimensions (e.g., 1080×1080, 1080×1350, etc.)
2. **Quantization table matching** — platforms often use reproducible quality settings
3. **Chroma subsampling patterns** — platforms apply specific 4:2:0 or 4:4:4 patterns
4. **Noise floor analysis** — high platform compression removes fine-grained sensor noise

### 3.4 Frequency Domain Analysis — Why FFT/DCT Are Central

The Fourier transform reveals structure that is invisible in pixel space. For fraud detection:

**GAN/AI-generated images** exhibit characteristic peaks in the FFT spectrum:
- GAN upsampling layers (transposed convolutions) produce **checkerboard patterns** at specific spatial frequencies
- These manifest as anomalous peaks in the 2D FFT magnitude spectrum, absent in natural photographs
- The effect persists even after JPEG compression above quality factor 70, though it is attenuated
- DFT-based classifiers achieve >99% accuracy distinguishing StyleGAN/StyleGAN2 faces from real photos (F1 score 99.94% with SVM classifiers in 2024 research)

**Resampling/upscaling detection:**
- When an image is resized, the interpolation algorithm introduces **periodic patterns** in the gradient field
- These are detectable in the frequency domain as evenly-spaced peaks in the power spectrum
- Different interpolation methods (bilinear, bicubic, Lanczos) leave distinct signatures

**JPEG blocking artifacts in frequency domain:**
- The 8×8 block structure of JPEG manifests as **peaks at 1/8 and 3/8 of the Nyquist frequency** in the FFT
- Multiple re-encodings reinforce these peaks
- Can distinguish once-compressed (genuine upload) from multiply-compressed (repurposed image)

### 3.5 PRNU — Sensor Noise as a Device Fingerprint

Photo Response Non-Uniformity (PRNU) noise arises from microscopic manufacturing variations in camera sensors. Every sensor produces a unique, repeatable noise pattern that acts as a **device fingerprint**.

**For stateless cross-image analysis within a single upload batch:**
- Extract the high-frequency noise residual from each image (subtract a denoised version)
- Compute the normalized cross-correlation between noise residuals of images in the same profile
- Real users photographed with the same phone show **correlated noise patterns**
- Stolen images from different sources show **uncorrelated or anti-correlated** noise patterns

**Lightweight implementation (no database required):**
Since we only compare images within a single upload session, we do not need to store or look up any device database. We simply ask: "Are the noise residuals of these images mutually consistent?" This is purely a within-batch comparison.

**Academic note:** Full PRNU analysis is computationally expensive. For real-time use, a lightweight approximation using high-pass filter residuals and normalized cross-correlation on a downsampled version of each image achieves adequate discriminative power at a fraction of the cost.

### 3.6 Real-World Investigator Insights

From digital forensics practitioners and trust & safety operations:

> "When metadata is missing and images show multiple re-save cycles, the compression history becomes the primary authenticity signal. Multiple downloads leave a consistent trail of quality degradation that's hard to fake without knowing exactly what to clean."

> "Highly polished images with consistent lighting across very different environments are a red flag — professional photographers and models produce this, but so do stolen photo sets. The key discriminator is whether the compression history matches the visual polish."

> "Attackers who strip metadata carefully often forget that the images themselves carry their history. A JPEG from Instagram re-uploaded to a dating app carries three layers of compression evidence even with no EXIF."

> "Sets of images with suspiciously consistent quality factors across photos are more suspicious than sets with varying quality — real users take photos with different phones, at different times, in different apps."

---

## 4. Threat Model: Who Uploads Fake Photos and How

Understanding attacker behavior is essential for tuning detection thresholds correctly.

### 4.1 Attacker Categories

| Attacker Type | Photo Source | Sophistication | Volume |
|--------------|-------------|---------------|--------|
| **Romance scammer (manual)** | Social media scrape, usually one target victim's photos | Low–Medium | Low per profile, high total |
| **Bot farm operator** | Bulk purchased photo sets, AI-generated faces | Medium–High | Very high |
| **Catfisher (individual)** | Celebrity/model photos, single social media account | Low | Low |
| **Commercial fake profile service** | AI-generated with varied backgrounds, re-processed through multiple apps | High | High |
| **AI profile generator** | Fully synthetic (Midjourney, DALL-E, StyleGAN) | Very High | Very high |

### 4.2 Common Evasion Techniques (That Our Engine Must Still Detect)

1. **Strip all EXIF metadata** — removes device info, timestamps, GPS
2. **Apply Instagram/Snapchat filter** — adds processing layer to obscure prior history
3. **Crop the image** — disrupts resolution fingerprints, can eliminate metadata
4. **Convert to PNG then back to JPEG** — attempts to reset compression history
5. **Screenshot the image** — adds screenshot noise, changes resolution
6. **Apply subtle blur or skin smoothing** — attempts to mask GAN artifacts
7. **Re-save at high quality (95+)** — tries to reduce double-compression evidence
8. **Mix AI and real images** — uses 1–2 real photos mixed with synthetic faces

**Key finding:** Even sophisticated attackers typically fail to fully erase forensic traces because they do not have access to the original capture pipeline. The combination of JPEG compression history, frequency domain artifacts, and cross-image noise inconsistency provides signals that survive most evasion attempts.

---

## 5. Core Detection Systems Architecture

### 5.1 Pipeline Overview

```
[Profile Photo Upload Batch]
           |
           v
    [Pre-processor]
    - Decode JPEG
    - Extract raw DCT coefficients
    - Extract EXIF/metadata
    - Generate image pyramids
           |
     ┌─────┴──────────────────────────────────────────┐
     │           PARALLEL MODULE EXECUTION              │
     │                                                   │
     │  M1: Compression    M2: Cross-Image   M3: AI/    │
     │      History            Consistency   Synthetic  │
     │                                                   │
     │  M4: Platform       M5: Sensor Noise  M6: Meta   │
     │      Origin             Analysis      Forensics  │
     │                                                   │
     │  M7: Editing        M8: Scene &                  │
     │      Detection          Lifestyle                │
     └────────────────────────────────────────────────┘
                           |
                           v
                [Score Fusion Engine]
                - Weighted combination
                - Confidence intervals
                - Multi-signal gate
                           |
                           v
              [Risk Score: 0–100 + Signal Report]
                           |
              ┌────────────┼─────────────┐
              v            v             v
           AUTO-OK    HUMAN REVIEW   AUTO-FLAG
          (0–30)        (31–69)       (70–100)
```

### 5.2 Inputs and Outputs

**Inputs:** 1–N JPEG/PNG images from a single user's profile upload session  
**Outputs:**
- `risk_score` (0–100 integer)
- `confidence` (0.0–1.0 float)
- `signals_fired` (list of module codes with sub-scores)
- `recommendation` (APPROVE / REVIEW / FLAG)
- `primary_signal` (the highest-weight signal that fired)

---

## 6. Module 1 — Compression & Processing History Engine

**Signal Weight: HIGH**  
**Fires on:** Evidence that images have been through multiple save/re-encode cycles

### 6.1 What It Detects

- Single vs. double JPEG compression
- Quantization table estimation and consistency
- Multi-generation re-encoding traces
- Histogram anomalies from repeated lossy compression
- Blocking artifacts in smooth regions

### 6.2 How to Implement

#### Step 1: Parse Raw DCT Coefficients

Do not fully decode the JPEG. Instead, parse the JPEG bitstream to extract the raw DCT coefficients before dequantization. This preserves the forensic fingerprint that pixel-space decoding would smear.

```
For each 8×8 block in the luminance channel:
  - Extract AC/DC coefficients
  - Store histogram of each DCT position (64 bins per position)
```

#### Step 2: Double Compression Detection via Coefficient Histogram Analysis

A single JPEG shows smooth, approximately Laplacian distribution in its AC coefficient histograms. Double compression creates characteristic **histogram "dips"** or "spikes" at multiples of the first-pass quantization step size.

**Method (Mode-Based First Digit Features):**
1. For each of the 64 DCT positions, compute the histogram of AC coefficients
2. Apply the "blocking artifact metric" — measure periodicity in the histogram at intervals equal to candidate quantization step sizes (1 through 16)
3. A strong periodic signal at step size Q1 in an image nominally encoded at Q2 indicates double compression with original quantization Q1

**Method (Polynomial Fitting on Error Convergence):**
For color JPEG images (most dating photos), fit a 3rd-order polynomial to the error convergence curve of AC coefficient distributions. Single-compressed images show a characteristic convergence pattern; double-compressed images show a measurably different curve that can be classified by a lightweight SVM or logistic regression trained on known single vs. double JPEG examples.

#### Step 3: Blocking Artifact Metric (BAM)

Compute the blockiness score:
```
For each row/column at 8-pixel intervals:
  BAM = mean(|pixel_at_boundary - pixel_inside_block|) / mean(|all_adjacent_differences|)
```
High BAM (>0.15 in smooth regions) indicates heavy prior JPEG compression.

#### Step 4: Quantization Table Fingerprinting

Extract the quantization table embedded in the JPEG file header. Map it against a lookup table of known platform quantization tables (iOS Camera, Android Camera, WhatsApp, various social networks). 

- If the table matches a known social media platform's output: **+15 risk points**
- If the table is completely generic (all 1s after normalization = high quality) and the image shows low-level noise: potentially a professional/stock photo: **+10 risk points**

#### Step 5: Cross-Image Compression Consistency

For each pair of images in the upload batch:
- Compare estimated quantization tables
- Compare DCT coefficient distribution shapes
- Real users with one phone show **high similarity**
- Stolen sets from multiple sources show **high variance**

**Score contribution:**
- Standard deviation of quality factor estimates across images > 15 points: **+12 risk**
- Quantization tables from 3+ distinct sources: **+20 risk**

### 6.3 Evasion Resistance

Attackers who re-save at quality 95 to "reset" compression history inadvertently create a different signature: ultra-high quality but with prior-compression residuals in the coefficient distribution. This combination (very high QF + DJPEG traces) is itself a strong fraud signal because authentic camera uploads almost never exist at QF 95+ with double-compression evidence.

---

## 7. Module 2 — Cross-Image Consistency Engine

**Signal Weight: HIGH**  
**Primary Signal:** The most powerful indicator of stolen/mixed image sets  
**Fires on:** Statistical inconsistency across images that would not occur if all photos came from the same device

### 7.1 Core Principle

A real user photographing themselves consistently over months with their phone produces images with correlated forensic properties. A fraudster assembling photos from multiple victims, multiple social media accounts, or mixed real+AI sources produces images with inconsistent forensic properties.

This module exploits the fact that **consistency within a profile is a strong authenticity signal**.

### 7.2 What to Measure

#### Sensor Noise Pattern Consistency

1. **Noise Residual Extraction:** Apply a strong denoising filter (e.g., wavelet denoising or Wiener filter) to each image. Subtract the denoised version from the original. The residual contains device noise + content-dependent noise.

2. **High-Frequency Residual (Lightweight PRNU Proxy):**
   ```
   residual_i = image_i - denoise(image_i)
   ```

3. **Cross-Image Correlation:**
   ```
   similarity(i, j) = normalized_cross_correlation(residual_i, residual_j)
   ```
   - Same device: similarity typically 0.4–0.8
   - Different devices: similarity typically 0.0–0.2
   - Synthetic images vs. real: typically −0.1 to 0.1

4. **Profile-Level Score:** If mean pairwise similarity < 0.15 across all image pairs: **+25 risk**

#### Compression Pipeline Consistency

Already computed in Module 1. Feed results here:
- Coefficient distribution similarity across images (Kullback-Leibler divergence)
- KL divergence > 0.5 across majority of pairs: **+15 risk**

#### Resolution and Aspect Ratio Consistency

Real phone cameras produce consistent aspect ratios (typically 4:3 or 16:9 with slight variation). Mixed stolen sets often have inconsistent resolutions:

```
aspect_ratios = [width_i / height_i for each image_i]
std_dev(aspect_ratios) > 0.2 → +8 risk
distinct_resolution_groups > 3 → +12 risk
```

#### Sharpness Profile Consistency

Compute Laplacian variance (sharpness metric) for each image. Natural photo sets from the same user cluster in sharpness because they use the same camera with the same settings.

- High variance in sharpness across profile images: moderate risk increase
- Exception: portrait mode vs. standard mode produces legitimate sharpness variance — apply softening coefficient

#### Color Space & White Balance Consistency

Different cameras and different lighting conditions produce different white balance signatures. However, images processed by the same social media platform tend to converge toward that platform's color normalization.

- Cluster images by estimated color temperature
- 3+ distinct color clusters with no obvious progression (not seasonal): **+10 risk**

### 7.3 Real-User Exception Handling

Real users legitimately have:
- Images from different years (older phone + newer phone)
- Vacation photos on a partner's camera
- Screenshots of photos they sent elsewhere

To protect real users:
- Weight temporal spread in metadata (if present): older EXIF dates reduce penalization
- Apply a minimum cluster size of 2 images before treating a cluster as "anomalous"
- Require 4+ images before this module fires at full weight (reduce weight for profiles with ≤3 images)

---

## 8. Module 3 — Synthetic / AI-Generated Image Detector

**Signal Weight: HIGH**  
**Fires on:** Images generated by GANs, diffusion models, or other AI image synthesis tools

### 8.1 Why This Matters

Generative AI models can create hyper-realistic human images often indistinguishable from real photographs, with AI-based detection models consistently outperforming human perception at identifying synthetic content. Tools like AI or Not and SightEngine now analyze micro-patterns in pixels to detect synthetic origin with >92% accuracy.

GAN and diffusion model-generated faces are increasingly common in fraudulent dating profiles. The forensic traces differ from those of stolen real photos, requiring a dedicated detection path.

### 8.2 GAN/Diffusion Artifact Detection

#### Frequency Domain Checkerboard Analysis

GAN architectures use transposed convolutions (deconvolutions) for upsampling. These operations introduce **periodic checkerboard artifacts** in the spatial domain that manifest as **anomalous peaks in the Fourier spectrum**.

**Implementation:**
1. Convert image to grayscale
2. Compute 2D Fast Fourier Transform
3. Compute the magnitude spectrum (center zero-frequency at center)
4. Compute the azimuthal average (1D radial profile of the 2D spectrum)
5. Fit the expected 1/f² decay of natural images
6. Compute residuals between observed spectrum and fitted decay
7. Detect peaks in residuals at frequencies corresponding to GAN upsampling strides (typically N/8, N/4, 3N/8 of the image dimension)

Peaks above 3σ from expected natural image distribution: **+30 risk**

This approach achieves >99% accuracy on StyleGAN/StyleGAN2 generated faces in controlled conditions (F1 score 99.94% with SVM, 97.21% with Random Forest in recent academic work).

#### Spectral Decay Analysis

GAN-generated images exhibit higher energy at mid-high frequencies than real ones, corresponding to small-scale correlations absent in natural photographs. The spectrum decay along the radial dimension is markedly different between real and synthetic faces.

Compute the energy spectral distribution and compare to a calibrated natural-image model. Synthetic images consistently show a characteristic "flattening" of the high-frequency rolloff.

#### Skin Texture Homogeneity

GAN-generated faces exhibit unnaturally consistent skin texture — pore patterns, fine lines, and micro-texture are either absent or suspiciously uniform at the pixel level. Measure:
- Local Binary Pattern (LBP) variance across skin regions
- LBP histogram entropy — synthetic skin has lower entropy
- Gradient magnitude statistics in facial skin areas

LBP entropy below a calibrated threshold in skin regions: **+20 risk**

#### Physiological Consistency Checks (Non-Face-Recognition)

Without identifying anyone:
- **Iris reflection symmetry:** Real eyes have consistent catchlight reflections from the same light source. GAN-generated eyes often show asymmetric or physically impossible reflections.
- **Hair-boundary sharpness:** GANs struggle with hair, often producing unnaturally smooth transitions at hair edges or inconsistent strand detail
- **Background-face boundary:** Synthetic faces often show compression/blending artifacts at the face-background boundary
- **Color bleed at fine structures:** Earrings, glasses, and fine hair strands often show color bleeding or aliasing in synthetic images

Note: These checks operate on image statistics and patch-level analysis, not face recognition.

#### Diffusion Model Artifacts (Post-2022 Threat)

Diffusion models (Stable Diffusion, DALL-E, Midjourney) produce different artifacts than GANs:
- Frequency domain peaks less pronounced but still detectable
- Characteristic noise residual patterns from the denoising process
- Inconsistent fine-detail generation (hands, text, background objects)
- Over-smooth gradients in skin and sky regions

Apply a secondary classifier specifically trained on diffusion model outputs. These models are increasingly used in fake dating profiles and represent the current frontier of the threat.

### 8.3 Handling JPEG Compression of Synthetic Images

JPEG compression at quality factors below 70 causes GAN frequency artifacts to completely disappear. Reducing image size makes the FFT peaks vanish, while enlarging the image further enhances those artifacts.

Attackers who aggressively re-compress synthetic images to erase frequency artifacts inadvertently create a different signal: the combination of **very high double-compression evidence** (from the re-compression) with **absent sensor noise** (synthetic images have no real sensor noise) is itself a strong indicator. Use this conjunction as a fallback signal.

---

## 9. Module 4 — Platform-Origin Fingerprint Engine

**Signal Weight: HIGH**  
**Fires on:** Images that show characteristic processing signatures of social media platforms or stock photo sites

### 9.1 Rationale

When a fraudster downloads an image from a social media platform to use in a fake profile, the image carries the **processing fingerprint** of the source platform. Even after cropping, filtering, and re-saving, many of these fingerprints survive because they're embedded in the compression artifacts and resolution patterns of the image itself.

### 9.2 Platform Fingerprint Signals

#### Resolution Pattern Analysis

Social media platforms output images at characteristic resolutions. These become forensic signals:

```python
PLATFORM_RESOLUTION_SIGNATURES = {
    "social_square":        [(1080, 1080), (640, 640)],
    "social_portrait":      [(1080, 1350), (1080, 1440)],
    "social_landscape":     [(1080, 566)],
    "short_video_thumb":    [(720, 1280), (1080, 1920)],
    "messaging_preview":    [(800, 800), (1024, 768)],  # variable
    "professional_stock":   [(varies, but aspect ratio 2:3 common)],
}
```

Exact match to a platform output resolution (even after minor cropping): **+12 risk**

#### Quantization Table Library Matching

Major social media platforms use reproducible JPEG quality settings. Build and maintain a library of quantization tables for each known platform. Match the embedded QT against this library.

- Match to known social media platform QT: **+18 risk**
- Match to known stock photo site QT: **+15 risk**

This is purely mathematical and requires no internet access — it's a local lookup against a static table library.

#### Chroma Subsampling Detection

Platforms apply specific chroma subsampling schemes:
- Camera native: typically 4:2:2 or 4:4:4
- Heavily compressed platforms: 4:2:0
- High-quality platforms: sometimes 4:4:4

Mismatch between expected camera-native subsampling and detected subsampling indicates third-party processing.

#### Color Normalization Fingerprint

Many social media platforms apply proprietary color normalization or tone-mapping. This manifests as:
- Truncated histogram tails in specific color channels
- Characteristic gamma curve modification
- Specific hue rotation of skin tones

Compute channel-wise histogram shape and compare to signatures of known platform color pipelines.

### 9.3 Screenshot Detection

Screenshots (common when a fraudster screenshots photos from their victim's profile or from a social media page) leave characteristic signals:
- Exact match to device screen resolution (varies by device family)
- UI chrome residuals (notification bar strip at top, time/battery icons)
- Possible screen-door effect from display pixel grid
- PNG-to-JPEG conversion artifacts if the screenshot was converted before upload
- Absence of any camera lens distortion or bokeh

Screenshot confidence > 0.7: **+20 risk**

---

## 10. Module 5 — Noise & Sensor Pattern Analysis

**Signal Weight: MEDIUM-HIGH**  
**Fires on:** Noise pattern mismatch across images; absence of expected sensor noise; presence of synthetic noise

### 10.1 Sensor Noise as an Authenticity Signal

Every real camera produces characteristic noise that consists of:
1. **Fixed Pattern Noise (FPN):** Repeatable, position-dependent noise from sensor manufacturing defects — this is the PRNU signal
2. **Random Noise:** Thermal, read, and shot noise that varies with ISO and exposure
3. **Color Filter Array (CFA) Artifacts:** Demosaicing introduces specific correlation patterns

Synthetic images lack FPN entirely and have different noise statistics than real captures.

### 10.2 Lightweight PRNU-Style Analysis (Stateless)

Full PRNU camera fingerprinting requires a reference signal from the camera, which we cannot have in a stateless system. Instead, we compute a **relative consistency metric** across the upload batch:

```
For each image i:
  noise_residual_i = high_pass_filter(image_i)
  # Use a wavelet-based or Gaussian difference filter

For each pair (i, j):
  correlation(i, j) = NCC(noise_residual_i, noise_residual_j)
  # Normalized Cross-Correlation on downsampled residuals (512x512 max)

profile_noise_consistency = mean(correlation matrix)
```

**Thresholds (empirically calibrated):**
- Consistency > 0.3: Strong same-device signal (reduce risk)
- Consistency 0.1–0.3: Ambiguous (neutral)
- Consistency < 0.1: Different devices or mixed sources (+15 risk)
- Consistency < 0.0: Anti-correlated noise = synthetic images (+25 risk)

### 10.3 Noise Level vs. Claimed Quality

A high-quality image that has been downloaded from a social media platform and re-uploaded will show:
- Very low high-frequency noise (the platform compression removed it)
- But double-compression artifacts in the DCT domain

This combination — low noise floor + DJPEG traces — is a characteristic fingerprint of platform-sourced images:

```
if noise_level < LOW_THRESHOLD and djpeg_confidence > 0.6:
    platform_sourced_probability += 0.3
```

### 10.4 Noise Consistency with Scene Content

Authentic photos show noise that correlates with exposure: dark regions have more noise (high ISO rendering), bright regions have less. Images that have been heavily post-processed or AI-generated often show **noise levels inconsistent with the scene lighting**:

- Uniform noise across light/dark regions → post-processing artifact (+8 risk)
- Zero noise in shadow regions of an otherwise grainy image → selective noise removal (+10 risk)

---

## 11. Module 6 — Metadata & File Forensics

**Signal Weight: MEDIUM**  
**Fires on:** Absent, inconsistent, or suspicious EXIF metadata

### 11.1 EXIF Presence and Absence Patterns

**No EXIF at all:** Consistent with social media sourcing (most platforms strip all metadata). Risk score impact depends on other signals — EXIF absence alone is not sufficient.

**Partial EXIF:** EXIF present but with some fields stripped (e.g., GPS removed but device kept) — patterns inconsistent with normal camera output suggest manual EXIF manipulation.

**EXIF device consistency:**
- Multiple images showing different device manufacturers: legitimate if older photos mixed with newer ones
- Multiple images with different devices but identical timestamps: **+15 risk (impossible scenario)**
- Mix of iOS and Android device signatures across images in the same profile: **+8 risk** (possible but less common for genuine users)

### 11.2 Timestamp Forensics

**EXIF timestamp vs. file modification timestamp mismatch:**
- Camera photos: EXIF date = original capture date, file date = upload/transfer date
- Downloaded and re-uploaded photos: EXIF date may be stripped OR may be the original poster's capture date (which could be years ago)

**Suspicious patterns:**
- All images with identical EXIF timestamps (bulk download time stamped together): **+20 risk**
- EXIF dates all within a 24-hour window for images supposedly spanning months: **+15 risk**
- EXIF dates in the future: **+25 risk**
- All images with EXIF timestamps identical to upload time: likely EXIF regeneration

### 11.3 File Naming Pattern Analysis

The filename itself carries forensic signal:
- Camera-generated names (IMG_XXXX, DSC_XXXX, 20240515_XXXXXX): authentic signal (reduce risk)
- Sequential download names (photo1.jpg, photo2.jpg, image(1).jpg): suggests bulk download **+8 risk**
- Long hash-like names (characteristic of platform CDN downloads): **+12 risk** (suggests sourced from a platform URL)
- All images with identical naming convention inconsistent with camera defaults: **+10 risk**

### 11.4 Embedded Thumbnail Analysis

JPEG files contain an embedded thumbnail in the EXIF block. This thumbnail is generated at the time of original compression and is often NOT updated when an image is edited or re-saved. Discrepancy between the embedded thumbnail and the main image is a classic forgery indicator:

```
if thumbnail_exists:
  thumbnail_similarity = compare_thumbnail_to_main_image()
  if thumbnail_similarity < 0.7:
    editing_detected = True  # Image was edited after original capture
    risk += 8
```

---

## 12. Module 7 — Editing & Post-Processing Detection

**Signal Weight: MEDIUM**  
**Fires on:** Signs of heavy post-processing that may indicate image laundering (applying filters to disguise the image's forensic origin)

### 12.1 Over-Sharpening Detection

Authentic phone photos have natural sharpness. Images that have been run through sharpening tools or had AI upscaling applied exhibit:
- **Halo artifacts** at edges (bright rim on the bright side, dark rim on the dark side)
- **Overshoot in gradient profiles** across edges
- **Ringing in frequency domain** — high-frequency energy beyond what natural optics produce

Detect via:
```
edge_map = laplacian(image)
overshoot_ratio = count_pixels_above_3sigma / count_edge_pixels
if overshoot_ratio > 0.15: over_sharpening_detected (+8 risk)
```

### 12.2 Skin Smoothing / Beautification Filter Detection

Beauty apps and social media filters apply aggressive skin smoothing that:
- Removes fine pore-level texture from skin regions
- Reduces local variance in skin-colored regions significantly
- Creates an unrealistically smooth gradient across cheeks and foreheads
- May leave visible boundary artifacts at the edge of the smoothed region

Detect via:
- Segment approximate skin regions using color thresholding (H/S/V ranges for common skin tones — no face recognition, just color-based segmentation)
- Compute local variance within skin regions
- Compare to baseline variance from authenticated camera photos
- Below-threshold skin variance: **+10 risk**

### 12.3 Background Replacement Detection

AI background replacement (used by some attackers to transplant a stolen face into a new background) leaves:
- Sharp, unnaturally clean subject-background boundary
- Noise level mismatch between foreground and background
- Color temperature mismatch between foreground and background (different light sources)
- Compression artifact discontinuity at the boundary

Measure boundary sharpness and cross-boundary noise consistency. Anomalous background boundaries: **+12 risk**

### 12.4 Filter Pipeline Detection

Identify images that have been run through a known filter pipeline:
- Vintage/film filters (characteristic color grading): valid but reduces authenticity confidence
- Heavy vignette: typical of filter apps, not camera defaults
- Extreme saturation or desaturation: not typical of raw camera output

These signals alone are weak but combine multiplicatively with other signals.

---

## 13. Module 8 — Scene & Lifestyle Consistency

**Signal Weight: MEDIUM**  
**Fires on:** Implausible scene variety, inconsistent environmental coherence across a profile's photos

### 13.1 What Real User Profiles Look Like

Authentic users' photo sets show:
- Consistent geographic environment types (same region's architecture, vegetation, lighting quality)
- Consistent season/time-of-year indicators
- Consistent personal style indicators (clothing style, home decor)
- A natural progression of ages/appearances

### 13.2 Red Flags

**Environment incoherence:**
- Images apparently taken in multiple continents' environments within one profile (tropical beach + alpine mountain + New York apartment): possible for travelers, but combined with other signals: **+8 risk**

**Seasonal incoherence:**
- Summer outdoor + winter outdoor images with identical apparent subject age and no seasonal progression: unusual

**Studio-quality lighting in "casual" photos:**
- Multiple images with professional studio lighting in what purports to be a casual day-in-the-life profile: possible for models/influencers, but risk factor increases with other signals **+5 risk**

**Clothing impossibility:**
- Same outfit appearing in wildly different environments/seasons
- Note: Same-day outfit changes are normal; flag only obviously incompatible combinations

### 13.3 Implementation Notes

This module should use lightweight image classification (general scene category, approximate lighting type, season estimation) — not face recognition or identity analysis. Pre-trained scene classifiers (Places365, etc.) can provide scene category without any biometric data. Apply softly weighted outputs.

---

## 14. Risk Scoring Model

### 14.1 Weighted Signal Fusion

| Module | Signal | Weight Class | Max Points |
|--------|--------|-------------|------------|
| M1 | Double JPEG compression evidence | HIGH | 25 |
| M1 | Quantization table from known social platform | HIGH | 18 |
| M1 | Cross-image compression variance | HIGH | 20 |
| M2 | Sensor noise inconsistency across images | HIGH | 25 |
| M2 | Resolution/device inconsistency | MEDIUM | 12 |
| M3 | GAN/diffusion frequency artifacts | HIGH | 30 |
| M3 | Skin texture homogeneity | MEDIUM | 20 |
| M3 | Iris/physiological inconsistency | MEDIUM | 15 |
| M4 | Platform QT library match | HIGH | 18 |
| M4 | Screenshot detection | HIGH | 20 |
| M4 | Resolution pattern match | MEDIUM | 12 |
| M5 | Noise anti-correlation (synthetic signal) | HIGH | 25 |
| M5 | Low noise + DJPEG conjunction | HIGH | 20 |
| M6 | EXIF timestamp anomalies | MEDIUM | 20 |
| M6 | File naming pattern | MEDIUM | 12 |
| M6 | Thumbnail/image discrepancy | MEDIUM | 8 |
| M7 | Over-sharpening halos | LOW-MED | 8 |
| M7 | Skin smoothing artifacts | MEDIUM | 10 |
| M7 | Background replacement | MEDIUM | 12 |
| M8 | Scene incoherence | LOW | 8 |

**Maximum raw score: ~368 points**  
Normalize to 0–100 using a calibrated sigmoid function to produce the final risk score.

### 14.2 Signal Confidence Gating

Each module reports both a signal value and a confidence level. Low-confidence signals are downweighted:

```python
effective_contribution = signal_value * confidence ** 1.5
```

This prevents a module with low-quality input (e.g., only 1 image in the batch, making cross-image comparison unreliable) from contributing noise to the final score.

### 14.3 Multi-Signal Requirement (Critical False Positive Protection)

**HARD RULE:** Automatic FLAG (score ≥ 70) requires at minimum **2 HIGH-weight signals or 4 signals total** to fire. A single signal, no matter how strong, places the profile in REVIEW, not automatic FLAG.

```python
if auto_flag_candidate:
    high_signals = count(signals where weight == HIGH and confidence > 0.7)
    total_signals = count(all signals where confidence > 0.5)
    if high_signals < 2 and total_signals < 4:
        downgrade to REVIEW
```

### 14.4 Score Interpretation

| Score Range | Classification | Recommended Action |
|------------|---------------|-------------------|
| 0–25 | **Clean** | Approve, no action |
| 26–45 | **Low Risk** | Approve, passive monitoring |
| 46–65 | **Elevated** | Human review queue |
| 66–79 | **High Risk** | Human review + optional soft challenge |
| 80–100 | **Critical** | Auto-flag for action |

### 14.5 Ensemble Calibration

Score calibration must be performed against labeled ground truth data (known authentic profiles vs. known fraud profiles) from your own platform. The weights above represent a research-informed starting point; operational tuning will shift them. Recommend:

1. Build a labeled dataset of 10,000+ profiles (mix of confirmed fraud + confirmed genuine)
2. Train an ensemble classifier using the module outputs as features
3. Calibrate the output probability to your platform's desired false positive rate
4. Review quarterly and retrain on newly labeled examples

---

## 15. False Positive Protection

### 15.1 The Multi-Device Reality

Real users legitimately use multiple devices. The system explicitly must not penalize:
- A profile with photos from two different phones (e.g., old iPhone photos + new Android photos)
- A profile with one professional headshot (studio lighting, potentially stock-quality) alongside casual selfies
- A profile with old photos from a lower-quality camera alongside recent high-quality photos

**Mitigation:** Apply temporal spreading credit — if EXIF dates (where present) span > 12 months and show ordered progression, reduce inter-device inconsistency penalty by 50%.

### 15.2 The Edited Photo Reality

Users commonly:
- Apply Lightroom or similar apps to their photos
- Use portrait mode (which involves computational post-processing)
- Apply skin-smoothing or beauty filters

**Mitigation:** Editing detection signals alone carry only LOW weight. They multiply the impact of other signals but cannot trigger automatic action independently.

### 15.3 The Professional Photo Reality

Some users have professional headshots, modeling portfolios, or high-quality photos taken by a photographer. These legitimately share characteristics with stock photos:
- Very high image quality
- Studio lighting
- Potentially clean/absent metadata (photographer may strip it)

**Mitigation:** Professional-quality photos that are **consistent across all images in the profile** (consistent noise level, consistent environment type, consistent compression history) should receive reduced suspicion. The red flag is **inconsistency** — some professional shots mixed with lower-quality images from a different compression history.

### 15.4 Mandatory Human Review Tier

Between automatic approve and automatic flag, maintain a mandatory human review tier. All profiles with scores 46–79 should be reviewed by a moderator before action is taken. Moderators should have access to the full signal breakdown report, not just the final score.

---

## 16. Non-Breaking Upgrade Strategy

### 16.1 Feature Flag Architecture

Every new module must be individually feature-flagged:

```yaml
feature_flags:
  module_compression_history: enabled
  module_cross_image_consistency: enabled
  module_synthetic_detection: shadow_mode  # compute but don't use score
  module_platform_origin: enabled
  module_noise_analysis: enabled
  module_metadata_forensics: enabled
  module_editing_detection: shadow_mode
  module_scene_consistency: shadow_mode
```

**Shadow mode:** Module runs and logs results, but output is not included in the final risk score. Allows A/B testing and calibration before activation.

### 16.2 Gradual Rollout Protocol

1. **Phase 1 (Shadow):** Deploy all modules in shadow mode. Collect 4 weeks of predictions vs. existing system decisions. Measure false positive rate against confirmed genuine profiles.

2. **Phase 2 (Soft Launch):** Enable HIGH-weight modules for new account registrations only. Validate false positive rate < 2% on this cohort.

3. **Phase 3 (Full Rollout):** Enable for all uploads. MEDIUM modules still in shadow.

4. **Phase 4 (Complete):** Enable MEDIUM modules after independent validation. Scene consistency and editing detection last due to highest false positive risk.

### 16.3 Score Injection into Existing System

If the existing analyzer produces a score (0–100), integrate the new score as an additive component:

```python
final_score = (existing_score * 0.4) + (new_engine_score * 0.6)
```

Adjust weights after 30 days of shadow comparison to find the optimal blend.

---

## 17. Implementation Roadmap

### Phase 1 — Foundation (Weeks 1–4)
- Implement JPEG bitstream parser to extract raw DCT coefficients (no need for full decoder)
- Build quantization table library (research and document known platform QTs)
- Implement double JPEG compression detector (histogram periodicity method)
- Implement basic EXIF extraction and anomaly flagging
- Deploy all in shadow mode

**Deliverable:** Shadow mode running on 100% of uploads, logging to forensic audit table

### Phase 2 — Cross-Image Engine (Weeks 5–8)
- Implement noise residual extraction (lightweight wavelet-based)
- Implement pairwise normalized cross-correlation for noise consistency
- Implement resolution/device inconsistency detector
- Implement EXIF timestamp pattern analysis
- Enable Modules 1, 2, 6 with conservative thresholds (70th percentile for FLAG)

**Deliverable:** First live risk scores from M1/M2/M6 alongside existing system

### Phase 3 — Synthetic Detection (Weeks 9–12)
- Implement FFT spectrum analyzer and 1/f² decay fitting
- Implement checkerboard artifact detector
- Implement skin texture homogeneity analyzer
- Train calibration classifier on labeled dataset (require labeled dataset from trust & safety team)
- Enable Module 3 in shadow mode, transition to live after calibration

**Deliverable:** AI/synthetic detection live in shadow mode

### Phase 4 — Platform Fingerprinting (Weeks 13–16)
- Expand quantization table library with aggressive research
- Implement screenshot detector
- Implement color normalization fingerprinting
- Enable Module 4

**Deliverable:** Platform-origin detection live

### Phase 5 — Final Modules & Fusion (Weeks 17–20)
- Implement Modules 5, 7, 8
- Implement full score fusion with calibrated weights
- Implement multi-signal gate for auto-flag
- A/B test against existing system
- Document final operational thresholds

**Deliverable:** Full engine live, v1.0 of upgrade complete

---

## 18. Adversarial Scenarios & Countermeasures

### Scenario 1: Expert Metadata Stripper
**Attack:** Attacker strips all EXIF using ExifTool before upload. Re-saves at high quality (95). Applies a subtle Instagram-style filter.

**Detection:** Module 6 fires lightly (no EXIF on "casual" photos). Module 1 fires on DJPEG evidence (high quality re-save doesn't erase prior compression artifacts). Module 4 fires if original was social-media-sourced (QT match survives filter application). Module 5 fires if images lack sensor noise signature. Combined score likely 50–65 → REVIEW tier.

### Scenario 2: AI-Generated Profile (Midjourney)
**Attack:** Attacker generates 4 hyper-realistic profile photos using Midjourney. Downloads each, applies a different filter to each, re-saves at QF 85.

**Detection:** Module 3 fires strongly (frequency artifacts persist above QF 70). Module 5 fires (no sensor noise cross-correlation). Module 2 fires (noise inconsistency between images generated separately). Score likely 75–90 → AUTO-FLAG.

### Scenario 3: Sophisticated Mixed Set
**Attack:** Attacker uses 2 genuine photos (from a victim's public Instagram) mixed with 2 AI-generated photos to make the set seem more authentic.

**Detection:** Module 2 fires (compression pipeline inconsistency between sourced and AI images). Module 3 fires on the synthetic images. Module 5 fires (sensor noise inconsistency between sourced and synthetic). The genuine images may score low individually, but the mixed-set inconsistency is the giveaway. Score likely 55–75 → REVIEW or FLAG.

### Scenario 4: High-Quality Screenshots of Social Media Profile
**Attack:** Attacker screenshots a victim's social media profile, uploads screenshots as profile photos.

**Detection:** Module 4 fires strongly (screenshot detection, screen-resolution match). Module 1 fires (PNG→JPEG conversion artifacts + original platform compression artifacts). Score likely 60–80 → REVIEW or FLAG.

### Scenario 5: Professionally Edited Stock Photo
**Attack:** Attacker uses a purchased stock photo with watermark removed, applies color grading, crops tightly, saves at QF 90.

**Detection:** Module 1 fires (stock photo QT match). Module 4 fires (professional stock resolution and color profile). Module 7 fires (over-sharpening from stock photo export pipeline). Module 5 fires lightly (stock photo sensors produce calibrated noise, not matching typical phone noise). Score likely 55–70 → REVIEW.

### Scenario 6: Sophisticated Bot (Perfect Forensic Evasion)
**Attack:** A well-resourced attacker applies all known evasion techniques: strips EXIF, carefully controls re-save quality, applies noise injection to simulate sensor noise, generates images using latest diffusion model.

**Detection:** This is the hardest case. The system will have reduced confidence across all modules. The multi-signal gate means auto-flag won't fire without evidence. Score likely 30–50 → low risk or light review. **Mitigation:** This is where the Layer 2 (liveness verification, triggered by behavioral signals or repeated mild flags) catches what passive forensics misses. The pure forensics engine is not designed to catch perfect adversaries alone — it's designed to make fraud significantly harder and more expensive while minimizing false positives on legitimate users.

---

## 19. Performance Targets & Pipeline Design

### 19.1 Latency Budget

| Module | Target Latency | Notes |
|--------|---------------|-------|
| Pre-processor (all images) | 100ms | Parallel decoding |
| M1 Compression Analysis | 150ms | Per image, parallelizable |
| M2 Cross-Image Consistency | 200ms | Requires all images |
| M3 Synthetic Detection (FFT) | 250ms | Per image, GPU-acceleratable |
| M4 Platform Fingerprint | 100ms | Mostly lookup operations |
| M5 Noise Analysis | 200ms | Per image |
| M6 Metadata Forensics | 20ms | Parsing only |
| M7 Editing Detection | 150ms | Per image |
| M8 Scene Consistency | 300ms | Inference-heavy, optional |
| Score Fusion | 10ms | Arithmetic only |
| **Total (parallel, 4 images)** | **~600ms** | Comfortably under 3s target |

### 19.2 Parallelization Strategy

```
Per-image modules (M1, M3, M4, M5, M7, M8): run in parallel across images
Cross-image modules (M2): run after per-image modules complete
M6: run independently in parallel with per-image modules
Score fusion: runs last, millisecond operation
```

Use an async task queue (e.g., Celery or async/await architecture) with worker processes equal to the number of images in the batch.

### 19.3 Hardware Targets

**CPU-first design:**
- All modules must be implementable in pure CPU
- No GPU dependency for production operation
- GPU optional for M3 (FFT computation) to reduce latency

**Memory budget per analysis job:** < 512MB peak
- Achieved by processing images at reduced resolution for noise analysis (512×512 max)
- FFT computed on 512×512 downsampled luminance channel

---

## 20. References & Academic Sources

### Foundational Papers

- Bianchi, T., De Rosa, A., Piva, A. — "Improved DCT Coefficient Analysis for Forgery Localization in JPEG Images" — IEEE 2011
- Rahmati et al. — "Detecting Double JPEG Compression Using Convolutional Auto-encoder and CNN" — 2023
- Chai, X., Tan, Y., Gan, Z. et al. — "Forgery Detection Using Polynomial Fitting in Recompressed JPEG Images" — Signal, Image and Video Processing 18, 2024
- Kumawat & Pankajakshan — "A Robust JPEG Compression Detector for Image Forensics" — Information Sciences, 2023
- Frank et al. — "Leveraging Frequency Analysis for Deep Fake Image Recognition" — ICML 2020
- Durall et al. — "Watch Your Up-Convolution: CNN Based Generative Deep Neural Networks Are Failing to Reproduce Spectral Distributions" — CVPR 2020
- Corvi et al. — "On the Detection of Synthetic Images Generated by Diffusion Models" — ICASSP 2023
- Cozzolino et al. — "Raising the Bar of AI-generated Image Detection with CLIP" — CVPRW 2024
- Lai, J. et al. — "Efficient and Accurate Image Provenance Analysis: A Scalable Pipeline for Large-scale Images" — USTC, 2025
- Cannas et al. — "Is JPEG AI Going to Change Image Forensics?" — ICCVW 2025

### Dating Platform Trust & Safety Research

- Cornell University — "Detecting Fake Profiles in Dating Platforms via Metadata Analysis" — arXiv 1905.12593
- Cornell University — "Machine Learning Models for Fake Dating Profile Detection" — arXiv 1807.04901
- Fletcher, Tzani, Ioannou — "AI-Generated Deception in Online Dating" — 2024
- Checkstep — "Fake Dating Images: The Ultimate Moderation Guide" — 2024

### Industry Technical Disclosures

- Platform A Trust & Safety: "Deception Detector ML-Based Profile Assessment" — February 2024 (machine learning model evaluating profile authenticity patterns; 95% spam/scam block rate in testing; 45% reduction in user-reported fraud within two months)
- Platform Group B: "Face Check — Liveness and Photo Verification" — October 2025 (60% reduction in bad actor exposure; 40% reduction in suspicious behavior reports; FaceTec 3D liveness technology)
- Platform Group B: "Hinge Face Check — Mandatory Selfie Verification" — February 2026 (liveness + face-match against profile photos; duplicate face detection across accounts)

---

*Document version 1.0 — For internal engineering and trust & safety use only*  
*All competitor references removed per internal policy — methods described reflect industry-wide forensic practices*
