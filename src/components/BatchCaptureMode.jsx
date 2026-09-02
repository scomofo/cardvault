import { useState, useRef, useCallback, useEffect } from "react";
import { IconCamera, IconUpload, IconCheck, IconX } from "./Icons";

export default function BatchCaptureMode({ queue, onAddToQueue, onDone, onCancel }) {
  const vRef = useRef(null);
  const cRef = useRef(null);
  const sRef = useRef(null);
  const [live, setLive] = useState(false);
  const [camError, setCamError] = useState(null);
  const [capturingSide, setCapturingSide] = useState("front");
  const [currentFront, setCurrentFront] = useState(null);
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
      if (vRef.current) { vRef.current.srcObject = s; await vRef.current.play(); setLive(true); }
    } catch (e) {
      setCamError(e.name === "NotAllowedError" ? "Camera access denied" : "Camera unavailable");
    }
  }, [liveCameraSupported]);

  const stop = useCallback(() => {
    if (sRef.current) { sRef.current.getTracks().forEach((t) => t.stop()); sRef.current = null; }
    setLive(false);
  }, []);

  useEffect(() => () => stop(), [stop]);
  useEffect(() => { start(); }, [start]);

  const snap = useCallback(() => {
    const v = vRef.current, c = cRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    const dataUrl = c.toDataURL("image/jpeg", 0.85);
    if (capturingSide === "front") {
      setCurrentFront(dataUrl);
      setCapturingSide("back");
    } else {
      onAddToQueue({ front: currentFront, back: dataUrl });
      setCurrentFront(null);
      setCapturingSide("front");
    }
  }, [capturingSide, currentFront, onAddToQueue]);

  const handleUpload = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const dataUrl = loadEvent.target?.result;
      if (typeof dataUrl !== "string") return;

      if (capturingSide === "front") {
        setCurrentFront(dataUrl);
        setCapturingSide("back");
      } else {
        onAddToQueue({ front: currentFront, back: dataUrl });
        setCurrentFront(null);
        setCapturingSide("front");
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }, [capturingSide, currentFront, onAddToQueue]);

  const skipBack = useCallback(() => {
    onAddToQueue({ front: currentFront, back: null });
    setCurrentFront(null);
    setCapturingSide("front");
  }, [currentFront, onAddToQueue]);

  return (
    <section className="slide-up">
      <div className="card-hero mb-12">
        <div className="flex justify-between items-center mb-10">
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Batch Capture</h2>
          <span className="badge badge-acc" style={{ fontSize: 14, padding: "4px 12px" }}>{queue.length} cards</span>
        </div>
        <div className="text-xs fw-700 mb-6" style={{ color: capturingSide === "front" ? "var(--acc)" : "var(--grn)" }}>
          {capturingSide === "front" ? "Snap FRONT" : "Snap BACK (or skip)"}
        </div>
        {/* Rendered unconditionally so vRef is attached before start() acquires the stream. */}
        <video
          ref={vRef}
          style={{ display: live ? "block" : "none", width: "100%", maxHeight: 300, borderRadius: "var(--radius)", objectFit: "cover", background: "#000" }}
          playsInline
          muted
          autoPlay
        />
        <canvas ref={cRef} style={{ display: "none" }} />
        {live ? (
          <div className="flex gap-8 justify-center mt-8">
            <button onClick={snap} aria-label="Capture" style={{ width: 56, height: 56, borderRadius: 2, border: "3px solid var(--acc)", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transform: "rotate(45deg)" }}>
              <div style={{ width: 28, height: 28, background: "var(--acc)", transform: "rotate(-45deg)" }} />
            </button>
            {capturingSide === "back" && <button className="btn btn-ghost btn-sm" onClick={skipBack}>Skip Back</button>}
          </div>
        ) : (
          <div style={{ padding: "20px 0", textAlign: "center" }}>
            {camError && <p className="text-xs text-red mb-6">{camError}</p>}
            {!liveCameraSupported && (
              <p className="text-xs text-dim mb-6">On iPhone over Wi-Fi, Upload will still open the rear camera.</p>
            )}
            <div className="flex gap-8 justify-center flex-wrap">
              <button className="btn btn-primary" onClick={start}><IconCamera size={14} /> Open Camera</button>
              <label className="btn btn-outline" style={{ cursor: "pointer" }}>
                <IconUpload size={14} /> Upload {capturingSide === "front" ? "Front" : "Back"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleUpload}
                  style={{ display: "none" }}
                />
              </label>
            </div>
          </div>
        )}
        {currentFront && (
          <div className="mt-8 text-center">
            <img src={currentFront} alt="front" style={{ height: 60, borderRadius: 6, border: "2px solid var(--acc)" }} />
            <div className="text-xxs text-dim mt-4">Front captured - now snap back</div>
          </div>
        )}
      </div>
      {queue.length > 0 && (
        <div className="flex gap-4 mb-12" style={{ overflowX: "auto", padding: "4px 0" }}>
          {queue.map((item, i) => (
            <img key={item.id} src={item.front} alt={"Card " + (i + 1)} style={{ height: 48, width: 34, borderRadius: 4, objectFit: "cover", border: "1px solid var(--brd)", flexShrink: 0 }} />
          ))}
        </div>
      )}
      <div className="flex gap-8">
        <button className="btn btn-primary btn-lg flex-1" disabled={queue.length === 0} onClick={() => { stop(); onDone(); }}>
          <IconCheck size={14} /> Process {queue.length} Cards
        </button>
        <button className="btn btn-ghost btn-lg" onClick={() => { stop(); onCancel(); }}><IconX size={14} /></button>
      </div>
    </section>
  );
}
