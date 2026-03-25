import { useMemo } from "react";
import { fmtShort } from "../lib/utils";

export default function SetsView({ catalog }) {
  const setCompletion = useMemo(() => {
    const sets = {};
    catalog.forEach((c) => {
      if (c.set) {
        const k = c.set;
        if (!sets[k]) sets[k] = { name: c.set, cards: [], nums: new Set() };
        sets[k].cards.push(c);
        if (c.number) sets[k].nums.add(c.number);
      }
    });
    return Object.values(sets).sort((a, b) => b.cards.length - a.cards.length);
  }, [catalog]);

  return (
    <div className="fade">
      <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>Set Completion</h2>
      {setCompletion.length === 0 && (
        <p style={{ color: "var(--dim)", textAlign: "center", padding: 30 }}>No sets &mdash; add "Set" field to cards</p>
      )}
      {setCompletion.map((s, i) => (
        <div key={s.name} className="card fade" style={{ marginBottom: 6, animationDelay: `${i * .03}s` }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <strong style={{ fontSize: 13 }}>{s.name}</strong>
              <div style={{ fontSize: 9, color: "var(--dim)" }}>{s.cards.length} cards &middot; {s.nums.size} unique #s</div>
            </div>
            <span className="gold" style={{ fontWeight: 800 }}>{fmtShort(s.cards.reduce((t, c) => t + (parseFloat(c.priceEstimate?.mid) || 0), 0))}</span>
          </div>
          <div style={{ marginTop: 6, height: 4, background: "var(--brd)", borderRadius: 4 }}>
            <div style={{ height: "100%", width: `${Math.min(100, s.cards.length * 2)}%`, background: "linear-gradient(90deg,var(--acc),var(--acc2))", borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
