import BatchPhoto from "./batch/BatchPhoto";
import { useState, useRef, useCallback, useEffect } from "react";
import { IconCamera, IconUpload, IconCheck, Spinner } from "./Icons";

export default function BatchCaptureMode({ queue, onAddToQueue, onDone, onCancel }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const busyRef = useRef(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState("");
  const [front, setFront] = useState(null);
  const [back, setBack] = useState(null);
  const [saving, setSaving] = useState(false);
  const liveSupported = typeof window !== "undefined" && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setLive(false);
  }, []);

  const start = useCallback(async () => {
    if (!liveSupported) {
      setError("Live camera needs HTTPS or localhost. Upload still opens the iPhone camera.");
      return;
    }
    try {
      stop();
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 } } });
      if (!videoRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setLive(true);
    } catch (err) {
      setError(err.name === "NotAllowedError" ? "Camera access denied. Use Upload instead." : "Camera unavailable. Use Upload instead.");
    }
  }, [liveSupported, stop]);

  useEffect(() => { start(); return stop; }, [start, stop]);

  async function enqueue(backPhoto = back) {
    if (!front || busyRef.current) return false;
    busyRef.current = true;
    setSaving(true);
    setBack(backPhoto);
    setError("");
    try {
      const saved = await onAddToQueue({ front, back: backPhoto });
      if (saved === false) throw new Error("The scan was not saved. Your photos are still here; retry before leaving.");
      setFront(null);
      setBack(null);
      return true;
    } catch (err) {
      setError(err.message || "Unable to save this scan. Retry before leaving.");
      return false;
    } finally { busyRef.current = false; setSaving(false); }
  }

  function capture(dataUrl) {
    if (busyRef.current) return;
    if (!front) { setFront(dataUrl); setBack(null); setError(""); }
    else void enqueue(dataUrl);
  }

  function snap() {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight || busyRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    capture(canvas.toDataURL("image/jpeg", 0.85));
  }

  function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busyRef.current) return;
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") capture(reader.result); };
    reader.onerror = () => setError("Unable to read this photo. Please choose it again.");
    reader.readAsDataURL(file);
  }

  async function leave(process) {
    if (busyRef.current) return;
    // Preserve even a front-only card before leaving the capture screen.
    if (front && !await enqueue()) return;
    stop();
    if (process) onDone(); else onCancel();
  }

  return (
    <section className="slide-up" aria-busy={saving}>
      <div className="card-hero mb-12">
        <div className="flex justify-between items-center mb-10">
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Batch capture</h2>
          <span className="badge badge-acc">{queue.length} saved scans</span>
        </div>
        <div className="text-xs fw-700 mb-6">{front ? "Capture the BACK, or save front only" : "Capture the FRONT"}</div>
        <video ref={videoRef} style={{ display: live ? "block" : "none", width: "100%", maxHeight: 300, borderRadius: "var(--radius)", objectFit: "cover" }} playsInline muted autoPlay />
        {error && <p role="alert" className="text-xs text-red mt-8">{error}</p>}
        <div className="flex gap-8 justify-center flex-wrap mt-8">
          {live
            ? <button className="btn btn-primary" disabled={saving} onClick={snap}><IconCamera size={14} /> Capture {front ? "back" : "front"}</button>
            : <button className="btn btn-primary" disabled={saving} onClick={start}><IconCamera size={14} /> Open camera</button>}
          <label className="btn btn-outline">
            <IconUpload size={14} /> Upload {front ? "back" : "front"}
            <input type="file" accept="image/*" capture="environment" aria-label={`Upload card ${front ? "back" : "front"}`} disabled={saving} onChange={upload} style={{ display: "none" }} />
          </label>
          {front && <button className="btn btn-ghost" disabled={saving} onClick={() => enqueue(back)}>{back ? "Retry saving photos" : "Save front only"}</button>}
        </div>
        {saving && <div role="status" className="text-xs mt-8"><Spinner size={12} /> Saving this scan…</div>}
        {front && <div className="flex gap-8 justify-center mt-8">
          <img src={front} alt="Unsaved card front" style={{ height: 70, borderRadius: 4 }} />
          {back && <img src={back} alt="Unsaved card back" style={{ height: 70, borderRadius: 4 }} />}
        </div>}
      </div>
      <div className="flex gap-4 mb-12" style={{ overflowX: "auto" }}>
        {queue.map((item, index) => <BatchPhoto key={item.id} inlineImage={item.front} imageId={item.frontImgId} alt={`Saved card ${index + 1}`} />)}
      </div>
      <div className="flex gap-8">
        <button className="btn btn-primary btn-lg flex-1" disabled={saving || (!queue.length && !front)} onClick={() => leave(true)}><IconCheck size={14} /> Review {queue.length + (front ? 1 : 0)} cards</button>
        <button className="btn btn-ghost btn-lg" disabled={saving} onClick={() => leave(false)}>Save and pause</button>
      </div>
    </section>
  );
}
