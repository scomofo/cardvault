/**
 * Visual overlay showing centering ratio lines over a card image.
 * Draws L/R and T/B measurement lines with ratio labels.
 */
export default function CenteringOverlay({ centering, style }) {
  if (!centering) return null;

  const { lr, tb, left, right, top, bottom, is_gem, score } = centering;
  const gemColor = is_gem ? "#5a9e6f" : score >= 9.0 ? "#c89040" : "#c7453b";

  return (
    <div style={{
      position: "absolute", inset: 0, pointerEvents: "none", zIndex: 5,
      ...style,
    }}>
      {/* Horizontal centering line */}
      <div style={{
        position: "absolute", top: "50%", left: 0, right: 0, height: 1,
        borderTop: `1px dashed ${gemColor}80`,
      }} />

      {/* Vertical centering line */}
      <div style={{
        position: "absolute", left: "50%", top: 0, bottom: 0, width: 1,
        borderLeft: `1px dashed ${gemColor}80`,
      }} />

      {/* Left/Right ratio */}
      <div style={{
        position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)",
        background: "rgba(0,0,0,0.75)", padding: "2px 8px", borderRadius: 2,
        fontSize: 10, fontWeight: 700, color: gemColor, whiteSpace: "nowrap",
        fontFamily: "var(--font-mono, monospace)",
      }}>
        L/R: {lr}
      </div>

      {/* Top/Bottom ratio */}
      <div style={{
        position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
        background: "rgba(0,0,0,0.75)", padding: "2px 8px", borderRadius: 2,
        fontSize: 10, fontWeight: 700, color: gemColor, whiteSpace: "nowrap",
        fontFamily: "var(--font-mono, monospace)",
        writingMode: "vertical-rl", textOrientation: "mixed",
      }}>
        T/B: {tb}
      </div>

      {/* Gem badge */}
      {is_gem && (
        <div style={{
          position: "absolute", top: 6, left: 6,
          background: "#5a9e6f", color: "#fff", padding: "2px 6px",
          fontSize: 9, fontWeight: 800, borderRadius: 2,
          letterSpacing: "0.5px",
        }}>
          GEM
        </div>
      )}

      {/* Score badge */}
      <div style={{
        position: "absolute", top: 6, right: 6,
        background: "rgba(0,0,0,0.75)", color: gemColor, padding: "2px 8px",
        fontSize: 11, fontWeight: 800, borderRadius: 2,
      }}>
        {score}/10
      </div>
    </div>
  );
}
