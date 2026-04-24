import { CONDITIONS } from "./constants";

export const uid = () =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) +
      Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, "0")).join("");

export const fmt$ = (v) => "$" + Number(v || 0).toFixed(2) + " CAD";
export const fmtShort = (v) => "$" + Number(v || 0).toFixed(2);
export const condOf = (v) => CONDITIONS.find((c) => c.v === v) || CONDITIONS[2];

export function escapeHtml(str) {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str || ""));
  return div.innerHTML;
}

export function download(content, filename, type = "text/csv") {
  const a = document.createElement("a");
  const objectUrl = URL.createObjectURL(new Blob([content], { type }));
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
