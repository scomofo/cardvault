const ALLOWED_RENDERER_PERMISSIONS = new Set([
  "media",
  "clipboard-read",
  "clipboard-sanitized-write",
  "fullscreen",
]);

export function getOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function canGrantRendererPermission({ permission, requestingUrl, allowedOrigins }) {
  if (!ALLOWED_RENDERER_PERMISSIONS.has(permission)) return false;
  const origin = getOrigin(requestingUrl);
  return !!origin && allowedOrigins.has(origin);
}
