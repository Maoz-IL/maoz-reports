// JPEG resize + compression (sequential) with iOS-safe pixel cap

export const COMPRESSION_CFG = {
  quality: 0.8, // 0.75–0.85
  maxWidth: 1920, // רוחב מקס' לפני שליחה
  maxPixels: 6_000_000, // הגנת זיכרון (≈6MP)
  maxTotalBytes: 4.5 * 1024 * 1024, // ~4.5MB סה"כ כדי להימנע מ-500 ב-Netlify
};

export const bytesToMB = (b) => (b / (1024 * 1024)).toFixed(1);

const toJpegName = (originalName = 'photo.jpg') => {
  const base = String(originalName).replace(/\.[a-z0-9]{1,5}$/i, '') || 'photo';
  return `${base}.jpg`;
};

const fileToBitmapOrImage = async (file) => {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      try {
        return await createImageBitmap(file);
      } catch {
        // fallback
      }
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
};

const getImageSize = (bitmapOrImg) => {
  const w = 'width' in bitmapOrImg ? bitmapOrImg.width : bitmapOrImg.naturalWidth;
  const h = 'height' in bitmapOrImg ? bitmapOrImg.height : bitmapOrImg.naturalHeight;
  return { w, h };
};

const computeTargetSize = ({ w, h }, maxWidth, maxPixels) => {
  let scale = w > maxWidth ? maxWidth / w : 1;

  const pixels = w * h;
  if (pixels * scale * scale > maxPixels) {
    const scaleByPixels = Math.sqrt(maxPixels / pixels);
    scale = Math.min(scale, scaleByPixels);
  }

  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  return { tw, th };
};

const canvasToJpegFile = async (canvas, filename, quality, originalFile) => {
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  );
  if (!blob) throw new Error('Image compression failed (toBlob returned null)');

  return new File([blob], filename, {
    type: 'image/jpeg',
    lastModified: originalFile?.lastModified ?? Date.now(),
  });
};

export const compressImageFile = async (
  file,
  { quality, maxWidth, maxPixels } = COMPRESSION_CFG,
) => {
  if (!file?.type?.startsWith('image/')) return file;

  // JPEG קטן כבר? אפשר לדלג כדי לחסוך זמן
  if (file.type === 'image/jpeg' && file.size < 700 * 1024) return file;

  let source;
  try {
    source = await fileToBitmapOrImage(file);
  } catch {
    // fallback: לא מצליח לדקוד, לא נוגעים
    return file;
  }

  const { w, h } = getImageSize(source);
  const { tw, th } = computeTargetSize({ w, h }, maxWidth, maxPixels);

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D context not available');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, tw, th);

  if (source && 'close' in source && typeof source.close === 'function') {
    source.close();
  }

  return await canvasToJpegFile(canvas, toJpegName(file.name), quality, file);
};

export const compressPhotosSequential = async (
  files,
  onProgress,
  cfg = COMPRESSION_CFG,
) => {
  const out = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const compressed = await compressImageFile(f, cfg);
    out.push(compressed);
    if (onProgress) onProgress(i + 1, files.length, compressed);
  }
  return out;
};
