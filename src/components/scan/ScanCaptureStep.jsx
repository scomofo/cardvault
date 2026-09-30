import { useState } from "react";
import Camera from "../Camera";
import CaptureStationSetup from "./CaptureStationSetup";
import {
  IconChevron,
  IconExternalLink,
  IconSearch,
  IconShield,
  IconZap,
  Spinner,
} from "../Icons";

export default function ScanCaptureStep({
  backImg,
  card,
  cvAnalyzing,
  cvOnline,
  frontImg,
  onAnalyzeCv,
  onBackCapture,
  onBackRetake,
  onFrontCapture,
  onFrontRetake,
  onManualEntry,
  onNext,
  onRecognize,
  onVisualSearch,
  visualSearching,
  recognizing,
}) {
  const [captureBusy, setCaptureBusy] = useState(false);
  const captureSide = !frontImg ? "front" : !backImg ? "back" : null;
  const working = captureBusy || visualSearching || recognizing || cvAnalyzing;
  return (
    <section className="slide-up">
      <div className="card-hero mb-12">
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
          Photograph Card
        </h2>
        <Camera side={captureSide || "back"} continuous
          disabled={!captureSide || visualSearching || recognizing || cvAnalyzing}
          onCapture={captureSide === "front" ? onFrontCapture : onBackCapture}
          onBusyChange={setCaptureBusy} />
        {frontImg && !backImg && <p className="text-xs mt-8" role="status">Front captured. Flip the card, then press Space for the back.</p>}
        <div className="flex gap-10 mt-8" style={{ flexWrap: "wrap" }}>
          {frontImg && <Camera side="front" image={frontImg} onRetake={onFrontRetake} disabled={working} compact />}
          {backImg && <Camera side="back" image={backImg} onRetake={onBackRetake} disabled={working} compact />}
        </div>
      </div>

      <CaptureStationSetup />

      <div className="flex gap-8">
        <button
          className="btn btn-primary btn-lg flex-1"
          disabled={!frontImg || working}
          onClick={onVisualSearch}
        >
          {visualSearching ? <Spinner size={16} /> : <IconSearch size={16} />}{" "}
          Visual Search
        </button>
        <button
          className="btn btn-outline btn-lg"
          disabled={working}
          onClick={frontImg ? onNext : onManualEntry}
        >
          {frontImg ? "Skip" : "Manual Entry"} <IconChevron size={14} />
        </button>
      </div>

      <div className="flex gap-8 mt-8">
        <button
          className="btn btn-ghost btn-sm flex-1"
          disabled={!frontImg || working}
          onClick={onRecognize}
        >
          <IconZap size={12} /> ID Only
        </button>
        <button
          className="btn btn-ghost btn-sm flex-1"
          disabled={!frontImg || working}
          onClick={() => {
            const query = [card.name, card.set, card.number].filter(Boolean).join(" ");
            if (query) {
              window.open(
                `https://lens.google.com/search?p=${encodeURIComponent(query)}`,
                "_blank",
              );
            } else {
              window.open("https://lens.google.com", "_blank");
            }
          }}
        >
          <IconExternalLink size={12} /> Google Lens
        </button>
      </div>

      {cvOnline && frontImg && (
        <button
          className="btn btn-outline btn-full mt-8"
          disabled={working}
          onClick={onAnalyzeCv}
        >
          {cvAnalyzing ? <Spinner size={14} /> : <IconShield size={14} />} CV
          Centering Scan
        </button>
      )}

      {!cvOnline && (
        <div className="text-xxs text-dim mt-6" style={{ textAlign: "center" }}>
          CV service offline - start with:{" "}
          <code style={{ fontSize: 10 }}>
            cd cv-service && uvicorn main:app --port 8000
          </code>
        </div>
      )}
    </section>
  );
}
