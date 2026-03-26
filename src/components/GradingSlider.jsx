import { useState, useEffect, useCallback, useRef } from "react";
import { IconShield, IconCheck, IconZap, IconRefresh, Spinner } from "./Icons";
import { assignVaultStatus, calculateGrade, gradeToTerm, generateConditionReport } from "../lib/grading";

const SUBS = ["centering", "corners", "edges", "surface"];
const WEIGHTS_LABEL = { centering: "20%", corners: "30%", edges: "20%", surface: "30%" };

export default function GradingSlider({ onSave, onCancel, initialGrades }) {
  const [grades, setGrades] = useState(initialGrades || {
    centering: 10, corners: 10, edges: 10, surface: 10,
  });
  const [projection, setProjection] = useState(10);
  const [vault, setVault] = useState(assignVaultStatus(10));
  const [cappingAttributes, setCappingAttributes] = useState([]);
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

    // Identify bottleneck attributes
    const caps = Object.keys(grades).filter((k) => grades[k] === floor && floor < avg);
    setCappingAttributes(caps);
  }, [grades]);

  useEffect(() => { calculate(); }, [calculate]);

  const handleSlider = (key, val) => {
    if (navigator.vibrate) navigator.vibrate(5);
    setGrades((p) => ({ ...p, [key]: parseFloat(val) }));
  };

  // Quick presets
  const applyPreset = (val) => {
    if (navigator.vibrate) navigator.vibrate(15);
    setGrades({ centering: val, corners: val, edges: val, surface: val });
  };

  // Voice-to-text with advanced parsing
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
      parseVoiceCommand(text);
    };
    recognition.start();
  };

  const parseVoiceCommand = (text) => {
    const newGrades = { ...grades };
    let found = false;

    SUBS.forEach((key) => {
      // Advanced: handles "centering 9", "corners nine five" (9.5), "edges 8 point 5"
      const match = text.match(new RegExp(`${key}\\s*(\\d+)?\\s*(point|dot|\\s)?\\s*(\\d+)?`));
      if (match) {
        let val = 10;
        const whole = match[1];
        const decimal = match[3];
        if (whole) {
          val = parseFloat(whole);
          if (decimal) val += parseFloat(`0.${decimal}`);
          else if (text.includes(`${key} ${whole} 5`)) val += 0.5;
        }
        newGrades[key] = Math.min(10, Math.max(1, val));
        found = true;
      }
    });

    if (found) {
      if (navigator.vibrate) navigator.vibrate([20, 10, 20]);
      setGrades(newGrades);
    }
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

  const sliderBg = (val, isCapping) => {
    const pct = ((val - 1) / 9) * 100;
    const color = isCapping ? "var(--red)" : "var(--acc-solid)";
    return `linear-gradient(90deg, ${color} ${pct}%, var(--s3) ${pct}%)`;
  };

  return (
    <div className="card-elevated slide-up">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-.3px" }}>Grading Lab</h2>
          <div className="lbl" style={{ margin: 0 }}>Sub-Grade Assessment</div>
        </div>
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

      {/* Quick Presets */}
      <div className="flex gap-6 mb-16">
        <button className="btn btn-primary btn-sm flex-1" onClick={() => applyPreset(10)}>
          <IconZap size={12} /> GEM 10
        </button>
        <button className="btn btn-outline btn-sm flex-1" onClick={() => applyPreset(9)}>
          MINT 9
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => applyPreset(10)}>
          <IconRefresh size={12} />
        </button>
      </div>

      {/* Sub-grade sliders */}
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {SUBS.map((key) => {
          const val = grades[key];
          const isCapping = cappingAttributes.includes(key);
          const scoreColor = isCapping ? "var(--red)"
            : val >= 9.5 ? "var(--grn)" : val >= 8.5 ? "var(--acc-solid)" : val >= 7 ? "var(--orange)" : "var(--red)";

          return (
            <div key={key} style={{ position: "relative" }}>
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-6">
                  <span className="fw-700" style={{
                    fontSize: 13, textTransform: "uppercase", letterSpacing: "-.3px",
                    color: isCapping ? "var(--red)" : "var(--tx)",
                  }}>
                    {key}
                  </span>
                  {isCapping && <span style={{ fontSize: 12 }}>&#9888;&#65039;</span>}
                  <span className="text-xxs text-dim">{WEIGHTS_LABEL[key]}</span>
                </div>
                <span className="fw-800" style={{ fontSize: 20, color: scoreColor }}>
                  {val % 1 === 0 ? val : val.toFixed(1)}
                </span>
              </div>
              <input
                type="range" min="1" max="10" step="0.5" value={val}
                onChange={(e) => handleSlider(key, e.target.value)}
                style={{
                  width: "100%", height: 8, borderRadius: 4, appearance: "none",
                  background: sliderBg(val, isCapping), cursor: "pointer", outline: "none",
                }}
              />
              <div className="flex justify-between text-xxs text-dim mt-4">
                <span>1</span><span>5</span><span>10</span>
              </div>
              {isCapping && (
                <div style={{
                  fontSize: 10, fontWeight: 700, color: "var(--red)", marginTop: 4,
                  letterSpacing: ".5px", textTransform: "uppercase",
                }}>
                  Low score limiting final grade
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Result panel */}
      <div style={{
        marginTop: 28, padding: 20, borderRadius: "var(--radius-lg)",
        border: `2px solid ${vault.color}35`,
        background: `${vault.color}08`,
        boxShadow: `0 0 20px ${vault.color}10`,
        transition: "all .4s ease",
      }}>
        <div className="flex justify-between items-center">
          <div>
            <div className="lbl" style={{ margin: 0, letterSpacing: 3, fontSize: 9 }}>Projected Grade</div>
            <div style={{
              fontSize: 48, fontWeight: 900, color: vault.color, lineHeight: 1.1,
              fontStyle: "italic", letterSpacing: "-2px",
            }}>
              {projection % 1 === 0 ? projection : projection.toFixed(1)}
            </div>
            <div className="text-xs text-dim mt-4">{gradeToTerm(projection).term}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "5px 14px", borderRadius: 20, fontWeight: 800, fontSize: 12,
              background: vault.status === "GREEN" ? "var(--grn)" : vault.status === "YELLOW" ? "var(--orange)" : "var(--red)",
              color: "#0f1117",
            }}>
              {vault.status === "GREEN" && <IconCheck size={13} />}
              {vault.status === "YELLOW" && <IconShield size={13} />}
              {vault.status === "RED" && <IconZap size={13} />}
              {vault.status} PILE
            </div>
            <div className="text-xxs fw-700 mt-6" style={{ color: vault.color }}>{vault.label}</div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-8 mt-12">
        <button className="btn btn-primary btn-lg flex-1 fw-800" style={{ letterSpacing: ".5px" }} onClick={handleSave}>
          CONFIRM & LOG
        </button>
        {onCancel && (
          <button className="btn btn-ghost btn-lg" onClick={onCancel}>Cancel</button>
        )}
      </div>

      {isListening && (
        <div className="flex items-center justify-center gap-6 mt-10">
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--red)", animation: "pulse 1s infinite" }} />
          <span className="text-xs fw-700 text-red" style={{ letterSpacing: 1, textTransform: "uppercase" }}>
            Listening for sub-grades...
          </span>
        </div>
      )}
    </div>
  );
}
