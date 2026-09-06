import { useMemo, useState } from "react";
import { inventoryBlockedReason } from "../../lib/batchDraft";
export default function BatchInventoryPicker({ actions, disabled }) {
  const [query, setQuery] = useState(""), [selected, setSelected] = useState([]), [limit, setLimit] = useState(40);
  const matches = useMemo(() => actions.data.catalog.filter((card) => [card.name, card.set, card.cardSet, card.number, card.cardNumber].join(" ").toLowerCase().includes(query.toLowerCase())), [actions.data.catalog, query]);
  return <details className="card"><summary>Add cards already in inventory</summary>
    <label className="batch-label">Search inventory<input className="inp" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(40); }} /></label>
    <div className="batch-picker">{matches.slice(0, limit).map((card) => {
      const reason = inventoryBlockedReason(card, actions.data.listings, actions.session.entries);
      return <label key={card.id} className="batch-picker-row"><input type="checkbox" disabled={disabled || Boolean(reason)} checked={selected.includes(card.id) && !reason} onChange={(event) => setSelected((ids) => event.target.checked ? [...ids, card.id] : ids.filter((id) => id !== card.id))} /><span><strong>{card.name || "Unnamed card"}</strong><small>{reason || [card.set || card.cardSet, card.number || card.cardNumber].filter(Boolean).join(" · ")}</small></span></label>;
    })}</div>
    {!matches.length && <p className="batch-help">No matching inventory cards.</p>}
    <div className="batch-toolbar">{matches.length > limit && <button className="btn btn-ghost" onClick={() => setLimit(limit + 40)}>Show more ({matches.length - limit})</button>}<button className="btn btn-primary" disabled={disabled || !selected.length} onClick={async () => { if (await actions.addInventory(selected) !== false) setSelected([]); }}>Add selected cards ({selected.length})</button><span className="batch-help">Existing cards are reused, not copied.</span></div>
  </details>;
}
