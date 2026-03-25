import { condOf, escapeHtml, fmtShort } from "./utils";

export function genInsurancePDF(cards, owner = "") {
  const active = cards.filter((c) => c.name && c.status !== "sold");
  const total = active.reduce((s, c) => s + (parseFloat(c.priceEstimate?.mid) || 0), 0);
  const date = new Date().toLocaleDateString("en-CA");

  const rows = active
    .map(
      (c, i) =>
        `<tr><td>${i + 1}</td><td><b>${escapeHtml(c.name)}</b><br><small>${[c.set, c.year, c.number && "#" + c.number]
          .filter(Boolean)
          .map(escapeHtml)
          .join(" \u00b7 ")}</small></td><td>${escapeHtml(condOf(c.condition).l)}</td><td style="text-align:right">$${(parseFloat(c.priceEstimate?.mid) || 0).toFixed(2)}</td></tr>`
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>CardVault Insurance Valuation</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui;padding:32px;color:#1a1a1a;max-width:800px;margin:auto}
h1{font-size:20px}h2{font-size:13px;color:#666;margin-bottom:16px;font-weight:400}
.hdr{border-bottom:2px solid #d4a017;padding-bottom:10px;margin-bottom:16px}
.meta{display:flex;justify-content:space-between;font-size:11px;color:#666;margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:11px}
th{background:#f5f5f5;text-align:left;padding:6px;border-bottom:2px solid #ddd;font-size:10px;text-transform:uppercase}
td{padding:6px;border-bottom:1px solid #eee}td small{color:#888}
.total{text-align:right;font-size:15px;font-weight:bold;margin-top:14px;padding:10px;background:#f9f6ee;border:1px solid #d4a017;border-radius:6px}
.foot{margin-top:20px;font-size:9px;color:#888;border-top:1px solid #eee;padding-top:10px}
@media print{body{padding:16px}}</style></head>
<body><div class="hdr"><h1>Collection Insurance Valuation</h1><h2>CardVault Report</h2></div>
<div class="meta"><span><b>Owner:</b> ${escapeHtml(owner) || "[Name]"}</span><span><b>Date:</b> ${date}</span><span><b>Items:</b> ${active.length}</span><span><b>Currency:</b> CAD</span></div>
<table><thead><tr><th>#</th><th>Card</th><th>Condition</th><th style="text-align:right">Value (CAD)</th></tr></thead><tbody>${rows}</tbody></table>
<div class="total">Total: $${total.toFixed(2)} CAD</div>
<div class="foot"><p>Values from eBay sold listings &amp; TCGplayer as of ${date}. All CAD.</p>
<p style="margin-top:6px;font-size:8px;color:#aaa">For insurance documentation. Not a professional appraisal.</p></div></body></html>`;
}

export function genCSV(catalog) {
  const header = "Name,Set,Year,#,Condition,Value,Cost,Status,Binder";
  const rows = catalog.map(
    (c) =>
      `"${(c.name || "").replace(/"/g, '""')}","${(c.set || "").replace(/"/g, '""')}","${c.year || ""}","${c.number || ""}","${condOf(c.condition).l}","${c.priceEstimate?.mid || ""}","${c.costBasis || ""}","${c.status || ""}","${(c.binder || "").replace(/"/g, '""')}"`
  );
  return header + "\n" + rows.join("\n");
}

export function genEbayCSV(catalog) {
  const header = "Action,Title,Price,Category,Duration,Format";
  const rows = catalog
    .filter((c) => c.name && c.status !== "sold")
    .map((c) => {
      const co = condOf(c.condition);
      const title = [c.name, c.set, c.number && "#" + c.number, co.s].filter(Boolean).join(" ").slice(0, 80);
      return `Add,"${title.replace(/"/g, '""')}",${c.priceEstimate?.mid || "0.99"},261328,GTC,FixedPrice`;
    });
  return header + "\n" + rows.join("\n");
}

export function genSalesCSV(sales) {
  const header = "Date,Card,Platform,Sale CAD,Cost CAD,Net CAD";
  const rows = sales.map(
    (s) =>
      `"${new Date(s.date).toLocaleDateString("en-CA")}","${(s.cardName || "").replace(/"/g, '""')}","${s.platform}",${s.salePrice},${s.costBasis},${s.netProfit.toFixed(2)}`
  );
  return header + "\n" + rows.join("\n");
}
