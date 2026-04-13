import { run } from "../database.js";
import { requireJsonBody } from "../validation/common.js";
import { getAuthUrl, exchangeCodeForToken, getEbayStatus } from "../integrations/ebay/ebayAuth.js";

/**
 * Register eBay OAuth and credential routes.
 * @param {import("express").Express} app
 */
export function registerEbayRoutes(app) {
  app.get("/api/ebay/status", (_req, res) => {
    try { res.json(getEbayStatus()); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/ebay/auth", (_req, res) => {
    try { res.redirect(getAuthUrl()); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/ebay/callback", async (req, res) => {
    try {
      const code = req.query.code;
      if (!code) return res.status(400).json({ error: "No authorization code received" });
      await exchangeCodeForToken(code);
      res.redirect("/#settings");
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ebay/credentials", requireJsonBody, (req, res) => {
    try {
      const { appId, certId, devId, sandbox, redirectUri } = req.body;
      if (!appId || !certId) return res.status(400).json({ error: "appId and certId required" });
      const pairs = [
        ["ebay_app_id", appId], ["ebay_cert_id", certId],
        ["ebay_dev_id", devId || ""], ["ebay_sandbox", String(sandbox !== false)],
        ["ebay_redirect_uri", redirectUri || "http://localhost:3000/api/ebay/callback"],
      ];
      for (const [key, value] of pairs) {
        run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [key, value]);
      }
      res.json({ saved: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/ebay/disconnect", (_req, res) => {
    try {
      for (const key of ["ebay_access_token", "ebay_refresh_token", "ebay_token_expires"]) {
        run("DELETE FROM settings WHERE key = ?", [key]);
      }
      res.json({ disconnected: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}
