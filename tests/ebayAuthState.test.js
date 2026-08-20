import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("OAuth state can be consumed after module reload", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-ebay-state-"));
  const dbPath = join(tempDir, "cardvault-test.db");
  const originalDbPath = process.env.CARDVAULT_DB_PATH;

  try {
    process.env.CARDVAULT_DB_PATH = dbPath;

    const databaseModule = await import("../src/server/database.js");
    databaseModule.initDB();

    const authModule = await import("../src/server/integrations/ebay/ebayAuth.js");
    const state = authModule.issueOAuthState();

    // Consume in a child process: a genuinely fresh module instance whose
    // in-memory state map is empty, so consumption must come from the DB.
    const script = `
      const database = await import("./src/server/database.js");
      const auth = await import("./src/server/integrations/ebay/ebayAuth.js");
      database.initDB();
      console.log(auth.consumeOAuthState(process.env.OAUTH_STATE));
      console.log(auth.consumeOAuthState(process.env.OAUTH_STATE));
    `;
    const { stdout } = await execFileAsync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: process.cwd(),
      env: { ...process.env, OAUTH_STATE: state },
    });
    assert.deepEqual(stdout.trim().split("\n"), ["true", "false"]);

    databaseModule.getDB().close();
  } finally {
    if (originalDbPath == null) delete process.env.CARDVAULT_DB_PATH;
    else process.env.CARDVAULT_DB_PATH = originalDbPath;
    await rm(tempDir, { recursive: true, force: true });
  }
});
