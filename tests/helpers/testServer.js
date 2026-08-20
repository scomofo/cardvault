import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

async function waitForTestPort(server, timeoutMs = 15000) {
  let output = "";

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      server.stdout?.off("data", onStdout);
      server.stderr?.off("data", onStderr);
      server.off("exit", onExit);
    };

    const fail = (error) => {
      cleanup();
      reject(error);
    };

    const onStdout = (chunk) => {
      output += chunk.toString();
      const match = output.match(/CARDVAULT_TEST_PORT:(\d+)/);
      if (match) {
        cleanup();
        resolve(Number(match[1]));
      }
    };

    const onStderr = (chunk) => {
      output += chunk.toString();
    };

    const onExit = (code, signal) => {
      const suffix = output ? `\n${output.trim()}` : "";
      fail(new Error(`Server exited before reporting its test port (${signal || code})${suffix}`));
    };

    const timeout = setTimeout(() => {
      const suffix = output ? `\n${output.trim()}` : "";
      fail(new Error(`Server did not report its test port within ${timeoutMs}ms${suffix}`));
    }, timeoutMs);

    server.stdout?.on("data", onStdout);
    server.stderr?.on("data", onStderr);
    server.once("exit", onExit);
  });
}

export async function waitForServer(baseUrl, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/settings`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms`);
}

export async function startTestServer(t, { dirPrefix }) {
  const tempDir = await mkdtemp(join(tmpdir(), dirPrefix));
  const dbPath = join(tempDir, "cardvault-test.db");
  const script = [
    'import { startServer } from "./server.js";',
    'const server = await startServer({ port: 0, host: "127.0.0.1" });',
    // Exit via process.exit so exit hooks run (e.g. NODE_V8_COVERAGE flushes).
    'process.on("SIGTERM", () => { server.close(() => process.exit(0)); server.closeAllConnections?.(); });',
    'console.log("CARDVAULT_TEST_PORT:" + server.address().port);',
  ].join("\n");

  const server = spawn(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CARDVAULT_DB_PATH: dbPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exitPromise = new Promise((resolve) => server.once("exit", resolve));

  t.after(async () => {
    if (server.exitCode === null && !server.killed) {
      server.kill("SIGTERM");
    }
    await exitPromise;
    await rm(tempDir, { recursive: true, force: true });
  });

  const port = await waitForTestPort(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(baseUrl);
  return { baseUrl, dbPath };
}
