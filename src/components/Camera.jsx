import { useState, useRef, useCallback, useEffect } from "react";
import { IconCamera, IconUpload, IconRefresh, IconX } from "./Icons";

export default function Camera({ side, image, onCapture, onRetake, compact }) {
  const vRef = useRef(null);
  const cRef = useRef(null);
  const sRef = useRef(null);
  const [live, setLive] = useState(false);
  const [camError, setCamError] = useState(null);
  const liveCameraSupported =
    typeof window !== "undefined" &&
    window.isSecureContext &&
    !!navigator.mediaDevices?.getUserMedia;

  const start = useCallback(async () => {
    if (!liveCameraSupported) {
      setCamError("Live camera needs HTTPS or localhost on this device. Use Upload instead.");
      return;
    }

    try {
      setCamError(null);
      if (sRef.current) sRef.current.getTracks().forEach((t) => t.stop());
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 } },
      });
      sRef.current = s;
      if (vRef.current) {
        vRef.current.srcObject = s;
        await vRef.current.play();
        setLive(true);
      }
    } catch (e) {
      setCamError(e.name === "NotAllowedError" ? "Camera access denied" : "Camera unavailable");
    }
  }, [liveCameraSupported]);

  const stop = useCallback(() => {
    if (sRef.current) { sRef.current.getTracks().forEach((t) => t.stop()); sRef.current = null; }
    setLive(false);
  }, []);

  const snap = useCallback(() => {
    const v = vRef.current, c = cRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    onCapture(c.toDataURL("image/jpeg", 0.9));
    stop();
  }, [onCapture, stop]);

  const upload = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => onCapture(ev.target.result);
    r.readAsDataURL(f);
  };

  useEffect(() => () => stop(), [stop]);

  const mH = compact ? 150 : 220;

  if (image) {
    return (
      <div className="card-elevated" style={{ flex: "1 1 140px", minWidth: 120, textAlign: "center", position: "relative", padding: 10 }}>
        <span className="badge badge-acc" style={{ position: "absolute", top: 8, left: 8, fontSize: 9 }}>{side}</span>
        <img src={image} alt={`${side} of card`} className="img-preview" style={{ width: "100%", maxHeight: mH, marginTop: 8 }} />
        <button className="btn btn-ghost btn-sm mt-6 w-full" onClick={onRetake}>
          <IconRefresh size={12} /> Retake
        </button>
      </div>
    );
  }

  return (
    <div style={{ flex: "1 1 140px", minWidth: 120, textAlign: "center", position: "relative", padding: 10, borderRadius: "var(--radius-lg)", border: "2px dashed var(--brd)", background: "var(--s1)" }}>
      <span className="badge badge-dim" style={{ position: "absolute", top: 8, left: 8, fontSize: 9 }}>{side}</span>
      {/* Rendered unconditionally so vRef is attached before start() acquires the stream. */}
      <video
        ref={vRef}
        style={{ display: live ? "block" : "none", width: "100%", maxHeight: mH, borderRadius: "var(--radius)", objectFit: "cover", background: "#000" }}
        playsInline
        muted
        autoPlay
      />
      <canvas ref={cRef} style={{ display: "none" }} />
      {live ? (
        <div className="flex gap-8 justify-center mt-8">
          <button onClick={snap} aria-label="Take photo" style={{ width: 48, height: 48, borderRadius: 2, border: "2px solid var(--acc)", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transform: "rotate(45deg)" }}>
            <div style={{ width: 24, height: 24, borderRadius: 0, background: "var(--acc)", transform: "rotate(-45deg)" }} />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={stop}><IconX size={14} /></button>
        </div>
      ) : (
        <div style={{ padding: compact ? "12px 0" : "20px 0" }}>
          <div style={{ fontSize: compact ? 28 : 40, opacity: .25, marginBottom: 8 }}>{side === "front" ? "\ud83c\udca0" : "\ud83c\udca1"}</div>
          <p className="text-xxs text-dim mb-8">{side}</p>
          {camError && <p className="text-xxs text-red mb-6">{camError}</p>}
          {!liveCameraSupported && (
            <p className="text-xxs text-dim mb-6">Use Upload to access your camera on this device.</p>
          )}
          <div className="flex gap-8 justify-center">
            <button className="btn btn-primary btn-sm" onClick={start}><IconCamera size={14} /> Camera</button>
            <label className="btn btn-outline btn-sm" style={{ cursor: "pointer" }}>
              <IconUpload size={14} /> Upload
              <input type="file" accept="image/*" capture="environment" onChange={upload} style={{ display: "none" }} />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
