import { useState, useRef } from "react";
import { useToast } from "./Toast";
import { useData } from "../lib/DataContext";
import { itemsAPI } from "../lib/api";
import { uid } from "../lib/utils";
import { IconUpload, Spinner } from "./Icons";

const CV_FIELDS = [
  { v: "", l: "— Skip —" },
  { v: "name", l: "Name *" },
  { v: "set", l: "Set" },
  { v: "year", l: "Year" },
  { v: "number", l: "Card #" },
  { v: "condition", l: "Condition" },
  { v: "costBasis", l: "Cost $" },
  { v: "type", l: "Type" },
  { v: "binder", l: "Binder" },
  { v: "notes", l: "Notes" },
  { v: "parallel", l: "Parallel" },
  { v: "rarity", l: "Rarity" },
  { v: "playerName", l: "Player" },
  { v: "sport", l: "Sport" },
  { v: "manufacturer", l: "Manufacturer" },
];

const AUTO_DETECT = {
  name: /^(card\s*)?name$|^player$/i,
  set: /^(card\s*)?set$|^edition$|^series$/i,
  year: /^year$|^season$/i,
  number: /^(card\s*)?#?num(ber)?$|^card\s*#$/i,
  condition: /^cond(ition)?$|^grade$/i,
  costBasis: /^cost(\s*basis)?$|^(purchase|buy)\s*price$|^paid$/i,
  type: /^type$|^category$/i,
  binder: /^binder$|^storage$|^location$/i,
  notes: /^notes?$|^comments?$|^remarks?$/i,
  parallel: /^parallel$|^variant$|^variety$/i,
  playerName: /^player(\s*name)?$/i,
  sport: /^sport$/i,
  manufacturer: /^(manufacturer|brand|mfg)$/i,
};

function parseCsvLine(line) {
  const result = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === "," && !inQ) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(parseCsvLine);
  return { headers, rows };
}

function autoDetect(header) {
  const h = header.trim();
  for (const [field, rx] of Object.entries(AUTO_DETECT)) {
    if (rx.test(h)) return field;
  }
  return "";
}

function buildItem(row, headers, mapping) {
  const item = { id: uid(), status: "inventory", condition: "near_mint", type: "sports", listedOn: [] };
  headers.forEach((h, i) => {
    const field = mapping[h];
    if (!field) return;
    const val = (row[i] || "").trim();
    if (!val) return;
    if (field === "costBasis") {
      item.costBasis = parseFloat(val.replace(/[$,]/g, "")) || 0;
    } else {
      item[field] = val;
    }
  });
  return item;
}

export default function CsvImport({ onImported }) {
  const toast = useToast();
  const { setCatalog, useServer } = useData();
  const fileRef = useRef(null);
  const [parsed, setParsed] = useState(null);
  const [mapping, setMapping] = useState({});
  const [importing, setImporting] = useState(false);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      const { headers, rows } = parseCSV(text);
      if (!headers.length) { toast.error("Could not parse CSV — check file format"); return; }
      const detectedMapping = {};
      for (const h of headers) detectedMapping[h] = autoDetect(h);
      setParsed({ headers, rows });
      setMapping(detectedMapping);
    });
    e.target.value = "";
  };

  const doImport = async () => {
    if (!parsed) return;
    const items = parsed.rows
      .map((row) => buildItem(row, parsed.headers, mapping))
      .filter((i) => i.name);
    if (!items.length) { toast.error("No rows with a Name value found"); return; }

    setImporting(true);
    try {
      if (useServer) {
        await itemsAPI.bulkCreate(items);
      } else {
        const stamped = items.map((i) => ({ ...i, createdAt: new Date().toISOString() }));
        setCatalog((p) => [...stamped, ...p]);
      }
      toast.success(`Imported ${items.length} cards`);
      setParsed(null);
      setMapping({});
      onImported?.();
    } catch (err) {
      toast.error(`Import failed: ${err.message}`);
    }
    setImporting(false);
  };

  const cancel = () => { setParsed(null); setMapping({}); };

  if (!parsed) {
    return (
      <button
        className="btn btn-outline btn-sm"
        onClick={() => fileRef.current?.click()}
      >
        <IconUpload size={12} /> Import CSV
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv" style={{ display: "none" }} onChange={onFile} />
      </button>
    );
  }

  const previewRows = parsed.rows.slice(0, 3);
  const nameCol = Object.entries(mapping).find(([, v]) => v === "name")?.[0];

  return (
    <div className="card fade mb-12">
      <div className="lbl mb-6">CSV Import — Column Mapping</div>
      <div className="text-xxs text-dim mb-10">
        {parsed.rows.length} rows detected. Map each column below. Rows without a Name will be skipped.
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr>
              {parsed.headers.map((h) => (
                <th key={h} style={{ padding: "4px 8px", borderBottom: "1px solid var(--brd)", textAlign: "left" }}>
                  <div className="text-xxs text-dim mb-4">{h}</div>
                  <select
                    className="inp"
                    style={{ fontSize: 11, padding: "2px 4px" }}
                    value={mapping[h] || ""}
                    onChange={(e) => setMapping((p) => ({ ...p, [h]: e.target.value }))}
                  >
                    {CV_FIELDS.map(({ v, l }) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, ri) => (
              <tr key={ri} style={{ opacity: 0.7 }}>
                {parsed.headers.map((h, ci) => (
                  <td key={ci} style={{ padding: "3px 8px", borderBottom: "1px solid var(--brd)", fontSize: 11, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row[ci] || ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!nameCol && (
        <div className="text-xs mt-8" style={{ color: "var(--orange)" }}>
          Map a column to "Name *" to enable import.
        </div>
      )}

      <div className="flex gap-8 mt-12">
        <button
          className="btn btn-primary btn-sm"
          onClick={doImport}
          disabled={importing || !nameCol}
        >
          {importing ? <Spinner size={12} /> : <IconUpload size={12} />}
          {" "}Import {parsed.rows.length} rows
        </button>
        <button className="btn btn-ghost btn-sm" onClick={cancel}>Cancel</button>
      </div>
    </div>
  );
}
