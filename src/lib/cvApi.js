/**
 * Client for the CardVault CV (Computer Vision) service.
 * Handles card detection, perspective correction, and centering analysis.
 */

const CV_TIMEOUT = 5000; // 5 second timeout

/**
 * Check if the CV service is running.
 */
export async function checkCvHealth() {
  try {
    const res = await fetch("/api/cv/health", {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Analyze a card image for detection, perspective correction, and centering.
 *
 * @param {string} imageDataUrl - Base64 data URL from camera/upload
 * @returns {Promise<object|null>} Analysis results or null on failure
 *
 * Result shape:
 * {
 *   card_detected: true,
 *   detection_confidence: 0.85,
 *   warp_quality: 0.92,
 *   centering: {
 *     lr: "48/52", tb: "50/50",
 *     left: 48, right: 52, top: 50, bottom: 50,
 *     is_gem: false, score: 9.0,
 *   },
 *   warped_image: "data:image/jpeg;base64,...",
 *   processing_ms: 145,
 * }
 */
export async function analyzeCentering(imageDataUrl) {
  try {
    const res = await fetch("/api/cv/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_b64: imageDataUrl }),
      signal: AbortSignal.timeout(CV_TIMEOUT),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn("CV analyze failed:", err);
      return null;
    }

    return await res.json();
  } catch (e) {
    console.warn("CV service unavailable:", e.message);
    return null;
  }
}

/**
 * Convert CV centering ratios to a description string.
 */
export function formatCentering(centering) {
  if (!centering) return "";
  return `H: ${centering.lr} | V: ${centering.tb}`;
}
