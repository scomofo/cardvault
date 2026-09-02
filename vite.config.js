import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function loadHttpsConfig(env) {
  const keyPath = env.SSL_KEY_FILE?.trim();
  const certPath = env.SSL_CERT_FILE?.trim();
  const caPath = env.SSL_CA_FILE?.trim();

  if (!keyPath || !certPath) return undefined;

  const resolvedKeyPath = resolve(process.cwd(), keyPath);
  const resolvedCertPath = resolve(process.cwd(), certPath);
  const resolvedCaPath = caPath ? resolve(process.cwd(), caPath) : null;

  if (!existsSync(resolvedKeyPath) || !existsSync(resolvedCertPath)) {
    throw new Error(
      `HTTPS is enabled but the certificate files were not found. Expected key at ${resolvedKeyPath} and cert at ${resolvedCertPath}.`
    );
  }
  if (resolvedCaPath && !existsSync(resolvedCaPath)) {
    throw new Error(`HTTPS is enabled but the CA bundle was not found at ${resolvedCaPath}.`);
  }

  return {
    key: readFileSync(resolvedKeyPath),
    cert: readFileSync(resolvedCertPath),
    ...(resolvedCaPath && existsSync(resolvedCaPath)
      ? { ca: readFileSync(resolvedCaPath) }
      : {}),
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Loopback by default; set HOST=0.0.0.0 (see .env.example) to allow a
  // phone on the same Wi-Fi to reach the dev server.
  const host = env.HOST || "127.0.0.1";
  const apiTarget = env.CARDVAULT_API_URL || "http://127.0.0.1:3001";
  const cvTarget = env.CARDVAULT_CV_URL || "http://127.0.0.1:8000";
  const https = loadHttpsConfig(env);

  return {
    plugins: [react()],
    server: {
      port: 3000,
      strictPort: true,
      host,
      https,
      proxy: {
        "/api/ai": {
          target: apiTarget,
          changeOrigin: true,
        },
        "/api/cv": {
          target: cvTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/cv/, ""),
        },
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 4173,
      host,
      https,
    },
  };
});
