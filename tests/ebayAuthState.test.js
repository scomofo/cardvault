import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

test("OAuth state can be consumed after module reload", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-ebay-state-"));
  const dbPath = join(tempDir, "cardvault-test.db");
  const originalDbPath = process.env.CARDVAULT_DB_PATH;

  try {
    process.env.CARDVAULT_DB_PATH = dbPath;

    const databaseModule = await import("../src/server/database.js");
    databaseModule.initDB();

    const authModuleUrl = `${pathToFileURL(join(process.cwd(), "src/server/integrations/ebay/ebayAuth.js")).href}?t=${Date.now()}`;
    const firstModule = await import(authModuleUrl);
    const state = firstModule.issueOAuthState();

    const secondModule = await import(`${pathToFileURL(join(process.cwd(), "src/server/integrations/ebay/ebayAuth.js")).href}?t=${Date.now() + 1}`);
    assert.equal(secondModule.consumeOAuthState(state), true);
    assert.equal(secondModule.consumeOAuthState(state), false);

    databaseModule.getDB().close();
  } finally {
    if (originalDbPath == null) delete process.env.CARDVAULT_DB_PATH;
    else process.env.CARDVAULT_DB_PATH = originalDbPath;
    await rm(tempDir, { recursive: true, force: true });
  }
});
