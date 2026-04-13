/**
 * Difference hash (dHash) — 64-bit perceptual image fingerprint used for
 * in-collection duplicate detection. Robust to minor lighting, scale and
 * compression changes, and cheap enough to run in a Canvas on save.
 *
 * Pipeline: load image -> downsample to 9x8 grayscale -> for each row,
 * compare adjacent pixels -> 64-bit binary -> 16-char hex.
 */

const WIDTH = 9;
const HEIGHT = 8;

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = dataUrl;
  });
}

function toGrayscaleRow(pixels, y) {
  const row = new Array(WIDTH);
  for (let x = 0; x < WIDTH; x++) {
    const idx = (y * WIDTH + x) * 4;
    // Rec. 601 luma
    row[x] = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
  }
  return row;
}

/**
 * Compute a 64-bit dHash for an image data URL.
 * Returns a lowercase 16-character hex string, or null on failure.
 * @param {string} dataUrl
 * @returns {Promise<string|null>}
 */
export async function computeDHash(dataUrl) {
  if (!dataUrl) return null;
  try {
    const img = await loadImage(dataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, WIDTH, HEIGHT);
    const { data } = ctx.getImageData(0, 0, WIDTH, HEIGHT);

    const bits = [];
    for (let y = 0; y < HEIGHT; y++) {
      const row = toGrayscaleRow(data, y);
      for (let x = 0; x < WIDTH - 1; x++) {
        bits.push(row[x] > row[x + 1] ? 1 : 0);
      }
    }

    let hex = "";
    for (let i = 0; i < bits.length; i += 4) {
      const nibble = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3];
      hex += nibble.toString(16);
    }
    return hex;
  } catch {
    return null;
  }
}

/**
 * Hamming distance between two hex-encoded hashes of equal length.
 * Returns Infinity if inputs are incompatible.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function hammingDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    const xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    distance += ((xor >> 3) & 1) + ((xor >> 2) & 1) + ((xor >> 1) & 1) + (xor & 1);
  }
  return distance;
}
