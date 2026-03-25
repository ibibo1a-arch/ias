/**
 * worker.js — Web Worker for image processing pipeline
 *
 * Runs processImageData from pipeline.js off the main thread.
 * Communicates via postMessage.
 */
'use strict';

importScripts('pipeline.js');

self.onmessage = async function (e) {
  const { id, rawBytes, fileType, fileName, config } = e.data;
  try {
    const result = await processImageData(rawBytes, fileType, fileName, config);
    // Transfer the blob — can't transfer Blob directly, so we send ArrayBuffer
    const blobBuf = await result.blob.arrayBuffer();
    self.postMessage({
      id,
      ok: true,
      blobBuf,
      blobType: result.blob.type,
      filename: result.filename,
      report: result.report,
      delta_e: result.delta_e,
      phash_dist: result.phash_dist,
      elapsed: result.elapsed,
      width: result.width,
      height: result.height,
    }, [blobBuf]); // transfer ownership of blobBuf
  } catch (err) {
    self.postMessage({ id, ok: false, error: err.message || String(err) });
  }
};
