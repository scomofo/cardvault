import { useState, useRef } from "react";
import BatchPhoto from "./batch/BatchPhoto";
import Camera from "./Camera";
import CaptureStationSetup from "./scan/CaptureStationSetup";
import { IconCheck, Spinner } from "./Icons";

export default function BatchCaptureMode({ queue, onAddToQueue, onDone, onCancel }) {
  const busyRef = useRef(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [error, setError] = useState("");
  const [front, setFront] = useState(null);
  const [back, setBack] = useState(null);
  const [saving, setSaving] = useState(false);
  const busy = saving || captureBusy;

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
    else return enqueue(dataUrl);
  }

  async function leave(process) {
    if (busyRef.current || captureBusy) return;
    // Preserve even a front-only card before leaving the capture screen.
    if (front && !await enqueue()) return;
    if (process) onDone(); else onCancel();
  }

  return (
    <section className="slide-up" aria-busy={busy}>
      <div className="card-hero mb-12">
        <div className="flex justify-between items-center mb-10">
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Batch capture</h2>
          <span className="badge badge-acc">{queue.length} saved scans</span>
        </div>
        <Camera side={front ? "back" : "front"} continuous onCapture={capture}
          onBusyChange={setCaptureBusy} disabled={saving} />
        {error && <p role="alert" className="text-xs text-red mt-8">{error}</p>}
        {front && (
          <div className="mt-8 text-center">
            <p className="text-xs mt-4" role="status">Front captured. Flip the card and press Space for the back, or save front only.</p>
            <div className="flex gap-8 justify-center mt-8">
              {!back && <button className="btn btn-ghost" disabled={busy} onClick={() => { setFront(null); setError(""); }}>Retake front</button>}
              <button className="btn btn-outline" disabled={busy} onClick={() => enqueue(back)}>{back ? "Retry saving photos" : "Save front only"}</button>
            </div>
          </div>
        )}
        {saving && <div role="status" className="text-xs mt-8"><Spinner size={12} /> Saving this scan…</div>}
        {front && <div className="flex gap-8 justify-center mt-8">
          <img src={front} alt="Unsaved card front" style={{ height: 70, borderRadius: 4 }} />
          {back && <img src={back} alt="Unsaved card back" style={{ height: 70, borderRadius: 4 }} />}
        </div>}
      </div>
      <CaptureStationSetup />
      <div className="flex gap-4 mb-12" style={{ overflowX: "auto" }}>
        {queue.map((item, index) => <BatchPhoto key={item.id} inlineImage={item.front} imageId={item.frontImgId} alt={"Saved card " + (index + 1)} />)}
      </div>
      <div className="flex gap-8">
        <button className="btn btn-primary btn-lg flex-1" disabled={busy || (!queue.length && !front)} onClick={() => leave(true)}><IconCheck size={14} /> Review {queue.length + (front ? 1 : 0)} cards</button>
        <button className="btn btn-ghost btn-lg" disabled={busy} onClick={() => leave(false)}>Save and pause</button>
      </div>
    </section>
  );
}
