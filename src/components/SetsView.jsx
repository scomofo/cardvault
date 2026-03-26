import { useMemo } from "react";
import { useData } from "../lib/DataContext";
import { fmtShort } from "../lib/utils";

export default function SetsView() {
  const { catalog } = useData();
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

  const maxCards = useMemo(
    () => setCompletion.reduce((m, s) => Math.max(m, s.cards.length), 0),
    [setCompletion]
  );

  return (
    <div>
      {setCompletion.length === 0 && (
        <div className="card empty-state" style={{ padding: 32 }}>
          <div className="empty-desc">No sets &mdash; add "Set" field to your cards</div>
        </div>
      )}
      {setCompletion.map((s, i) => (
        <div key={s.name} className="card fade mb-8" style={{ animationDelay: `${i * .03}s` }}>
          <div className="flex justify-between items-center">
            <div>
              <strong className="text-sm">{s.name}</strong>
              <div className="text-xxs text-dim mt-4">{s.cards.length} cards &middot; {s.nums.size} unique #s</div>
            </div>
            <span className="gold fw-800">{fmtShort(s.cards.reduce((t, c) => t + (parseFloat(c.priceEstimate?.mid) || 0), 0))}</span>
          </div>
          {maxCards > 0 && (
            <div className="progress-track mt-8">
              <div className="progress-fill" style={{ width: `${Math.round((s.cards.length / maxCards) * 100)}%` }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
