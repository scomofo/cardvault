import { useCallback, useEffect, useRef, useState } from "react";
import { applyCameraDefaults, captureCameraImage, createCaptureGate, openCameraStream, readCameraFile } from "../lib/cameraCapture";

const CAMERA_KEY = "cv8_capture_camera";
function rememberedCamera() {
  try { return localStorage.getItem(CAMERA_KEY) || ""; } catch { return ""; }
}

export function useCameraCapture({ onCapture, continuous, disabled }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const generation = useRef(0);
  const gate = useRef(createCaptureGate());
  const [deviceId, setDeviceId] = useState(rememberedCamera);
  const [devices, setDevices] = useState([]);
  const [live, setLive] = useState(false);
  const [ready, setReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [settings, setSettings] = useState({});
  const supported = typeof window !== "undefined" && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

  const refreshDevices = useCallback(async () => {
    try {
      const cameras = await navigator.mediaDevices?.enumerateDevices();
      setDevices((cameras || []).filter((device) => device.kind === "videoinput" && device.deviceId));
    } catch { /* Camera use can still work when enumeration is restricted. */ }
  }, []);

  const stop = useCallback(() => {
    generation.current++;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setLive(false);
    setReady(false);
    setStarting(false);
  }, []);

  const start = useCallback(async (selected = deviceId) => {
    if (!supported) {
      setError("Live camera needs HTTPS or localhost on this device. Use Upload instead.");
      return;
    }
    stop();
    const request = generation.current;
    setStarting(true);
    setError("");
    setNotice("");
    setSettings({});
    let stream;
    try {
      const result = await openCameraStream(navigator.mediaDevices, selected);
      stream = result.stream;
      if (request !== generation.current || !videoRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      const defaults = await applyCameraDefaults(track);
      if (request !== generation.current) return;
      const actualId = defaults.settings.deviceId || selected;
      setDeviceId(actualId);
      try { localStorage.setItem(CAMERA_KEY, actualId); } catch { /* Storage may be disabled. */ }
      setSettings({ ...defaults.settings, label: track.label });
      setNotice([result.notice, defaults.failed.length ? "Some automatic settings were refused; check focus and lighting in the preview." : ""].filter(Boolean).join(" "));
      track.addEventListener("ended", () => {
        if (request !== generation.current) return;
        stop();
        setError("Camera disconnected. Reconnect your iPhone, then open the camera again.");
      });
      track.addEventListener("mute", () => { if (request === generation.current) setReady(false); });
      track.addEventListener("unmute", () => {
        if (request === generation.current) setReady(videoRef.current?.readyState >= 2);
      });
      videoRef.current.srcObject = stream;
      setLive(true);
      await videoRef.current.play();
      if (request !== generation.current) return;
      setReady(!track.muted && videoRef.current?.readyState >= 2);
      await refreshDevices();
      return true;
    } catch (failure) {
      stream?.getTracks().forEach((track) => track.stop());
      if (request !== generation.current) return;
      stop();
      setError(failure.name === "NotAllowedError" ? "Camera access denied. Allow camera access in your browser and system settings, then retry." : "Camera unavailable. Check the USB connection and close other apps using this camera, then retry.");
    } finally { if (request === generation.current) setStarting(false); }
  }, [deviceId, refreshDevices, stop, supported]);

  const snap = useCallback(() => {
    if (!ready || disabled || starting) return;
    return gate.current.run(async () => {
      const request = generation.current;
      setBusy(true);
      setError("");
      try {
        const result = await captureCameraImage({ video: videoRef.current, canvas: canvasRef.current, track: streamRef.current?.getVideoTracks()[0] });
        if (request !== generation.current) return;
        setNotice(result.notice);
        await onCapture(result.dataUrl);
        if (request === generation.current && !continuous) stop();
      } catch (failure) { if (request === generation.current) setError(failure.message || "Photo capture failed. Try again."); }
      finally { setBusy(false); }
    });
  }, [continuous, disabled, onCapture, ready, starting, stop]);

  const upload = useCallback((file) => {
    if (!file || disabled || starting) return;
    return gate.current.run(async () => {
      const request = generation.current;
      setBusy(true);
      setError("");
      try {
        const image = await readCameraFile(file);
        if (request !== generation.current) return;
        await onCapture(image);
        if (request === generation.current && !continuous) stop();
      } catch (failure) { if (request === generation.current) setError(failure.message || "Could not load photo."); }
      finally { setBusy(false); }
    });
  }, [continuous, disabled, onCapture, starting, stop]);

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => { navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices); stop(); };
  }, [refreshDevices, stop]);

  return { videoRef, canvasRef, deviceId, setDeviceId, devices, live, ready, starting, busy, error, notice, settings, supported, refreshDevices, start, stop, snap, upload };
}
