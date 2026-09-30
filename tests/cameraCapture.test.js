import test from "node:test";
import assert from "node:assert/strict";
import {
  cameraConstraints, applyCameraDefaults, captureCameraImage, shouldCaptureKey,
  openCameraStream, createCaptureGate,
} from "../src/lib/cameraCapture.js";

test("camera selection uses an exact device without forcing a rear camera", () => {
  assert.deepEqual(cameraConstraints("iphone").video.deviceId, { exact: "iphone" });
  assert.equal(cameraConstraints("iphone").video.facingMode, undefined);
  assert.equal(cameraConstraints("").video.facingMode, "environment");
  assert.equal(cameraConstraints("").audio, false);
});

test("a missing remembered camera falls back visibly, but permission denial does not retry", async () => {
  const calls = [];
  const stream = {};
  const result = await openCameraStream({ getUserMedia: async (constraints) => {
    calls.push(constraints);
    if (calls.length === 1) throw { name: "NotFoundError" };
    return stream;
  } }, "old-camera");
  assert.equal(result.stream, stream);
  assert.match(result.notice, /unavailable/i);
  assert.equal(calls.length, 2);
  await assert.rejects(openCameraStream({ getUserMedia: async () => {
    throw new Error("denied", { cause: "permission" });
  } }, "iphone"), /denied/);
});

test("Space shutter ignores editing, controls, held keys, shortcuts, and busy cameras", () => {
  const event = { code: "Space", target: { closest: () => null } };
  assert.equal(shouldCaptureKey(event, { ready: true }), true);
  for (const property of ["repeat", "ctrlKey", "metaKey", "altKey", "shiftKey", "isComposing", "defaultPrevented"]) {
    assert.equal(shouldCaptureKey({ ...event, [property]: true }, { ready: true }), false);
  }
  for (const tag of ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"]) {
    assert.equal(shouldCaptureKey({ ...event, target: { tagName: tag } }, { ready: true }), false);
  }
  assert.equal(shouldCaptureKey({ ...event, target: { isContentEditable: true } }, { ready: true }), false);
  assert.equal(shouldCaptureKey({ ...event, target: { closest: () => ({}) } }, { ready: true }), false);
  assert.equal(shouldCaptureKey(event, { ready: true, busy: true }), false);
  assert.equal(shouldCaptureKey(event, { ready: false }), false);
});

test("camera defaults are capability-driven and continue after one rejected control", async () => {
  const calls = [];
  const track = {
    getCapabilities: () => ({ focusMode: ["continuous"], exposureMode: ["continuous"], whiteBalanceMode: ["manual"], torch: [true, false] }),
    applyConstraints: async (constraints) => {
      calls.push(constraints);
      if (constraints.advanced[0].focusMode) throw new Error("unsupported");
    },
    getSettings: () => ({ exposureMode: "continuous", torch: false }),
  };
  const result = await applyCameraDefaults(track);
  assert.equal(calls.length, 3);
  assert.equal(calls.some((c) => "whiteBalanceMode" in c.advanced[0]), false);
  assert.equal(result.settings.exposureMode, "continuous");
  assert.deepEqual(result.failed, ["focusMode"]);
});

test("capture gate blocks concurrent shutters and releases after errors", async () => {
  const gate = createCaptureGate();
  let release;
  const first = gate.run(() => new Promise((resolve) => { release = resolve; }));
  assert.equal(gate.busy, true);
  assert.equal(await gate.run(() => assert.fail("second capture")), undefined);
  release("first");
  assert.equal(await first, "first");
  await assert.rejects(gate.run(async () => { throw new Error("failed"); }), /failed/);
  assert.equal(gate.busy, false);
});

const video = { videoWidth: 1920, videoHeight: 1080, readyState: 2 };
const track = { readyState: "live", muted: false };
function canvasStub() {
  return { getContext: () => ({ drawImage: () => {} }), toDataURL: () => "data:image/jpeg;base64,frame" };
}

test("still capture requests advertised photo dimensions and returns the still", async () => {
  let options;
  class Still {
    async getPhotoCapabilities() { return { imageWidth: { max: 4032 }, imageHeight: { max: 3024 }, fillLightMode: ["off"] }; }
    async takePhoto(value) { options = value; return new Blob(["photo"]); }
  }
  const result = await captureCameraImage({ video, track, canvas: canvasStub(), ImageCaptureClass: Still, blobToDataURL: async () => "still" });
  assert.deepEqual(options, { imageWidth: 4032, imageHeight: 3024, fillLightMode: "off" });
  assert.equal(result.dataUrl, "still");
  assert.equal(result.method, "photo");
});

test("failed still settings retry without dimensions before using a video frame", async () => {
  let calls = 0;
  class Still {
    async getPhotoCapabilities() { return { imageWidth: { max: 4032 } }; }
    async takePhoto() { calls++; throw new Error("virtual camera"); }
  }
  const result = await captureCameraImage({ video, track, canvas: canvasStub(), ImageCaptureClass: Still });
  assert.equal(calls, 2);
  assert.equal(result.method, "frame");
  assert.match(result.dataUrl, /frame$/);
  assert.match(result.notice, /video frame/i);
});

test("browsers without still support capture a frame but never a blank or disconnected frame", async () => {
  const args = { video, track, canvas: canvasStub(), ImageCaptureClass: null };
  assert.equal((await captureCameraImage(args)).method, "frame");
  await assert.rejects(captureCameraImage({ ...args, video: { ...video, videoWidth: 0 } }), /ready/i);
  await assert.rejects(captureCameraImage({ ...args, track: { readyState: "ended" } }), /ready/i);
  await assert.rejects(captureCameraImage({ ...args, track: { ...track, muted: true } }), /ready/i);
});

test("unresponsive still capture times out to a video frame", async () => {
  class Stalled { takePhoto() { return new Promise(() => {}); } }
  const result = await captureCameraImage({ video, track, canvas: canvasStub(), ImageCaptureClass: Stalled, timeoutMs: 10 });
  assert.equal(result.method, "frame");
});

test("capability-query failures leave virtual cameras usable without claiming controls were set", async () => {
  const result = await applyCameraDefaults({
    getCapabilities() { throw new Error("virtual camera"); },
    applyConstraints() { assert.fail("no advertised controls"); },
    getSettings: () => ({ width: 1280, height: 720 }),
  });
  assert.deepEqual(result.settings, { width: 1280, height: 720 });
  assert.deepEqual(result.failed, []);
});

test("failed photo capabilities still allow the camera's default still capture", async () => {
  class Still {
    async getPhotoCapabilities() { throw new Error("unsupported"); }
    async takePhoto(options) { assert.deepEqual(options, {}); return new Blob(["photo"]); }
  }
  const result = await captureCameraImage({ video, track, canvas: canvasStub(), ImageCaptureClass: Still, blobToDataURL: async () => "still" });
  assert.equal(result.method, "photo");
});

test("camera loss during a still-photo attempt does not accept a frozen frame", async () => {
  const disconnectedTrack = { ...track };
  class Still {
    async takePhoto() { disconnectedTrack.readyState = "ended"; throw new Error("disconnected"); }
  }
  await assert.rejects(captureCameraImage({ video, track: disconnectedTrack, canvas: canvasStub(), ImageCaptureClass: Still }), /ready/i);
});
