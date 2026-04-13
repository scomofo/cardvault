import { fmtShort } from "../lib/utils";

/**
 * Compact inline display of recent sold comps.
 * @param {{ comps: { price: number, source: string, date: string }[] }} props
 */
export default function SoldComps({ comps }) {
  if (!comps || comps.length === 0) return null;
  const prices = comps.slice(0, 5).map((c) => Number(c.price) || 0).filter((p) => p > 0);
  if (prices.length === 0) return null;
  const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
  return (
    <div className="text-xxs text-dim mt-4">
      Recent: {prices.map((p, i) => (
        <span key={i}>{i > 0 && ", "}<span className="fw-600">{fmtShort(p)}</span></span>
      ))}
      {" "}&middot; avg <span className="fw-700 gold">{fmtShort(avg)}</span>
    </div>
  );
}