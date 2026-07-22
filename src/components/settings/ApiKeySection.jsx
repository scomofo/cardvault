import { useState, useEffect } from "react";
import { useToast } from "../Toast";
import { apiPath } from "../../lib/apiBase";
import { IconZap, IconCheck, IconEye } from "../Icons";

export default
function ApiKeySection({ onStatusChange }) {
  const toast = useToast();
  const [keyInput, setKeyInput] = useState("");
  const [status, setStatus] = useState({ configured: false, masked: null });
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(apiPath("/ai/status")).then((r) => r.json()).then(setStatus).catch(() => {});
  }, []);

  const saveKey = async () => {
    if (!keyInput.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(apiPath("/ai/key"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: keyInput.trim() }),
      });
      const data = await r.json();
      if (r.ok) {
        setStatus(data);
        setKeyInput("");
        toast.success("API key saved");
        onStatusChange?.(data);
      } else {
        toast.error(data.error || "Failed to save key");
      }
    } catch {
      toast.error("Server not reachable");
    }
    setSaving(false);
  };

  return (
    <div className="card mb-12" style={{ borderColor: status.configured ? "var(--grn-brd)" : "var(--acc-brd)" }}>
      <div className="flex items-center gap-8 mb-8">
        <IconZap size={16} style={{ color: status.configured ? "var(--grn)" : "var(--acc-solid)" }} />
        <div className="lbl" style={{ margin: 0 }}>Anthropic API Key</div>
        {status.configured && <span className="badge badge-grn"><IconCheck size={10} /> Connected</span>}
      </div>

      {status.configured && (
        <div className="flex items-center gap-8 mb-8">
          <code className="text-xs text-dim" style={{ background: "var(--s3)", padding: "4px 10px", borderRadius: 6 }}>
            {status.masked}
          </code>
        </div>
      )}

      <div className="text-xxs text-dim mb-8">
        Required for AI card recognition, pricing, and grade prediction.
        Your key is stored server-side only and never sent to the browser.
      </div>

      <div className="flex gap-8">
        <div className="flex-1" style={{ position: "relative" }}>
          <input
            className="inp"
            type={showKey ? "text" : "password"}
            placeholder={status.configured ? "Enter new key to replace..." : "sk-ant-..."}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveKey()}
            autoComplete="off"
          />
          <button
            className="btn-icon"
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: "var(--dim)" }}
            onClick={() => setShowKey(!showKey)}
          >
            <IconEye size={14} />
          </button>
        </div>
        <button className="btn btn-primary btn-sm" onClick={saveKey} disabled={saving || !keyInput.trim()}>
          {saving ? "..." : "Save"}
        </button>
      </div>
    </div>
  );
}
