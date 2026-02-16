// Deco 2.0 — Image Compression Utilities
// Compresses images before import using OffscreenCanvas

import { convertFileSrc } from '@tauri-apps/api/core';

// Formats that should NOT be compressed (vector, animated, or already tiny)
const SKIP_COMPRESS_EXTS = new Set(['svg', 'gif']);

/** Get compression settings from localStorage. */
export function getCompressionSettings() {
  return {
    enabled: localStorage.getItem('deco-compress') !== 'off',
    quality: parseFloat(localStorage.getItem('deco-compress-quality') || '0.82'),
    maxDimension: parseInt(localStorage.getItem('deco-compress-maxdim') || '2048', 10),
  };
}

/**
 * Compress an image blob using OffscreenCanvas.
 * Returns { data: Uint8Array, ext: string } or null if compression skipped.
 */
export async function compressImageBlob(blob, originalExt) {
  const settings = getCompressionSettings();
  if (!settings.enabled) return null;
  if (SKIP_COMPRESS_EXTS.has(originalExt)) return null;

  try {
    const bitmap = await createImageBitmap(blob);
    let { width, height } = bitmap;
    const maxDim = settings.maxDimension;

    // Downscale if larger than maxDimension
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    // Choose output format: use WebP if supported, else JPEG
    // Keep PNG for images with alpha (transparency)
    const hasAlpha = originalExt === 'png' || originalExt === 'webp';
    const outputType = hasAlpha ? 'image/webp' : 'image/jpeg';
    const outputExt = hasAlpha ? 'webp' : 'jpg';

    const compressedBlob = await canvas.convertToBlob({
      type: outputType,
      quality: settings.quality,
    });

    // Only use compressed version if it's actually smaller
    if (compressedBlob.size >= blob.size * 0.95) return null;

    const buffer = await compressedBlob.arrayBuffer();
    return { data: new Uint8Array(buffer), ext: outputExt };
  } catch {
    return null; // Fallback to uncompressed
  }
}

/**
 * Compress an image from a file path (read via asset URL).
 * Returns { data: Uint8Array, ext: string } or null.
 */
export async function compressImageFromPath(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  if (SKIP_COMPRESS_EXTS.has(ext)) return null;

  const settings = getCompressionSettings();
  if (!settings.enabled) return null;

  try {
    const url = convertFileSrc(filePath);
    const response = await fetch(url);
    const blob = await response.blob();

    // Skip small files (< 200KB)
    if (blob.size < 200 * 1024) return null;

    return await compressImageBlob(blob, ext);
  } catch {
    return null;
  }
}
