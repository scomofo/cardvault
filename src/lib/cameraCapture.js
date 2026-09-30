export function cameraConstraints(deviceId = "") {
  return {
    audio: false,
    video: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" }),
      width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 30 },
    },
  };
}

export async function openCameraStream(mediaDevices, deviceId) {
  try {
    return { stream: await mediaDevices.getUserMedia(cameraConstraints(deviceId)), notice: "" };
  } catch (error) {
    if (!deviceId || !["NotFoundError", "OverconstrainedError"].includes(error.name)) throw error;
    return {
      stream: await mediaDevices.getUserMedia(cameraConstraints()),
      notice: "Saved camera unavailable. Using the default camera; check the preview and select your iPhone.",
    };
  }
}

export function shouldCaptureKey(event, { ready, busy = false }) {
  if (!ready || busy || event.defaultPrevented || event.repeat || event.isComposing ||
      event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
      (event.code !== "Space" && event.key !== " ")) return false;
  const target = event.target;
  if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A", "SUMMARY"].includes(target?.tagName)) return false;
  return !target?.closest?.('input, textarea, select, button, a, summary, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="dialog"]');
}

export function createCaptureGate() {
  let busy = false;
  return {
    get busy() { return busy; },
    async run(operation) {
      if (busy) return;
      busy = true;
      try { return await operation(); }
      finally { busy = false; }
    },
  };
}

export async function applyCameraDefaults(track) {
  let capabilities = {};
  try { capabilities = track.getCapabilities?.() || {}; } catch { /* Some virtual cameras reject capability queries. */ }
  const failed = [];
  const defaults = {};
  for (const key of ["focusMode", "exposureMode", "whiteBalanceMode"]) {
    if (capabilities[key]?.includes("continuous")) defaults[key] = "continuous";
  }
  if (capabilities.torch === true || capabilities.torch?.includes?.(false)) defaults.torch = false;
  for (const [key, value] of Object.entries(defaults)) {
    try { await track.applyConstraints({ advanced: [{ [key]: value }] }); }
    catch { failed.push(key); }
  }
  // Use the device's report, not the requested values, when describing settings.
  return { settings: track.getSettings?.() || {}, failed };
}

export function readCameraFile(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read this photo. Try a JPEG or PNG."));
    reader.readAsDataURL(blob);
  });
}

async function withTimeout(operation, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Still photo timed out")), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}

export async function captureCameraImage({
  video, canvas, track, ImageCaptureClass = globalThis.ImageCapture,
  blobToDataURL = readCameraFile, timeoutMs = 5000,
}) {
  const ready = () => track?.readyState === "live" && !track.muted && video?.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
  if (!ready()) throw new Error("Camera is not ready. Wait for the live preview or reconnect it.");
  let notice = "Still photos are not available here; captured a video frame.";
  if (ImageCaptureClass) {
    try {
      const blob = await withTimeout(async () => {
        const capture = new ImageCaptureClass(track);
        const options = {};
        try {
          const caps = await capture.getPhotoCapabilities?.();
          for (const key of ["imageWidth", "imageHeight"]) {
            if (Number.isFinite(caps?.[key]?.max) && caps[key].max > 0) options[key] = caps[key].max;
          }
          if (caps?.fillLightMode?.includes("off")) options.fillLightMode = "off";
        } catch { /* Photo capability queries are optional on some webcams. */ }
        try { return await capture.takePhoto(options); }
        catch (error) {
          if (!Object.keys(options).length) throw error;
          return capture.takePhoto(options.fillLightMode ? { fillLightMode: "off" } : {});
        }
      }, timeoutMs);
      if (!blob?.size) throw new Error("Empty photo");
      return { dataUrl: await blobToDataURL(blob), method: "photo", notice: "Still photo captured." };
    } catch { notice = "Still photo unavailable on this camera; captured a video frame."; }
  }
  if (!ready()) throw new Error("Camera is not ready. Wait for the live preview or reconnect it.");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not capture this preview. Try Upload instead.");
  context.drawImage(video, 0, 0);
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.95), method: "frame", notice };
}
