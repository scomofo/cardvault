import path from "node:path";

export const MAX_SCAN_IMAGE_BYTES = 12 * 1024 * 1024;

const SCAN_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);

export function isScanImageExtension(filePath) {
  return SCAN_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function getScanImageRejection(stat) {
  if (!stat?.isFile) return "Selected path is not a file.";
  if (stat.size > MAX_SCAN_IMAGE_BYTES) {
    return "Selected image is too large. Export a smaller copy or use the in-app camera/upload flow.";
  }
  return null;
}
