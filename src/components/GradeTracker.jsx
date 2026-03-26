import { useState } from "react";
import { useToast } from "./Toast";
import { useData } from "../lib/DataContext";
import { uid } from "../lib/utils";
import { IconPlus, IconX } from "./Icons";

const COMPANY_COLORS = { PSA: "var(--red)", BGS: "var(--blue)", SGC: "var(--grn)", CGC: "var(--purple)" };

export default function GradeTracker() {
  const { gradings, setGradings } = useData();
  const toast = useToast();
  const [input, setInput] = useState({
    cardName: "", set: "", number: "", company: "PSA",
    service: "Economy", cost: "", dateSent: "", preValue: "", status: "sent",
  });

  const submit = () => {
    if (!input.cardName) { toast.error("Enter card name"); return; }
    setGradings((p) => [{ id: uid(), ...input, grade: "", certNumber: "", postValue: "", createdAt: new Date().toISOString() }, ...p]);
    setInput({ cardName: "", set: "", number: "", company: "PSA", service: "Economy", cost: "", dateSent: "", preValue: "", status: "sent" });
    toast.success("Submission added");
  };

  const deleteGrading = (id) => {
    if (window.confirm("Delete this grading entry?")) {
      setGradings((p) => p.filter((x) => x.id !== id));
      toast.info("Grading entry deleted");
    }
  };

  return (
    <div>
      <div className="card-elevated mb-12">
        <div className="lbl">New Submission</div>
        <div className="form-grid mt-6">
          <input className="inp" placeholder="Card name *" value={input.cardName} onChange={(e) => setInput((p) => ({ ...p, cardName: e.target.value }))} />
          <select className="inp" value={input.company} onChange={(e) => setInput((p) => ({ ...p, company: e.target.value }))}>
            <option>PSA</option><option>BGS</option><option>SGC</option><option>CGC</option>
          </select>
          <input className="inp" type="number" step="0.01" placeholder="Cost $" value={input.cost} onChange={(e) => setInput((p) => ({ ...p, cost: e.target.value }))} />
          <input className="inp" type="date" value={input.dateSent} onChange={(e) => setInput((p) => ({ ...p, dateSent: e.target.value }))} />
        </div>
        <button className="btn btn-primary btn-sm mt-8" onClick={submit}><IconPlus size={12} /> Submit</button>
      </div>

      {gradings.length === 0 && (
        <div className="card empty-state" style={{ padding: 32 }}>
          <div className="empty-desc">No grading submissions tracked</div>
        </div>
      )}

      {gradings.map((g) => (
        <div key={g.id} className="card mb-6" style={{ borderLeft: `3px solid ${COMPANY_COLORS[g.company] || "var(--dim)"}` }}>
          <div className="flex justify-between items-center">
            <strong className="text-sm">{g.cardName}</strong>
            <span className="badge badge-acc">{g.company}{g.grade ? ` ${g.grade}` : ""}</span>
          </div>
          <div className="flex gap-6 mt-6 items-center">
            <select className="inp" style={{ width: "auto", padding: "4px 8px", fontSize: 11 }} value={g.status}
              onChange={(e) => setGradings((p) => p.map((x) => (x.id === g.id ? { ...x, status: e.target.value } : x)))}>
              <option value="sent">Sent</option>
              <option value="received">Received</option>
              <option value="grading">Grading</option>
              <option value="returned">Returned</option>
            </select>
            <input className="inp" style={{ width: 60, padding: "4px 8px", fontSize: 11 }} placeholder="Grade" value={g.grade || ""}
              onChange={(e) => setGradings((p) => p.map((x) => (x.id === g.id ? { ...x, grade: e.target.value } : x)))} />
            <input className="inp" style={{ width: 80, padding: "4px 8px", fontSize: 11 }} placeholder="Cert #" value={g.certNumber || ""}
              onChange={(e) => setGradings((p) => p.map((x) => (x.id === g.id ? { ...x, certNumber: e.target.value } : x)))} />
            <div className="flex-1" />
            <button className="btn btn-ghost btn-sm" style={{ padding: "4px 6px", color: "var(--red)" }} onClick={() => deleteGrading(g.id)}><IconX size={12} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}
