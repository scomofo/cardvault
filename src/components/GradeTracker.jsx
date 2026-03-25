import { useState } from "react";
import { useToast } from "./Toast";
import { uid } from "../lib/utils";

export default function GradeTracker({ gradings, setGradings }) {
  const toast = useToast();
  const [input, setInput] = useState({
    cardName: "", set: "", number: "", company: "PSA",
    service: "Economy", cost: "", dateSent: "", preValue: "", status: "sent",
  });

  const submit = () => {
    if (!input.cardName) { toast.error("Enter card name"); return; }
    setGradings((p) => [{
      id: uid(), ...input, grade: "", certNumber: "", postValue: "",
      createdAt: new Date().toISOString(),
    }, ...p]);
    setInput({ cardName: "", set: "", number: "", company: "PSA", service: "Economy", cost: "", dateSent: "", preValue: "", status: "sent" });
    toast.success("Submission added");
  };

  return (
    <div className="fade">
      <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>Grading Tracker</h2>
      <div className="card" style={{ marginBottom: 10 }}>
        <div className="lbl">New Submission</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 4 }}>
          <input className="inp" placeholder="Card *" value={input.cardName} onChange={(e) => setInput((p) => ({ ...p, cardName: e.target.value }))} />
          <select className="inp" value={input.company} onChange={(e) => setInput((p) => ({ ...p, company: e.target.value }))}>
            <option>PSA</option><option>BGS</option><option>SGC</option><option>CGC</option>
          </select>
          <input className="inp" type="number" step="0.01" placeholder="Cost $" value={input.cost} onChange={(e) => setInput((p) => ({ ...p, cost: e.target.value }))} />
          <input className="inp" type="date" value={input.dateSent} onChange={(e) => setInput((p) => ({ ...p, dateSent: e.target.value }))} />
        </div>
        <button className="btn-a" style={{ marginTop: 6 }} onClick={submit}>+ Submit</button>
      </div>

      {gradings.map((g) => (
        <div key={g.id} className="card" style={{ marginBottom: 6, borderLeft: `3px solid ${g.company === "PSA" ? "var(--red)" : g.company === "BGS" ? "#3b82f6" : "var(--grn)"}` }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <strong style={{ fontSize: 12 }}>{g.cardName}</strong>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--acc)" }}>{g.company}{g.grade ? ` ${g.grade}` : ""}</span>
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            <select className="inp" style={{ width: "auto", padding: "2px 4px", fontSize: 9 }} value={g.status} onChange={(e) => setGradings((p) => p.map((x) => (x.id === g.id ? { ...x, status: e.target.value } : x)))}>
              <option value="sent">Sent</option>
              <option value="received">Received</option>
              <option value="grading">Grading</option>
              <option value="returned">Returned</option>
            </select>
            <input className="inp" style={{ width: 50, padding: "2px 4px", fontSize: 9 }} placeholder="Grade" value={g.grade || ""} onChange={(e) => setGradings((p) => p.map((x) => (x.id === g.id ? { ...x, grade: e.target.value } : x)))} />
            <input className="inp" style={{ width: 60, padding: "2px 4px", fontSize: 9 }} placeholder="Cert #" value={g.certNumber || ""} onChange={(e) => setGradings((p) => p.map((x) => (x.id === g.id ? { ...x, certNumber: e.target.value } : x)))} />
            <div style={{ flex: 1 }} />
            <button className="btn-g" style={{ padding: "2px 5px", fontSize: 8, color: "var(--red)" }} onClick={() => setGradings((p) => p.filter((x) => x.id !== g.id))}>&times;</button>
          </div>
        </div>
      ))}
    </div>
  );
}
