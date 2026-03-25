import { useState } from "react";
import { fmtShort } from "../lib/utils";

export default function PriceChart({ data, height = 150 }) {
  const [hov, setHov] = useState(null);

  if (!data || data.length < 2) return null;

  const prices = data.map((d) => d.avgPrice || d.price || 0);
  const labels = data.map((d) => d.month || d.date || "");
  const mn = Math.min(...prices);
  const mx = Math.max(...prices);
  const rng = mx - mn || 1;
  const w = 100, h2 = 100, p = 3;

  const pts = prices.map((v, i) => ({
    x: p + (i / (prices.length - 1)) * (w - p * 2),
    y: h2 - p - ((v - mn) / rng) * (h2 - p * 2),
  }));

  const line = pts.map((pt) => `${pt.x},${pt.y}`).join(" ");
  const area = line + ` ${pts[pts.length - 1].x},${h2 - p} ${pts[0].x},${h2 - p}`;
  const trend = prices[prices.length - 1] - prices[0];
  const tPct = prices[0] > 0 ? ((trend / prices[0]) * 100).toFixed(1) : "0";

  const clampHov = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const idx = Math.round(((e.clientX - r.left) / r.width) * (prices.length - 1));
    setHov(Math.max(0, Math.min(idx, prices.length - 1)));
  };

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span className="lbl" style={{ margin: 0 }}>Price Trend</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: trend >= 0 ? "var(--grn)" : "var(--red)" }}>
          {trend >= 0 ? "\u25b2" : "\u25bc"}{tPct}%
        </span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h2}`}
        style={{ width: "100%", height, display: "block", borderRadius: 10, background: "linear-gradient(180deg,var(--s2),var(--s1))" }}
        onMouseMove={clampHov}
        onMouseLeave={() => setHov(null)}
      >
        <defs>
          <linearGradient id="cf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--acc)" stopOpacity=".2" />
            <stop offset="100%" stopColor="var(--acc)" stopOpacity=".01" />
          </linearGradient>
        </defs>
        {[0, .25, .5, .75, 1].map((v, i) => (
          <line key={i} x1={p} x2={w - p} y1={h2 - p - v * (h2 - p * 2)} y2={h2 - p - v * (h2 - p * 2)} stroke="var(--brd)" strokeWidth=".25" strokeDasharray="1,2" />
        ))}
        <polygon points={area} fill="url(#cf)" />
        <polyline points={line} fill="none" stroke="var(--acc)" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" />
        {hov != null && (
          <>
            <circle cx={pts[hov].x} cy={pts[hov].y} r="2.5" fill="var(--acc2)" stroke="var(--bg)" strokeWidth="1" />
            <line x1={pts[hov].x} x2={pts[hov].x} y1={p} y2={h2 - p} stroke="var(--acc)" strokeWidth=".3" strokeDasharray="1,1.5" />
          </>
        )}
      </svg>
      {hov != null && (
        <div style={{
          position: "absolute", top: 24, left: "50%", transform: "translateX(-50%)",
          background: "var(--s1)", border: "1px solid var(--brd)", borderRadius: 8,
          padding: "4px 12px", fontSize: 12, fontWeight: 700, pointerEvents: "none",
          whiteSpace: "nowrap", zIndex: 10, boxShadow: "0 8px 24px #0008",
        }}>
          {labels[hov]}: <span className="gold">{fmtShort(prices[hov])}</span>
        </div>
      )}
    </div>
  );
}
