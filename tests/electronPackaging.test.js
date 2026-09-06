import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

test("macOS package includes every local module imported by its server and native shell", async () => {
  const root = new URL("../", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  const included = (file) => manifest.build.files.some((pattern) =>
    pattern.endsWith("/**") ? file.startsWith(pattern.slice(0, -2)) : pattern === file,
  );
  const visited = new Set();
  async function inspect(file, trail = []) {
    if (visited.has(file)) return;
    visited.add(file);
    assert.ok(included(file), `Missing packaged module: ${[...trail, file].join(" → ")}`);
    const source = await readFile(new URL(file, root), "utf8");
    for (const [, specifier] of source.matchAll(/(?:\bfrom\s*|\bimport\s*)["']([^"']+)["']/g)) {
      if (!specifier.startsWith(".")) continue;
      await inspect(path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)), [...trail, file]);
    }
  }
  await inspect("server.js");
  await inspect(manifest.main);
});
