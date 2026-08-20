import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";

// Card images live as files next to the SQLite DB so backups stay a single
// directory. Ids are the client's img_<uid>_front/back identifiers.

const SAFE_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIME_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const EXTENSION_MIMES = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function imagesDir() {
  const dbPath = resolve(process.env.CARDVAULT_DB_PATH || "./data/cardvault.db");
  return join(dirname(dbPath), "images");
}

export function isValidImageId(id) {
  return SAFE_ID.test(String(id || ""));
}

// data:image/<type>;base64,<payload> -> { mime, buffer } or null.
export function parseImageDataUrl(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!match) return null;
  try {
    return { mime: match[1], buffer: Buffer.from(match[2], "base64") };
  } catch {
    return null;
  }
}

export function saveImageFile(id, dataUrl) {
  if (!isValidImageId(id)) return { error: "invalid image id", status: 400 };
  const parsed = parseImageDataUrl(dataUrl);
  if (!parsed) return { error: "dataUrl must be a base64 image/jpeg, image/png, or image/webp", status: 400 };
  if (parsed.buffer.length > MAX_IMAGE_BYTES) return { error: "image too large", status: 413 };
  const dir = imagesDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.${MIME_EXTENSIONS[parsed.mime]}`), parsed.buffer);
  return { id, size: parsed.buffer.length, mime: parsed.mime };
}

export function readImageFile(id) {
  if (!isValidImageId(id)) return null;
  const dir = imagesDir();
  for (const [extension, mime] of Object.entries(EXTENSION_MIMES)) {
    const path = join(dir, `${id}.${extension}`);
    if (existsSync(path)) {
      return { buffer: readFileSync(path), mime };
    }
  }
  return null;
}
