import { useState, useRef, useCallback, useEffect } from "react";

export default function Camera({ side, image, onCapture, onRetake, compact }) {
  const vRef = useRef(null);
  const cRef = useRef(null);
  const sRef = useRef(null);
  const [live, setLive] = useState(false);
  const [camError, setCamError] = useState(null);

  const start = useCallback(async () => {
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
  }, []);

  const stop = useCallback(() => {
    if (sRef.current) {
      sRef.current.getTracks().forEach((t) => t.stop());
      sRef.current = null;
    }
    setLive(false);
  }, []);

  const snap = useCallback(() => {
    const v = vRef.current, c = cRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
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
      <div className="card" style={{ flex: "1 1 140px", minWidth: 120, textAlign: "center", position: "relative", padding: 8 }}>
        <div style={{ position: "absolute", top: 4, left: 8, fontSize: 7, fontWeight: 900, letterSpacing: 2, color: "var(--acc)", textTransform: "uppercase" }}>{side}</div>
        <img src={image} alt={`${side} of card`} style={{ width: "100%", maxHeight: mH, borderRadius: 8, objectFit: "contain", background: "#000", marginTop: 12 }} />
        <button className="btn-g" onClick={onRetake} aria-label={`Retake ${side}`}>{"\u21bb"}</button>
      </div>
    );
  }

  return (
    <div className="card" style={{ flex: "1 1 140px", minWidth: 120, textAlign: "center", position: "relative", padding: 8, borderStyle: "dashed" }}>
      <div style={{ position: "absolute", top: 4, left: 8, fontSize: 7, fontWeight: 900, letterSpacing: 2, color: "var(--acc)", textTransform: "uppercase" }}>{side}</div>
      {live ? (
        <>
          <video ref={vRef} style={{ width: "100%", maxHeight: mH, borderRadius: 8, objectFit: "cover", background: "#000" }} playsInline muted />
          <canvas ref={cRef} style={{ display: "none" }} />
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 6 }}>
            <button onClick={snap} aria-label="Take photo" style={{ width: 44, height: 44, borderRadius: "50%", border: "3px solid var(--acc)", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,var(--acc),var(--acc2))" }} />
            </button>
            <button className="btn-g" onClick={stop} aria-label="Cancel">{"\u2715"}</button>
          </div>
        </>
      ) : (
        <div style={{ padding: compact ? "10px 0" : "16px 0" }}>
          <div style={{ fontSize: compact ? 24 : 36, opacity: .3, marginBottom: 4 }}>{side === "front" ? "\ud83c\udca0" : "\ud83c\udca1"}</div>
          <p style={{ color: "var(--dim)", fontSize: 10, marginBottom: 8 }}>{side}</p>
          {camError && (
            <p style={{ color: "var(--red)", fontSize: 9, marginBottom: 6 }}>{camError}. Use upload instead.</p>
          )}
          <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
            <button className="btn-a" onClick={start} aria-label={`Open camera for ${side}`}>{"\ud83d\udcf7"}</button>
            <label className="btn-o" style={{ cursor: "pointer" }}>
              {"\ud83d\udcc1"}<input type="file" accept="image/*" onChange={upload} style={{ display: "none" }} aria-label={`Upload ${side} image`} />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
