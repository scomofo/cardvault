import { useState, useEffect, useCallback, useRef } from "react";
import { IconShield, IconCheck, IconZap, Spinner } from "./Icons";
import { assignVaultStatus, calculateGrade, gradeToTerm, generateConditionReport } from "../lib/grading";

const SUBS = ["centering", "corners", "edges", "surface"];
const WEIGHTS_LABEL = { centering: "20%", corners: "30%", edges: "20%", surface: "30%" };

export default function GradingSlider({ onSave, onCancel, initialGrades }) {
  const [grades, setGrades] = useState(initialGrades || {
    centering: 10, corners: 10, edges: 10, surface: 10,
  });
  const [projection, setProjection] = useState(10);
  const [vault, setVault] = useState(assignVaultStatus(10));
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  const calculate = useCallback(() => {
    const vals = Object.values(grades);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const floor = Math.min(...vals);
    const result = Math.min(avg, floor + 1.0);
    const rounded = Math.floor(result * 2) / 2;
    setProjection(rounded);
    setVault(assignVaultStatus(rounded));
  }, [grades]);

  useEffect(() => { calculate(); }, [calculate]);

  const handleSlider = (key, val) => {
    setGrades((p) => ({ ...p, [key]: parseFloat(val) }));
  };

  // Voice-to-text
  const toggleListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript.toLowerCase();
      const newGrades = { ...grades };
      let found = false;
      SUBS.forEach((key) => {
        const match = text.match(new RegExp(`${key}\\s*(\\d+(\\.\\d+)?)`));
        if (match) {
          newGrades[key] = Math.min(10, Math.max(1, parseFloat(match[1])));
          found = true;
        }
      });
      if (found) setGrades(newGrades);
    };
    recognition.start();
  };

  const handleSave = () => {
    const calc = calculateGrade(grades);
    const report = generateConditionReport(grades);
    onSave({
      ...grades,
      projected_grade: projection,
      vault_status: vault.status,
      condition_report: report,
      calc,
    });
  };

  const hasSpeech = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

  // Slider track gradient based on value
  const sliderBg = (val) => {
    const pct = ((val - 1) / 9) * 100;
    return `linear-gradient(90deg, var(--acc-solid) ${pct}%, var(--s3) ${pct}%)`;
  };

  return (
    <div className="card-elevated slide-up">
      <div className="flex justify-between items-center mb-12">
        <h2 className="section-title" style={{ marginBottom: 0 }}>Card Assessment</h2>
        {hasSpeech && (
          <button
            className={`btn btn-sm ${isListening ? "btn-danger" : "btn-ghost"}`}
            onClick={toggleListening}
            style={isListening ? { animation: "pulse 1.5s infinite" } : {}}
          >
            {isListening ? "Stop" : "Voice"}
          </button>
        )}
      </div>

      {/* Sub-grade sliders */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {SUBS.map((key) => {
          const val = grades[key];
          const scoreColor = val >= 9.5 ? "var(--grn)" : val >= 8.5 ? "var(--acc-solid)" : val >= 7 ? "var(--orange)" : "var(--red)";
          return (
            <div key={key}>
              <div className="flex justify-between items-center mb-4">
                <div>
                  <span className="text-sm fw-600" style={{ textTransform: "capitalize" }}>{key}</span>
                  <span className="text-xxs text-dim" style={{ marginLeft: 8 }}>{WEIGHTS_LABEL[key]}</span>
                </div>
                <span className="fw-800" style={{ fontSize: 18, color: scoreColor }}>{val.toFixed(1)}</span>
              </div>
              <input
                type="range" min="1" max="10" step="0.5" value={val}
                onChange={(e) => handleSlider(key, e.target.value)}
                style={{
                  width: "100%", height: 6, borderRadius: 3, appearance: "none",
                  background: sliderBg(val), cursor: "pointer", outline: "none",
                }}
              />
              <div className="flex justify-between text-xxs text-dim mt-4">
                <span>1</span><span>5</span><span>10</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Result card with vault status */}
      <div className="mt-16" style={{
        padding: 18, borderRadius: "var(--radius-lg)", border: `2px solid ${vault.color}40`,
        background: `${vault.color}10`, transition: "all .3s ease",
      }}>
        <div className="flex justify-between items-center">
          <div>
            <div className="lbl" style={{ margin: 0, letterSpacing: 2 }}>Projected Grade</div>
            <div style={{ fontSize: 40, fontWeight: 900, color: vault.color, lineHeight: 1.1 }}>
              {projection.toFixed(1)}
            </div>
            <div className="text-xs text-dim mt-4">
              {gradeToTerm(projection).term}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="lbl" style={{ margin: 0, letterSpacing: 2 }}>Vault Pile</div>
            <div className="flex items-center gap-6 mt-4" style={{ justifyContent: "flex-end" }}>
              {vault.status === "GREEN" && <IconCheck size={20} style={{ color: vault.color }} />}
              {vault.status === "YELLOW" && <IconShield size={20} style={{ color: vault.color }} />}
              {vault.status === "RED" && <IconZap size={20} style={{ color: vault.color }} />}
              <span className="fw-800" style={{ fontSize: 18, color: vault.color }}>{vault.status}</span>
            </div>
            <div className="text-xs" style={{ color: vault.color, marginTop: 4 }}>{vault.label}</div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-8 mt-12">
        <button className="btn btn-primary btn-lg flex-1" onClick={handleSave}>
          Log to Vault
        </button>
        {onCancel && (
          <button className="btn btn-ghost btn-lg" onClick={onCancel}>Cancel</button>
        )}
      </div>

      {isListening && (
        <div className="text-center mt-8">
          <div className="flex items-center justify-center gap-6">
            <Spinner size={14} color="var(--red)" />
            <span className="text-xs text-red">Listening... try: "Centering 10, Surface 9"</span>
          </div>
        </div>
      )}
    </div>
  );
}
