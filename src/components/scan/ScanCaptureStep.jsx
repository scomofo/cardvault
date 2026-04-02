import Camera from "../Camera";
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
  onNext,
  onRecognize,
  onVisualSearch,
  visualSearching,
}) {
  return (
    <section className="slide-up">
      <div className="card-hero mb-12">
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
          Photograph Card
        </h2>
        <div className="flex gap-10" style={{ flexWrap: "wrap" }}>
          <Camera
            side="front"
            image={frontImg}
            onCapture={onFrontCapture}
            onRetake={onFrontRetake}
          />
          <Camera
            side="back"
            image={backImg}
            onCapture={onBackCapture}
            onRetake={onBackRetake}
          />
        </div>
      </div>

      <details className="mb-12">
        <summary
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--acc)",
            cursor: "pointer",
            padding: "8px 0",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          Photo Tips for Best Results
        </summary>
        <div
          className="card mt-6"
          style={{ fontSize: 12, lineHeight: 1.8, color: "var(--dim)" }}
        >
          <div className="fw-700 mb-4" style={{ color: "var(--tx)" }}>
            Lighting & Setup
          </div>
          <div>
            Use a <b style={{ color: "var(--tx)" }}>black background</b> for
            chrome/white-bordered cards
          </div>
          <div>
            Position camera <b style={{ color: "var(--tx)" }}>parallel to card</b>{" "}
            - tilt 5-10° for reflections
          </div>
          <div className="fw-700 mt-8 mb-4" style={{ color: "var(--tx)" }}>
            iPhone Tips
          </div>
          <div>
            Use <b style={{ color: "var(--tx)" }}>2x or 3x telephoto</b> - avoid
            1x wide (barrel distortion)
          </div>
          <div>
            Tap & hold for <b style={{ color: "var(--tx)" }}>AE/AF Lock</b>
          </div>
        </div>
      </details>

      <div className="flex gap-8">
        <button
          className="btn btn-primary btn-lg flex-1"
          disabled={!frontImg || visualSearching}
          onClick={onVisualSearch}
        >
          {visualSearching ? <Spinner size={16} /> : <IconSearch size={16} />}{" "}
          Visual Search
        </button>
        <button className="btn btn-outline btn-lg" disabled={!frontImg} onClick={onNext}>
          Skip <IconChevron size={14} />
        </button>
      </div>

      <div className="flex gap-8 mt-8">
        <button
          className="btn btn-ghost btn-sm flex-1"
          disabled={!frontImg}
          onClick={onRecognize}
        >
          <IconZap size={12} /> ID Only
        </button>
        <button
          className="btn btn-ghost btn-sm flex-1"
          disabled={!frontImg}
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
          disabled={cvAnalyzing}
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
