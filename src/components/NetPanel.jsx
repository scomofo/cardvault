import { fmtShort } from "../lib/utils";

/**
 * Shows estimated net proceeds after platform fees and shipping.
 * Includes cost basis profit/loss when available and a floor price warning.
 */
export default function NetPanel({ price, shipping = 0, feeRate = 0, costBasis = 0, floorPrice = 0 }) {
  const p = parseFloat(price) || 0;
  if (p <= 0) return null;

  const feeAmt = Math.round(p * feeRate * 100) / 100;
  const ship = parseFloat(shipping) || 0;
  const net = Math.round((p - feeAmt - ship) * 100) / 100;
  const hasCost = costBasis > 0;
  const profit = hasCost ? Math.round((net - costBasis) * 100) / 100 : null;
  const belowFloor = floorPrice > 0 && p < floorPrice;
  const lossMoney = hasCost && profit !== null && profit < 0;

  return (
    <div
      className="glass mt-8"
      style={{
        padding: "10px 14px",
        borderRadius: "var(--radius)",
        fontSize: 12,
        borderColor: belowFloor ? "var(--red-brd)" : undefined,
      }}
    >
      <div className="flex justify-between mb-4">
        <span className="text-dim">List price</span>
        <span className="fw-600">{fmtShort(p)}</span>
      </div>
      {feeAmt > 0 && (
        <div className="flex justify-between mb-4">
          <span className="text-dim">Platform fee ({Math.round(feeRate * 100)}%)</span>
          <span style={{ color: "var(--red)" }}>-{fmtShort(feeAmt)}</span>
        </div>
      )}
      {ship > 0 && (
        <div className="flex justify-between mb-4">
          <span className="text-dim">Shipping</span>
          <span style={{ color: "var(--red)" }}>-{fmtShort(ship)}</span>
        </div>
      )}
      <div
        className="flex justify-between"
        style={{ borderTop: "1px solid var(--brd)", paddingTop: 6 }}
      >
        <span className="fw-700">Net proceeds</span>
        <span className="fw-800" style={{ color: net >= 0 ? "var(--grn)" : "var(--red)" }}>
          {fmtShort(Math.max(net, 0))}
        </span>
      </div>
      {profit !== null && (
        <div className="flex justify-between mt-4">
          <span className="text-dim">Est. profit</span>
          <span className="fw-700" style={{ color: lossMoney ? "var(--red)" : "var(--grn)" }}>
            {profit >= 0 ? "+" : ""}{fmtShort(profit)}
          </span>
        </div>
      )}
      {belowFloor && (
        <div className="fw-700 mt-6" style={{ color: "var(--red)", fontSize: 11 }}>
          Below floor price ({fmtShort(floorPrice)}) — confirm before listing
        </div>
      )}
    </div>
  );
}
