import { useState, useEffect } from "react";
import { useToast } from "../Toast";
import { automationAPI, shippingProvidersAPI } from "../../lib/api";
import { IconZap, IconPlus, IconCheck, IconDownload, Spinner } from "../Icons";

const CANADA_POST_ENDPOINTS = {
  sandbox: "https://ct.soa-gw.canadapost.ca",
  production: "https://soa-gw.canadapost.ca",
};
const CANADA_POST_LABEL_URL_TEMPLATE = "labels/canada-post/{trackingNumber}/{shipmentId}.pdf";

const DEFAULT_SHIPPING_PROVIDER = {
  provider: "Canada Post",
  apiKey: "",
  metadata: {
    accountLabel: "",
    providerClient: "canada_post",
    environment: "sandbox",
    apiBaseUrl: CANADA_POST_ENDPOINTS.sandbox,
    labelPurchaseMode: "proxy",
    labelPurchaseUrl: "",
    labelUrlTemplate: CANADA_POST_LABEL_URL_TEMPLATE,
    customerNumber: "",
    contractId: "",
    originPostalCode: "",
    shipFrom: {
      name: "",
      addressLine1: "",
      city: "",
      province: "",
      postalCode: "",
    },
    packageDimensionsCm: { length: 16, width: 11, height: 1 },
    apiKeyHeader: "Authorization",
    apiKeyPrefix: "Basic ",
    labelPurchaseTimeoutMs: 10000,
    rates: [{
      service: "Canada Post Expedited Parcel",
      serviceCode: "DOM.EP",
      countries: ["CA"],
      cost: 9.75,
      tracking: true,
    }],
  },
};

function cloneDefaultShippingProvider() {
  return {
    ...DEFAULT_SHIPPING_PROVIDER,
    metadata: {
      ...DEFAULT_SHIPPING_PROVIDER.metadata,
      shipFrom: { ...DEFAULT_SHIPPING_PROVIDER.metadata.shipFrom },
      packageDimensionsCm: { ...DEFAULT_SHIPPING_PROVIDER.metadata.packageDimensionsCm },
      rates: DEFAULT_SHIPPING_PROVIDER.metadata.rates.map((rate) => ({ ...rate, countries: [...rate.countries] })),
    },
  };
}

function splitManifestGroupIds(value) {
  return String(value || "").split(/[\s,]+/).map((entry) => entry.trim()).filter(Boolean);
}

function canadaPostManifestFilename(run) {
  const safeId = String(run?.poNumbers?.[0] || run?.id || "manifest").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "manifest";
  return `canada-post-manifest-${safeId}.pdf`;
}

export default
function ShippingProviderConnectionsSection({ onStatusChange }) {
  const toast = useToast();
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newConn, setNewConn] = useState(cloneDefaultShippingProvider);
  const [countriesText, setCountriesText] = useState("CA");
  const [manifestGroupText, setManifestGroupText] = useState("");
  const [manifestRuns, setManifestRuns] = useState([]);
  const [canadaPostValidation, setCanadaPostValidation] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [validatingCanadaPost, setValidatingCanadaPost] = useState(false);
  const [transmittingManifest, setTransmittingManifest] = useState(false);
  const rate = newConn.metadata.rates[0];
  const isCanadaPostProvider = newConn.provider.trim().toLowerCase() === "canada post";
  const canadaPostConnections = connections.filter((conn) => String(conn.provider || "").trim().toLowerCase() === "canada post");
  const primaryCanadaPostConnection = canadaPostConnections[0] || null;

  useEffect(() => {
    Promise.all([
      shippingProvidersAPI.connections().catch(() => []),
      automationAPI.canadaPostManifests().catch(() => []),
    ])
      .then(([rows, manifests]) => {
        setConnections(Array.isArray(rows) ? rows : []);
        setManifestRuns(Array.isArray(manifests) ? manifests : []);
      })
      .catch(() => {
        setConnections([]);
        setManifestRuns([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const updateRate = (updates) => {
    setNewConn((current) => ({
      ...current,
      metadata: {
        ...current.metadata,
        rates: [{ ...current.metadata.rates[0], ...updates }],
      },
    }));
  };

  const updateMetadata = (updates) => {
    setNewConn((current) => ({
      ...current,
      metadata: { ...current.metadata, ...updates },
    }));
  };

  const updatePackageDimensions = (updates) => {
    setNewConn((current) => ({
      ...current,
      metadata: {
        ...current.metadata,
        packageDimensionsCm: { ...(current.metadata.packageDimensionsCm || {}), ...updates },
      },
    }));
  };

  const updateShipFrom = (updates) => {
    setNewConn((current) => ({
      ...current,
      metadata: {
        ...current.metadata,
        shipFrom: { ...(current.metadata.shipFrom || {}), ...updates },
      },
    }));
  };

  const updateCanadaPostEnvironment = (environment) => {
    updateMetadata({
      providerClient: "canada_post",
      environment,
      apiBaseUrl: CANADA_POST_ENDPOINTS[environment] || CANADA_POST_ENDPOINTS.sandbox,
      apiKeyHeader: "Authorization",
      apiKeyPrefix: "Basic ",
      labelUrlTemplate: CANADA_POST_LABEL_URL_TEMPLATE,
    });
  };

  const saveConnection = async () => {
    if (!newConn.provider.trim()) { toast.error("Provider required"); return; }
    setSaving(true);
    try {
      const result = await shippingProvidersAPI.connect(newConn);
      setConnections((current) => [result, ...current]);
      setNewConn(cloneDefaultShippingProvider());
      setCountriesText("CA");
      setShowAdd(false);
      toast.success("Shipping provider saved");
      onStatusChange?.();
    } catch (error) {
      toast.error(error.message || "Failed to save shipping provider");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async (conn) => {
    setTestingId(conn.id);
    try {
      const result = await shippingProvidersAPI.test(conn.id, { country: "CA", salePrice: 100, weightOz: 3 });
      setConnections((current) => current.map((entry) => (
        entry.id === conn.id ? { ...entry, authStatus: result.authStatus || "connected" } : entry
      )));
      const endpointStatus = result.endpointValidation?.attempted ? " and label endpoint dry-run validated" : "";
      toast.success(`Shipping provider ready: ${result.serviceCount} service${result.serviceCount === 1 ? "" : "s"}${endpointStatus}`);
    } catch (error) {
      toast.error(error.message || "Shipping provider test failed");
    } finally {
      setTestingId(null);
    }
  };

  const downloadManifestArtifact = async (run, artifact) => {
    try {
      const response = await fetch(automationAPI.canadaPostManifestArtifactUrl(run.id, artifact.id));
      if (!response.ok) throw new Error(`download failed (${response.status})`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = canadaPostManifestFilename(run);
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      toast.error(error.message || "Manifest download failed");
    }
  };

  const transmitManifest = async () => {
    const groupIds = splitManifestGroupIds(manifestGroupText);
    if (groupIds.length === 0) { toast.error("Group IDs required"); return; }
    if (!primaryCanadaPostConnection) { toast.error("Canada Post provider required"); return; }

    setTransmittingManifest(true);
    try {
      await automationAPI.transmitCanadaPostManifest({
        connectionId: primaryCanadaPostConnection.id,
        groupIds,
      });
      const manifests = await automationAPI.canadaPostManifests().catch(() => []);
      setManifestRuns(Array.isArray(manifests) ? manifests : []);
      setManifestGroupText("");
      toast.success("Canada Post manifest ready");
    } catch (error) {
      toast.error(error.message || "Manifest transmit failed");
    } finally {
      setTransmittingManifest(false);
    }
  };

  const validateCanadaPost = async () => {
    if (!primaryCanadaPostConnection) { toast.error("Canada Post provider required"); return; }

    setValidatingCanadaPost(true);
    try {
      const result = await automationAPI.validateCanadaPost({
        connectionId: primaryCanadaPostConnection.id,
        groupIds: splitManifestGroupIds(manifestGroupText),
      });
      setCanadaPostValidation(result);
      if (result.ok) {
        toast.success("Canada Post validation ready");
      } else {
        toast.error("Canada Post validation needs attention");
      }
    } catch (error) {
      toast.error(error.message || "Canada Post validation failed");
    } finally {
      setValidatingCanadaPost(false);
    }
  };

  return (
    <div className="card mb-12">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-8">
          <IconZap size={16} style={{ color: "var(--acc)" }} />
          <div className="lbl" style={{ margin: 0 }}>Shipping Providers</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(!showAdd)}>
          <IconPlus size={12} /> Add
        </button>
      </div>

      {loading ? (
        <div className="text-xs text-dim">Loading...</div>
      ) : connections.length === 0 ? (
        <div className="text-xs text-dim">No shipping provider configured yet. CardVault will use the offline fallback.</div>
      ) : (
        connections.map((conn) => (
          <div key={conn.id} className="flex justify-between items-center mt-6" style={{ padding: "8px 12px", background: "var(--s3)", borderRadius: "var(--radius)" }}>
            <div>
              <span className="text-xs fw-700">{conn.provider}</span>
              {conn.metadata?.accountLabel && <span className="text-xxs text-dim ml-8">{conn.metadata.accountLabel}</span>}
              {conn.hasApiKey && <span className="badge badge-dim ml-8">Key saved</span>}
            </div>
            <div className="flex items-center gap-8">
              <span className={`badge ${conn.authStatus === "connected" ? "badge-grn" : "badge-dim"}`}>
                <IconCheck size={10} /> {conn.authStatus || "configured"}
              </span>
              <button className="btn btn-outline btn-sm" onClick={() => testConnection(conn)} disabled={testingId === conn.id}>
                {testingId === conn.id ? <Spinner size={12} /> : <IconCheck size={12} />} Test
              </button>
            </div>
          </div>
        ))
      )}

      {canadaPostConnections.length > 0 && (
        <div className="mt-10" style={{ paddingTop: 10, borderTop: "1px solid var(--brd)" }}>
          <div className="flex items-center justify-between gap-8 mb-8">
            <div className="lbl" style={{ margin: 0 }}>Canada Post Manifests</div>
            <span className="badge badge-dim">{manifestRuns.length}</span>
          </div>
          <div className="flex items-end gap-8 flex-wrap">
            <label className="fld" style={{ flex: "1 1 260px" }}>
              <span className="text-xxs text-dim">Group IDs</span>
              <input
                className="inp"
                value={manifestGroupText}
                onChange={(e) => setManifestGroupText(e.target.value)}
                placeholder="cv-2026-06-12"
              />
            </label>
            <button className="btn btn-primary btn-sm" onClick={transmitManifest} disabled={transmittingManifest}>
              {transmittingManifest ? <Spinner size={12} /> : <IconZap size={12} />} Transmit Manifest
            </button>
            <button className="btn btn-outline btn-sm" onClick={validateCanadaPost} disabled={validatingCanadaPost}>
              {validatingCanadaPost ? <Spinner size={12} /> : <IconCheck size={12} />} Validate Setup
            </button>
          </div>
          {canadaPostValidation && (
            <div className="mt-8" style={{ padding: "8px 10px", background: "var(--s3)", borderRadius: "var(--radius)" }}>
              <div className="flex items-center justify-between gap-8">
                <div className="lbl" style={{ margin: 0 }}>Canada Post Validation</div>
                <span className={`badge ${canadaPostValidation.ok ? "badge-grn" : "badge-acc"}`}>
                  <IconCheck size={10} /> {canadaPostValidation.ok ? "ready" : "review"}
                </span>
              </div>
              <div className="text-xxs text-dim mt-4">
                {canadaPostValidation.selectedService || "No matching service"} - {canadaPostValidation.environment || "sandbox"}
              </div>
              {(canadaPostValidation.checks || []).map((check) => (
                <div key={check.id} className="flex items-center justify-between gap-8 mt-6">
                  <div className="min-w-0">
                    <div className="text-xs fw-700">{check.label}</div>
                    <div className="text-xxs text-dim truncate">{check.message}</div>
                  </div>
                  <span className={`badge ${check.ok ? "badge-grn" : "badge-acc"}`}>
                    {check.ok ? "OK" : "Check"}
                  </span>
                </div>
              ))}
            </div>
          )}
          {manifestRuns.length > 0 && (
            <div className="mt-8">
              {manifestRuns.slice(0, 5).map((run) => (
                <div key={run.id} className="flex items-center justify-between gap-8 mt-6" style={{ padding: "8px 10px", background: "var(--s3)", borderRadius: "var(--radius)" }}>
                  <div className="min-w-0">
                    <div className="text-xs fw-700 truncate">{run.poNumbers?.[0] || run.groupIds?.join(", ") || run.id}</div>
                    <div className="text-xxs text-dim truncate">{run.status} - {run.createdAt || ""}</div>
                  </div>
                  <div className="flex items-center gap-6">
                    {(run.artifacts || []).map((artifact) => (
                      <button key={artifact.id} className="btn btn-outline btn-sm" type="button" onClick={() => downloadManifestArtifact(run, artifact)}>
                        <IconDownload size={12} /> PDF
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <div className="fade mt-10" style={{ padding: 12, background: "var(--acc-bg)", borderRadius: "var(--radius)", border: "1px solid var(--acc-brd)" }}>
          <div className="text-xxs text-dim mb-8">
            Saves provider credentials server-side and uses configured rates for Auto-Ship. Keys are never returned to the browser after save.
          </div>
          <div className="form-grid mt-4">
            <label className="fld">
              <span className="text-xxs text-dim">Provider</span>
              <input className="inp" value={newConn.provider} onChange={(e) => setNewConn((p) => ({ ...p, provider: e.target.value }))} placeholder="Canada Post" />
            </label>
            {isCanadaPostProvider && (
              <label className="fld">
                <span className="text-xxs text-dim">Environment</span>
                <select className="inp" value={newConn.metadata.environment || "sandbox"} onChange={(e) => updateCanadaPostEnvironment(e.target.value)}>
                  <option value="sandbox">Canada Post Sandbox</option>
                  <option value="production">Canada Post Production</option>
                </select>
              </label>
            )}
            {isCanadaPostProvider && (
              <label className="fld">
                <span className="text-xxs text-dim">Purchase Mode</span>
                <select className="inp" value={newConn.metadata.labelPurchaseMode || "proxy"} onChange={(e) => updateMetadata({ labelPurchaseMode: e.target.value })}>
                  <option value="proxy">Certified Proxy Endpoint</option>
                  <option value="native">Native Canada Post</option>
                </select>
              </label>
            )}
            <label className="fld">
              <span className="text-xxs text-dim">Account Label</span>
              <input className="inp" value={newConn.metadata.accountLabel} onChange={(e) => setNewConn((p) => ({ ...p, metadata: { ...p.metadata, accountLabel: e.target.value } }))} placeholder="Main shipping account" />
            </label>
            {isCanadaPostProvider && (
              <>
                <label className="fld">
                  <span className="text-xxs text-dim">Customer Number</span>
                  <input className="inp" value={newConn.metadata.customerNumber} onChange={(e) => updateMetadata({ customerNumber: e.target.value })} placeholder="Canada Post customer #" />
                </label>
                <label className="fld">
                  <span className="text-xxs text-dim">Contract ID</span>
                  <input className="inp" value={newConn.metadata.contractId} onChange={(e) => updateMetadata({ contractId: e.target.value })} placeholder="Contract ID" />
                </label>
                <label className="fld">
                  <span className="text-xxs text-dim">Origin Postal</span>
                  <input className="inp" value={newConn.metadata.originPostalCode} onChange={(e) => updateMetadata({ originPostalCode: e.target.value })} placeholder="T2P 1J9" />
                </label>
                <label className="fld">
                  <span className="text-xxs text-dim">Origin Address</span>
                  <input className="inp" value={newConn.metadata.shipFrom?.addressLine1 || ""} onChange={(e) => updateShipFrom({ addressLine1: e.target.value })} placeholder="Street address" />
                </label>
                <label className="fld">
                  <span className="text-xxs text-dim">Origin City</span>
                  <input className="inp" value={newConn.metadata.shipFrom?.city || ""} onChange={(e) => updateShipFrom({ city: e.target.value })} placeholder="Calgary" />
                </label>
                <label className="fld">
                  <span className="text-xxs text-dim">Origin Province</span>
                  <input className="inp" value={newConn.metadata.shipFrom?.province || ""} onChange={(e) => updateShipFrom({ province: e.target.value })} placeholder="AB" />
                </label>
                <label className="fld">
                  <span className="text-xxs text-dim">Package L/W/H</span>
                  <div className="flex gap-6">
                    <input className="inp" type="number" min="0.1" step="0.1" value={newConn.metadata.packageDimensionsCm?.length ?? ""} onChange={(e) => updatePackageDimensions({ length: e.target.value === "" ? "" : Number(e.target.value) })} placeholder="L cm" />
                    <input className="inp" type="number" min="0.1" step="0.1" value={newConn.metadata.packageDimensionsCm?.width ?? ""} onChange={(e) => updatePackageDimensions({ width: e.target.value === "" ? "" : Number(e.target.value) })} placeholder="W cm" />
                    <input className="inp" type="number" min="0.1" step="0.1" value={newConn.metadata.packageDimensionsCm?.height ?? ""} onChange={(e) => updatePackageDimensions({ height: e.target.value === "" ? "" : Number(e.target.value) })} placeholder="H cm" />
                  </div>
                </label>
              </>
            )}
            <label className="fld">
              <span className="text-xxs text-dim">API Key</span>
              <input className="inp" type="password" value={newConn.apiKey} onChange={(e) => setNewConn((p) => ({ ...p, apiKey: e.target.value }))} placeholder="Provider key" autoComplete="off" />
            </label>
            <label className="fld">
              <span className="text-xxs text-dim">Label Endpoint</span>
              <input className="inp" value={newConn.metadata.labelPurchaseUrl} onChange={(e) => updateMetadata({ labelPurchaseUrl: e.target.value })} placeholder="https://provider.example/labels" />
            </label>
            <label className="fld">
              <span className="text-xxs text-dim">Auth Header</span>
              <input className="inp" value={newConn.metadata.apiKeyHeader} onChange={(e) => updateMetadata({ apiKeyHeader: e.target.value })} placeholder="Authorization" />
            </label>
            <label className="fld">
              <span className="text-xxs text-dim">Auth Prefix</span>
              <input className="inp" value={newConn.metadata.apiKeyPrefix} onChange={(e) => updateMetadata({ apiKeyPrefix: e.target.value })} placeholder="Bearer " />
            </label>
            <label className="fld">
              <span className="text-xxs text-dim">Timeout (ms)</span>
              <input className="inp" type="number" min="1" step="100" value={newConn.metadata.labelPurchaseTimeoutMs} onChange={(e) => updateMetadata({ labelPurchaseTimeoutMs: e.target.value === "" ? "" : Number(e.target.value) })} />
            </label>
            <label className="fld">
              <span className="text-xxs text-dim">Service</span>
              <input className="inp" value={rate.service} onChange={(e) => updateRate({ service: e.target.value })} placeholder="Canada Post Expedited Parcel" />
            </label>
            <label className="fld">
              <span className="text-xxs text-dim">Service Code</span>
              <input className="inp" value={rate.serviceCode} onChange={(e) => updateRate({ serviceCode: e.target.value })} placeholder="DOM.EP" />
            </label>
            <label className="fld">
              <span className="text-xxs text-dim">Countries</span>
              <input
                className="inp"
                value={countriesText}
                onChange={(e) => {
                  const val = e.target.value;
                  setCountriesText(val);
                  updateRate({ countries: val.split(",").map((entry) => entry.trim()).filter(Boolean) });
                }}
                placeholder="CA, US"
              />
            </label>
            <label className="fld">
              <span className="text-xxs text-dim">Cost</span>
              <input className="inp" type="number" step="0.01" min="0" value={rate.cost} onChange={(e) => updateRate({ cost: Number(e.target.value) || 0 })} />
            </label>
            <label className="flex items-center gap-8 mt-8" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={rate.tracking} onChange={(e) => updateRate({ tracking: e.target.checked })} />
              <span className="text-xs">Includes tracking</span>
            </label>
          </div>
          <div className="flex gap-8 mt-8">
            <button className="btn btn-primary btn-sm" onClick={saveConnection} disabled={saving}>
              {saving ? <Spinner size={12} /> : <IconCheck size={12} />} Save Provider
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
