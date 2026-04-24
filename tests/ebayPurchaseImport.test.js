import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

async function waitForServer(baseUrl, timeoutMs = 10000) {
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

test("eBay CSV import creates purchases, inventory items, and skips duplicates", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-ebay-purchase-import-"));
  const dbPath = join(tempDir, "cardvault-test.db");
  const port = 7200 + Math.floor(Math.random() * 200);
  const baseUrl = `http://127.0.0.1:${port}`;

  const server = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      CARDVAULT_DB_PATH: dbPath,
    },
    stdio: "ignore",
  });

  t.after(async () => {
    if (!server.killed) {
      server.kill("SIGTERM");
    }
    await new Promise((resolve) => server.once("exit", resolve));
    await rm(tempDir, { recursive: true, force: true });
  });

  await waitForServer(baseUrl);

  const csv = [
    "Order number,Item title,Seller,Item subtotal,Shipping and handling,Total,Quantity,Paid on",
    '11-11111-11111,"Connor McDavid - Upper Deck Young Guns",seller_one,25.00,4.50,29.50,1,2026-04-01',
    '22-22222-22222,"Wayne Gretzky - O-Pee-Chee Rookie",seller_two,60.00,10.00,70.00,2,2026-04-02',
  ].join("\n");

  const importResponse = await fetch(`${baseUrl}/api/purchases/import/ebay-csv`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      csv,
      addToInventory: true,
    }),
  });
  assert.equal(importResponse.status, 201);
  const importPayload = await importResponse.json();
  assert.equal(importPayload.importedPurchases, 2);
  assert.equal(importPayload.importedItems, 3);
  assert.equal(importPayload.skippedDuplicates, 0);

  const purchasesResponse = await fetch(`${baseUrl}/api/purchases`);
  assert.equal(purchasesResponse.status, 200);
  const purchases = await purchasesResponse.json();
  assert.equal(purchases.length, 2);
  const gretzkyPurchase = purchases.find((purchase) => purchase.externalOrderId === "22-22222-22222");
  assert.ok(gretzkyPurchase);
  assert.equal(gretzkyPurchase.platform, "ebay");
  assert.equal(gretzkyPurchase.totalCost, 70);

  const itemsResponse = await fetch(`${baseUrl}/api/items`);
  assert.equal(itemsResponse.status, 200);
  const items = await itemsResponse.json();
  assert.equal(items.length, 3);
  const importedGretzkyItems = items.filter((item) => item.purchaseId === gretzkyPurchase.id);
  assert.equal(importedGretzkyItems.length, 2);
  assert.equal(importedGretzkyItems[0].acquisitionSource, "ebay");
  assert.equal(importedGretzkyItems[0].costBasis, 35);

  const duplicateResponse = await fetch(`${baseUrl}/api/purchases/import/ebay-csv`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      csv,
      addToInventory: true,
    }),
  });
  assert.equal(duplicateResponse.status, 201);
  const duplicatePayload = await duplicateResponse.json();
  assert.equal(duplicatePayload.importedPurchases, 0);
  assert.equal(duplicatePayload.importedItems, 0);
  assert.equal(duplicatePayload.skippedDuplicates, 2);
});

test("eBay import accepts tabular HTML-like exports", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-ebay-purchase-import-html-"));
  const dbPath = join(tempDir, "cardvault-test.db");
  const port = 7400 + Math.floor(Math.random() * 200);
  const baseUrl = `http://127.0.0.1:${port}`;

  const server = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      CARDVAULT_DB_PATH: dbPath,
    },
    stdio: "ignore",
  });

  t.after(async () => {
    if (!server.killed) {
      server.kill("SIGTERM");
    }
    await new Promise((resolve) => server.once("exit", resolve));
    await rm(tempDir, { recursive: true, force: true });
  });

  await waitForServer(baseUrl);

  const html = `
    <table>
      <tr>
        <th>Order number</th><th>Item title</th><th>Seller</th><th>Total</th><th>Quantity</th><th>Paid on</th>
      </tr>
      <tr>
        <td>33-33333-33333</td><td>Mario Lemieux - Score Rookie</td><td>seller_three</td><td>$45.00</td><td>1</td><td>2026-04-03</td>
      </tr>
    </table>
  `;

  const importResponse = await fetch(`${baseUrl}/api/purchases/import/ebay-csv`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      csv: html,
      addToInventory: false,
    }),
  });
  assert.equal(importResponse.status, 201);
  const importPayload = await importResponse.json();
  assert.equal(importPayload.importedPurchases, 1);
  assert.equal(importPayload.importedItems, 0);

  const purchasesResponse = await fetch(`${baseUrl}/api/purchases`);
  const purchases = await purchasesResponse.json();
  const purchase = purchases.find((entry) => entry.externalOrderId === "33-33333-33333");
  assert.ok(purchase);
  assert.equal(purchase.name, "Mario Lemieux - Score Rookie");
});
