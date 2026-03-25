import { CONDITIONS } from "./constants";

export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 9);

export const fmt$ = (v) => "$" + Number(v || 0).toFixed(2) + " CAD";
export const fmtShort = (v) => "$" + Number(v || 0).toFixed(2);
export const condOf = (v) => CONDITIONS.find((c) => c.v === v) || CONDITIONS[2];

export function escapeHtml(str) {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str || ""));
  return div.innerHTML;
}

export function findDupes(card, catalog) {
  if (!card.name) return [];
  const n = card.name.toLowerCase().trim();
  return catalog.filter((c) => {
    const cn = (c.name || "").toLowerCase().trim();
    if (!cn) return false;
    return cn === n || (cn.includes(n) && n.length > 3) || (n.includes(cn) && cn.length > 3);
  });
}

export function download(content, filename, type = "text/csv") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
