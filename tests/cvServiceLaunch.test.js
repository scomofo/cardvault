import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  CV_SERVICE_REQUIRED_MODULES,
  buildCvServiceDependencyMessage,
  buildCvServiceProbeArgs,
} from "../src/electron/cvService.js";

test("CV service dependency probe checks the modules needed before launch", () => {
  assert.deepEqual(CV_SERVICE_REQUIRED_MODULES, ["fastapi", "uvicorn", "cv2", "numpy"]);
  assert.deepEqual(buildCvServiceProbeArgs(), [
    "-c",
    "import fastapi, uvicorn, cv2, numpy",
  ]);
});

test("CV service missing dependency message gives the local repair command", () => {
  const message = buildCvServiceDependencyMessage("python3");

  assert.match(message, /python3 -m pip install -r requirements\.txt/);
  assert.match(message, /cv-service/);
});

test("Electron start flow probes CV service dependencies before uvicorn launch", async () => {
  const main = await readFile(new URL("../src/electron/main.js", import.meta.url), "utf8");

  assert.match(main, /probeCvServiceDependencies\(chosen\)/);
  assert.match(main, /buildCvServiceDependencyMessage\(chosen\)/);
});
