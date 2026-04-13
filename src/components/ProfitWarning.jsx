import { fmtShort } from "../lib/utils";

/**
 * Inline warning when listing/selling below cost basis.
 * @param {{ price: number, costBasis: number, feeRate: number, shipping: number }} props
 */  
export default function ProfitWarning({ price, costBasis, feeRate = 0, shipping = 0 }) {
  if (!costBasis || costBasis <= 0 || !price || price <= 0) return null;
  const fees = Math.round(price * feeRate * 100) / 100;
  const net = price - costBasis - fees - shipping;
  if (net >= 0) return null;
  return (
    <div className="text-xs fw-700 mt-4" style={{ color: "var(--red)" }}>
      Below cost — loss of {fmtShort(Math.abs(net))}
    </div>
  );
}