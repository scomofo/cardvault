import { run } from "../database.js";
import { requireProtectedConfigWrite } from "../auth.js";
import { requireJsonBody } from "../validation/common.js";
import { consumeOAuthState, getAuthUrl, exchangeCodeForToken, getEbayStatus, issueOAuthState } from "../integrations/ebay/ebayAuth.js";

function sendInternalError(res, message, error) {
  console.error(message, error);
  return res.status(500).json({ error: "Internal server error" });
}

function parseSandboxFlag(value) {
  if (value == null) return true;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function normalizeCredential(value, fieldName) {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} required`);
  }

  if (trimmed.length > 200 || /\s/.test(trimmed)) {
    throw new Error(`${fieldName} must be a compact identifier`);
  }

  return trimmed;
}

function normalizeOptionalCredential(value, fieldName) {
  if (value == null || value === "") return "";
  return normalizeCredential(value, fieldName);
}

function normalizeRuName(value) {
  const candidate = typeof value === "string" && value.trim()
    ? value.trim()
    : process.env.EBAY_RU_NAME?.trim();

  if (!candidate) {
    throw new Error("ruName required");
  }

  if (/^https?:\/\//i.test(candidate)) {
    throw new Error("ruName must be your eBay RuName, not the callback URL");
  }

  if (candidate.length > 255 || /\s/.test(candidate)) {
    throw new Error("ruName must be a compact identifier");
  }

  return candidate;
}

function normalizeCallbackUrl(value) {
  const candidate = typeof value === "string" && value.trim()
    ? value.trim()
    : (process.env.EBAY_CALLBACK_URL?.trim() || process.env.EBAY_REDIRECT_URI?.trim());

  if (!candidate) {
    return "http://localhost:3000/api/ebay/callback";
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("callbackUrl must be a valid URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("callbackUrl must use http or https");
  }

  return parsed.toString();
}

/**
 * Register eBay OAuth and credential routes.
 * @param {import("express").Express} app
 */
export function registerEbayRoutes(app) {
  app.get("/api/ebay/status", (_req, res) => {
    try { res.json(getEbayStatus()); }
    catch (e) { sendInternalError(res, "Failed to load eBay status:", e); }
  });

  app.get("/api/ebay/auth", (_req, res) => {
    try {
      const state = issueOAuthState();
      res.redirect(getAuthUrl({ state }));
    }
    catch (e) { sendInternalError(res, "Failed to build eBay auth URL:", e); }
  });

  app.get("/api/ebay/callback", async (req, res) => {
    try {
      const code = req.query.code;
      const state = typeof req.query.state === "string" ? req.query.state : "";
      if (!code) return res.status(400).json({ error: "No authorization code received" });
      if (!consumeOAuthState(state)) {
        return res.status(400).json({ error: "Invalid or expired OAuth state" });
      }
      await exchangeCodeForToken(code);
      res.redirect("/#settings");
    } catch (e) {
      sendInternalError(res, "Failed to exchange eBay authorization code:", e);
    }
  });

  app.post("/api/ebay/credentials", requireProtectedConfigWrite, requireJsonBody, (req, res) => {
    try {
      const { appId, certId, devId, sandbox, ruName, callbackUrl } = req.body;
      const normalizedSandbox = parseSandboxFlag(sandbox);
      if (normalizedSandbox == null) {
        return res.status(400).json({ error: "sandbox must be a boolean" });
      }

      const pairs = [
        ["ebay_app_id", normalizeCredential(appId, "appId")],
        ["ebay_cert_id", normalizeCredential(certId, "certId")],
        ["ebay_dev_id", normalizeOptionalCredential(devId, "devId")],
        ["ebay_sandbox", String(normalizedSandbox)],
        ["ebay_ru_name", normalizeRuName(ruName)],
        ["ebay_callback_url", normalizeCallbackUrl(callbackUrl)],
      ];
      for (const [key, value] of pairs) {
        run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [key, value]);
      }
      res.json({ saved: true });
    } catch (e) {
      if (e.message?.includes("required") || e.message?.includes("must be")) {
        return res.status(400).json({ error: e.message });
      }
      return sendInternalError(res, "Failed to save eBay credentials:", e);
    }
  });

  app.post("/api/ebay/disconnect", requireProtectedConfigWrite, (_req, res) => {
    try {
      for (const key of ["ebay_access_token", "ebay_refresh_token", "ebay_token_expires"]) {
        run("DELETE FROM settings WHERE key = ?", [key]);
      }
      res.json({ disconnected: true });
    } catch (e) { sendInternalError(res, "Failed to disconnect eBay integration:", e); }
  });
}
