from pathlib import Path

def replace(path, old, new, first=False):
    file = Path(path)
    source = file.read_text()
    assert (source.count(old) >= 1 if first else source.count(old) == 1), (path, old)
    file.write_text(source.replace(old, new, 1))

replace('src/server/database.js', 'let db = null;', 'import { createPublishBatchTables } from "./services/batchPublish/schema.js";\n\nlet db = null;')
replace('src/server/database.js', '  createTables(db);', '  createTables(db);\n  createPublishBatchTables(db);')
p = Path('src/server/routes/index.js')
p.write_text('import { registerBatchPublishRoutes } from "./batchPublish.routes.js";\n' + p.read_text())
replace('src/server/routes/index.js', '  registerBatchDraftRoutes(app);', '  registerBatchDraftRoutes(app);\n  registerBatchPublishRoutes(app);')
replace('src/server/integrations/ebay/ebayClient.js', 'tradingApiCall(callName, xmlBody)', 'tradingApiCall(callName, xmlBody, options = {})')
replace('src/server/integrations/ebay/ebayClient.js', '  const res = await fetch(url, {', '  options.beforeSend?.();\n  const res = await fetch(url, {', True)
replace('src/server/integrations/ebay/ebayClient.js', '"X-EBAY-API-COMPATIBILITY-LEVEL": "1155",', '"X-EBAY-API-COMPATIBILITY-LEVEL": options.compatibilityLevel || "1155",', True)
replace('src/server/integrations/ebay/ebayClient.js', '    throw new Error("eBay " + callName + " failed: " + errMsg);', '    const error = new Error("eBay " + callName + " failed: " + errMsg);\n    error.code = "EBAY_REJECTED";\n    throw error;')
replace('src/server/integrations/ebay/ebayClient.js', '  return text;\n}', '  if (!["Success", "Warning"].includes(ack)) throw new Error("eBay returned an unrecognized acknowledgement; outcome needs review");\n  return text;\n}', True)
replace('src/server/integrations/ebay/ebayClient.js', '  if (!itemId) throw', '  if (!itemId || /^0+$/.test(itemId)) throw')
replace('src/server/integrations/ebay/ebayClient.js', 'addFixedPriceItem(itemXml) {\n  const res = await tradingApiCall("AddFixedPriceItem", itemXml);', 'addFixedPriceItem(itemXml, options = {}) {\n  const res = await tradingApiCall("AddFixedPriceItem", itemXml, options);')
p = Path('src/server/integrations/marketplaces/ebayAdapter.js')
p.write_text('import { REVIEWED_DEFINITION } from "../../services/batchPublish/reviewedDefinition.js";\n' + p.read_text())
replace(str(p), '  async publish(listing) {', '  async publish(listing, options = {}) {')
replace(str(p), '    if (!this.isConnected()) return super.publish(listing);', '''    const reviewed = options[REVIEWED_DEFINITION];
    if (reviewed) {
      if (!this.isConnected()) { const error = new Error("eBay disconnected; approved listing was not sent"); error.notSent = true; throw error; }
      const externalListingId = await addFixedPriceItem(reviewed.itemXml, { beforeSend: reviewed.beforeSend, compatibilityLevel: "1475" });
      return { marketplace: this.marketplace, externalListingId, status: "active", payload: { reviewed: true }, syncedAt: new Date().toISOString() };
    }
    if (!this.isConnected()) return super.publish(listing);''')
replace('src/server/services/marketplaces/publishService.js', '''      const message = `${error.message}. Check eBay before retrying; the publish outcome may be unknown.`;
      const channelId = upsertChannel({ listingId, marketplace, status: "publish_unknown", publishError: message, payload: {} });
      addChannelEvent(channelId, "publish", "publish_unknown", { error: message });
      run(`UPDATE listings SET publish_status = 'publish_unknown', publish_error = ? WHERE id = ?`, [message, listingId]);''', '''      const status = error.notSent ? "draft" : error.code === "EBAY_REJECTED" ? "rejected" : "publish_unknown";
      const message = status === "publish_unknown" ? `${error.message}. Check eBay before retrying; the publish outcome may be unknown.` : error.message;
      const channelId = upsertChannel({ listingId, marketplace, status, publishError: message, payload: {} });
      addChannelEvent(channelId, "publish", status, { error: message });
      run(`UPDATE listings SET publish_status = ?, publish_error = ? WHERE id = ?`, [status, message, listingId]);''')
p = Path('src/lib/api.js')
p.write_text(p.read_text() + '''
// Bounded individual operations; all batch progress is persisted server-side.
export const batchPublishAPI = {
  policies: () => request("/publish-batches/policies", { timeoutMs: 90000 }),
  recent: () => request("/publish-batches"),
  get: (id) => request(`/publish-batches/${id}`),
  create: (data) => request("/publish-batches", { method: "POST", body: data }),
  check: (id, row) => request(`/publish-batches/${id}/check/${row}`, { method: "POST", body: {}, timeoutMs: 180000 }),
  approve: (id, data) => request(`/publish-batches/${id}/approve`, { method: "POST", body: data, timeoutMs: 90000 }),
  next: (id) => request(`/publish-batches/${id}/process-next`, { method: "POST", body: {}, timeoutMs: 90000 }),
  cancel: (id) => request(`/publish-batches/${id}/cancel`, { method: "POST", body: {} }),
};
''')
replace('src/components/BatchSellView.jsx', 'import BatchCaptureMode', 'import BatchPublishPanel from "./batch/BatchPublishPanel";\nimport BatchCaptureMode')
replace('src/components/BatchSellView.jsx', 'Photos or inventory → review → saved drafts. Nothing goes live here.', 'Photos or inventory → reviewed drafts → check and explicitly approve publication.')
replace('src/components/BatchSellView.jsx', '    {entries.length > 0 && <footer', '    <BatchPublishPanel listings={actions.data.listings} useServer={actions.data.useServer} onNavigate={onNavigate} />\n    {entries.length > 0 && <footer')
p = Path('src/styles/batchSell.css')
p.write_text(p.read_text() + '''
.batch-publication { margin-top: 20px; }
.batch-publication > summary { cursor: pointer; padding-block: 8px; }
.batch-publication fieldset { border: 0; min-width: 0; padding: 0; }
.batch-draft-selector { display: grid; gap: 10px; max-height: 320px; overflow: auto; margin-block: 12px; }
''')
p = Path('README.md')
p.write_text(p.read_text() + '''
### Reviewed batch publication

Open **Sell → Check and publish saved drafts** to load eBay Canada business
policies, check up to 25 raw sports-card fixed-price drafts, review the exact
definitions and explicitly approve publication. Checking uploads photos and
validates but does not list anything. Results and unfinished approvals persist on
the server; uncertain outcomes never automatically retry. Begin with sandbox and
see `docs/Batch-Publish.md` for shipping constraints, recovery and test limitations.
''')
p = Path('AGENTS.md')
p.write_text(p.read_text() + '''
## Reviewed publication increment

- `services/batchPublish/` owns additive SQLite publication batches and rows,
  immutable checked XML/fingerprints, 15-minute proofs and explicit approvals.
  `routes/batchPublish.routes.js` protects action endpoints; never accept an XML
  definition from a JSON client. The adapter accepts the internal
  `REVIEWED_DEFINITION` Symbol and invokes its guard after token acquisition.
- Every processed row is claimed durably; only approved rows may process. Keep
  uncertain results out of retries. Real Failure Ack is `EBAY_REJECTED`, while
  interrupted transport remains `publish_unknown`. Missing/zero item IDs do not
  prove publication. No startup worker processes approvals automatically.
- Preflight requires front/back images, exact-policy CAD shipping, raw sports
  singles, unchanged content and active account authorization. Policy changes,
  photo replacement or edits invalidate approval. See `docs/Batch-Publish.md`.
''')
Path('CLAUDE.md').write_text(p.read_text())
