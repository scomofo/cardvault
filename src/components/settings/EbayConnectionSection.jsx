import { useState, useEffect } from "react";
import { useToast } from "../Toast";
import { apiPath } from "../../lib/apiBase";
import { IconBarChart, IconCheck, IconPlus, IconUpload, Spinner } from "../Icons";

export default
function EbayConnectionSection({ onStatusChange }) {
  const toast = useToast();
  const [status, setStatus] = useState({ configured: false, connected: false, sandbox: true });
  const [creds, setCreds] = useState({ appId: "", certId: "", devId: "", ruName: "", sandbox: true });
  const [showSetup, setShowSetup] = useState(false);
  const [saving, setSaving] = useState(false);
  const callbackUrl = `${window.location.origin}/api/ebay/callback`;

  useEffect(() => {
    fetch(apiPath("/ebay/status")).then((r) => r.json()).then(setStatus).catch(() => {});
  }, []);

  const saveCreds = async () => {
    if (!creds.appId || !creds.certId || !creds.ruName) { toast.error("App ID, Cert ID, and RuName are required"); return; }
    setSaving(true);
    try {
      const r = await fetch(apiPath("/ebay/credentials"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId: creds.appId, certId: creds.certId, devId: creds.devId, ruName: creds.ruName,
          sandbox: creds.sandbox, callbackUrl,
        }),
      });
      if (r.ok) {
        setStatus((p) => ({ ...p, configured: true, sandbox: creds.sandbox }));
        setShowSetup(false);
        toast.success("eBay credentials saved");
        onStatusChange?.();
      } else toast.error("Failed to save credentials");
    } catch { toast.error("Server not reachable"); }
    setSaving(false);
  };

  const authorize = () => { window.location.href = apiPath("/ebay/auth"); };

  const disconnect = async () => {
    if (!window.confirm("Disconnect eBay?")) return;
    await fetch(apiPath("/ebay/disconnect"), { method: "POST" }).catch(() => {});
    setStatus({ configured: true, connected: false, sandbox: status.sandbox });
    toast.info("eBay disconnected");
    onStatusChange?.();
  };

  const copyCallback = async () => {
    try {
      await navigator.clipboard.writeText(callbackUrl);
      toast.success("Callback URL copied");
    } catch {
      toast.error("Could not copy — select the URL manually");
    }
  };

  return (
    <div className="card mb-12" style={{ borderColor: status.connected ? "var(--grn-brd)" : status.configured ? "var(--acc-brd)" : undefined }}>
      <div className="flex items-center gap-8 mb-8">
        <IconBarChart size={16} style={{ color: status.connected ? "var(--grn)" : "var(--acc-solid)" }} />
        <div className="lbl" style={{ margin: 0 }}>eBay Connection</div>
        {status.connected && <span className="badge badge-grn"><IconCheck size={10} /> Connected</span>}
        {status.sandbox && <span className="badge badge-dim">Sandbox</span>}
      </div>

      {status.connected ? (
        <div>
          <div className="text-xs text-dim mb-8">eBay authorized. Listings will publish directly.</div>
          <div className="flex gap-8">
            <button className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }} onClick={disconnect}>Disconnect</button>
          </div>
        </div>
      ) : status.configured ? (
        <div>
          <div className="text-xs text-dim mb-8">Credentials saved. Authorize to connect.</div>
          <button className="btn btn-primary btn-sm" onClick={authorize}>Authorize with eBay</button>
        </div>
      ) : (
        <div>
          <div className="text-xs text-dim mb-8">
            Connect your eBay developer account to publish listings directly.
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => setShowSetup(!showSetup)}>
            <IconPlus size={12} /> Set Up eBay
          </button>
        </div>
      )}

      <div className="mt-10" style={{ padding: 8, background: "var(--s1)", borderRadius: "var(--radius)", border: "1px dashed var(--brd)" }}>
        <div className="text-xxs text-dim">Accept URL to register in your eBay developer portal</div>
        <div className="flex items-center gap-8 mt-4">
          <code style={{ flex: 1, fontSize: 11, wordBreak: "break-all" }}>{callbackUrl}</code>
          <button className="btn btn-ghost btn-sm" onClick={copyCallback} title="Copy to clipboard">
            <IconUpload size={12} /> Copy
          </button>
        </div>
      </div>

      {showSetup && (
        <div className="fade mt-10" style={{ padding: 12, background: "var(--acc-bg)", borderRadius: "var(--radius)", border: "1px solid var(--acc-brd)" }}>
          <div className="text-xxs text-dim mb-8">Register at developer.ebay.com, create an app, copy your RuName from User Tokens, and configure the accept URL there to match the callback shown below.</div>
          <div className="form-grid mt-4">
            <label className="fld">
              <span className="text-xxs text-dim">App ID (Client ID)</span>
              <input className="inp" value={creds.appId} onChange={(e) => setCreds((p) => ({ ...p, appId: e.target.value }))} placeholder="Your-App-ID" />
            </label>
            <label className="fld">
              <span className="text-xxs text-dim">Cert ID (Client Secret)</span>
              <input className="inp" type="password" value={creds.certId} onChange={(e) => setCreds((p) => ({ ...p, certId: e.target.value }))} placeholder="Your-Cert-ID" />
            </label>
            <label className="fld">
              <span className="text-xxs text-dim">Dev ID (optional)</span>
              <input className="inp" value={creds.devId} onChange={(e) => setCreds((p) => ({ ...p, devId: e.target.value }))} placeholder="Your-Dev-ID" />
            </label>
            <label className="fld">
              <span className="text-xxs text-dim">RuName (redirect_uri)</span>
              <input className="inp" value={creds.ruName} onChange={(e) => setCreds((p) => ({ ...p, ruName: e.target.value }))} placeholder="Your-eBay-RuName" />
            </label>
          </div>
          <div className="text-xxs text-dim mt-8">Callback URL to configure in eBay: <code>{callbackUrl}</code></div>
          <label className="flex items-center gap-8 mt-8" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={creds.sandbox} onChange={(e) => setCreds((p) => ({ ...p, sandbox: e.target.checked }))} />
            <span className="text-xs">Sandbox mode (test environment)</span>
          </label>
          <div className="flex gap-8 mt-8">
            <button className="btn btn-primary btn-sm" onClick={saveCreds} disabled={saving}>
              {saving ? <Spinner size={12} /> : <IconCheck size={12} />} Save Credentials
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowSetup(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
