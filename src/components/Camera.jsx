import { useEffect, useRef, useState } from "react";
import { IconCamera, IconUpload, IconRefresh, IconX } from "./Icons";
import { useCameraCapture } from "../hooks/useCameraCapture";
import { shouldCaptureKey } from "../lib/cameraCapture";
import { checkImageQuality } from "../lib/storage";

export default function Camera({ side, image, onCapture, onRetake, compact, continuous = false, disabled = false, onBusyChange }) {
  const [capturedImage, setCapturedImage] = useState(null);
  const [qualityWarning, setQualityWarning] = useState(null);
  const captureWithCheck = (dataUrl) => {
    setCapturedImage(dataUrl);
    return onCapture(dataUrl);
  };
  const camera = useCameraCapture({ onCapture: captureWithCheck, continuous, disabled });
  const panelRef = useRef(null);
  const blocked = camera.busy || camera.starting || disabled;
  const mH = compact ? 150 : 360;
  const qualityImage = image || capturedImage;

  useEffect(() => {
    let active = true;
    setQualityWarning(null);
    if (qualityImage) {
      checkImageQuality(qualityImage).then(({ warning }) => {
        if (active) setQualityWarning(warning || null);
      }).catch(() => {});
    }
    return () => { active = false; };
  }, [qualityImage]);

  useEffect(() => { onBusyChange?.(camera.busy || camera.starting); }, [camera.busy, camera.starting, onBusyChange]);
  useEffect(() => {
    if (camera.live && !disabled) panelRef.current?.focus();
  }, [side, camera.live, disabled]);
  const start = async (deviceId) => {
    if (await camera.start(deviceId)) panelRef.current?.focus();
  };

  if (image) {
    return (
      <div className="card-elevated" style={{ flex: "1 1 140px", minWidth: 120, textAlign: "center", padding: 10 }}>
        <span className="badge badge-acc">{side}</span>
        <img src={image} alt={side + " of card"} className="img-preview" style={{ width: "100%", maxHeight: compact ? 150 : 220, marginTop: 8 }} />
        {qualityWarning && <div className="text-xxs mt-4" style={{ color: "var(--orange)", lineHeight: 1.3 }}>{qualityWarning}</div>}
        <button className="btn btn-ghost btn-sm mt-6 w-full" onClick={() => { setCapturedImage(null); setQualityWarning(null); onRetake(); }} disabled={blocked}>
          <IconRefresh size={12} /> Retake {side}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={panelRef} tabIndex={0} role="region" aria-label={side + " camera preview and keyboard shutter"}
      onKeyDown={(event) => {
        const capture = shouldCaptureKey(event, { ready: camera.ready, busy: blocked });
        if (capture || (event.target === panelRef.current && (event.code === "Space" || event.key === " "))) {
          event.preventDefault();
        }
        if (capture) camera.snap();
      }}
      style={{ flex: "1 1 140px", minWidth: 120, textAlign: "center", padding: 10, borderRadius: "var(--radius-lg)", border: "2px solid var(--brd)", background: "var(--s1)" }}
    >
      <div className="fw-700 mb-8" aria-live="polite">{disabled ? "Capture paused" : "Capture " + side.toUpperCase()}</div>
      <div className="flex gap-8 mb-8 items-center flex-wrap">
        <label className="text-xs" style={{ flex: 1, minWidth: 150 }}>
          Camera
          <select className="inp" aria-label="Capture camera" value={camera.deviceId} disabled={blocked} style={{ width: "100%" }} onChange={(event) => {
            const selected = event.target.value;
            camera.setDeviceId(selected);
            if (camera.live) start(selected);
          }}>
            <option value="">Automatic / rear camera</option>
            {camera.deviceId && !camera.devices.some((device) => device.deviceId === camera.deviceId) && <option value={camera.deviceId}>Saved camera (connect to check)</option>}
            {camera.devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || "Camera " + (index + 1)}</option>)}
          </select>
        </label>
        <button className="btn btn-ghost btn-sm" disabled={blocked} onClick={camera.refreshDevices}>Refresh cameras</button>
      </div>
      {/* Keep the video mounted while requesting permission and between front/back shots. */}
      <video ref={camera.videoRef} onClick={() => panelRef.current?.focus()}
        style={{ display: camera.live ? "block" : "none", width: "100%", maxHeight: mH, borderRadius: "var(--radius)", objectFit: "contain", background: "#000" }}
        playsInline muted autoPlay
      />
      <canvas ref={camera.canvasRef} style={{ display: "none" }} />
      {camera.live && (
        <>
          <div className="text-xxs text-dim mt-6">
            {camera.settings.label || "Connected camera"}
            {camera.settings.width && camera.settings.height ? " · Preview " + camera.settings.width + " × " + camera.settings.height : ""}
          </div>
          <div className="text-xxs text-dim mt-4">
            {[["focusMode", "Focus"], ["exposureMode", "Exposure"], ["whiteBalanceMode", "White balance"]].map(([key, label]) => label + ": " + (camera.settings[key] || "camera managed")).join(" · ")}
            {camera.settings.torch === false ? " · Torch off" : ""}
          </div>
          <div className="flex gap-8 justify-center mt-8">
            <button className="btn btn-primary" disabled={blocked || !camera.ready} aria-keyshortcuts="Space"
              onKeyDown={(event) => { if (event.repeat) event.preventDefault(); }}
              onClick={() => { camera.snap(); panelRef.current?.focus(); }}>
              <IconCamera size={16} /> {camera.busy ? "Capturing…" : "Capture " + side + " · Space"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={camera.stop} disabled={camera.busy} aria-label="Stop camera"><IconX size={14} /></button>
          </div>
          {!camera.ready && <p className="text-xs mt-6">Waiting for live video. Check that the iPhone camera is connected and not paused.</p>}
          <p className="text-xxs text-dim mt-6">Click the preview, then press Space for each photo. Shortcuts pause while using other controls.</p>
        </>
      )}
      {!camera.live && (
        <button className="btn btn-primary btn-sm" disabled={blocked || !camera.supported} onClick={() => start(camera.deviceId)}>
          <IconCamera size={14} /> {camera.starting ? "Opening camera…" : "Open Camera"}
        </button>
      )}
      {!camera.supported && <p className="text-xs text-dim mt-6">Live camera needs HTTPS or localhost. Upload can use the iPhone camera instead.</p>}
      <label className="btn btn-outline btn-sm mt-8" style={{ cursor: blocked ? "default" : "pointer", opacity: blocked ? 0.5 : 1 }}>
        <IconUpload size={14} /> Upload {side}
        <input type="file" accept="image/*" capture="environment" disabled={blocked} onChange={(event) => {
          camera.upload(event.target.files?.[0]);
          event.target.value = "";
          panelRef.current?.focus();
        }} style={{ display: "none" }} />
      </label>
      {camera.notice && <p className="text-xs text-dim mt-6" role="status">{camera.notice}</p>}
      {qualityWarning && <p className="text-xs mt-6" role="status" style={{ color: "var(--orange)" }}>Last photo: {qualityWarning}</p>}
      {camera.error && <p className="text-xs text-red mt-6" role="alert">{camera.error}</p>}
    </div>
  );
}
