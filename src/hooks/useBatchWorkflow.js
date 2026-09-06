import { useEffect, useRef, useState } from "react";
import { useToast } from "../components/Toast";
import { useData } from "../lib/DataContext";
import { CONDITIONS } from "../lib/constants";
import { aiVisualSearch } from "../lib/ai";
import { imagesAPI, itemsAPI } from "../lib/api";
import { computeDHash } from "../lib/phash";
import { loadBatchSession, saveBatchSession, loadData, saveData, saveImage } from "../lib/storage";
import { normalizeBatchResult, saveApprovedBatch } from "../lib/batchSave";

const SESSION_KEY = "scan";
// Serialize pending writes across view unmounts. A new view restores only
// after the previous view's queued writes finish.
let sessionWrite = Promise.resolve();
function persistSession(queue) {
  const pending = sessionWrite.catch(() => {}).then(() => saveBatchSession(SESSION_KEY, queue));
  sessionWrite = pending;
  return pending;
}

export function useBatchWorkflow() {
  const toast = useToast();
  const { catalog, setCatalog, useServer } = useData();
  const [batchMode, setMode] = useState(null);
  const [batchQueue, setQueue] = useState([]);
  const [batchProcessing, setProcessing] = useState(false);
  const [batchProcessedCount, setProcessedCount] = useState(0);
  const readyRef = useRef(false);
  const mountedRef = useRef(true);
  const queueRef = useRef([]);
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    mountedRef.current = true;
    sessionWrite.catch(() => {}).then(() => loadBatchSession(SESSION_KEY)).then((saved) => {
      if (cancelled) return;
      if (!Array.isArray(saved)) throw new Error("Invalid saved batch");
      const restored = saved.filter((item) => item?.id).map((item) => ({
        ...item, status: item.status === "processing" ? "captured" : item.status,
      }));
      queueRef.current = restored;
      setQueue(restored);
      readyRef.current = true;
      if (restored.length) setMode("process");
    }).catch((error) => {
      if (!cancelled) toast.error(`Batch restore failed: ${error.message}. Reload before starting another batch.`);
    });
    return () => { cancelled = true; mountedRef.current = false; };
  }, []);

  function updateQueue(next) {
    queueRef.current = typeof next === "function" ? next(queueRef.current) : next;
    setQueue(queueRef.current);
    return persistSession(queueRef.current);
  }

  function setBatchMode(mode) {
    if (mode && !readyRef.current) {
      toast.info("Restoring your saved batch — try again when it has loaded");
      return;
    }
    setMode(mode);
  }

  async function addToBatchQueue({ front, back }) {
    if (!readyRef.current || busyRef.current || !front) return false;
    const entry = { id: crypto.randomUUID(), front, back, status: "captured", result: null, error: null, createdAt: new Date().toISOString() };
    try {
      await updateQueue((queue) => [...queue, entry]);
      return true;
    } catch (error) {
      queueRef.current = queueRef.current.filter((item) => item.id !== entry.id);
      setQueue(queueRef.current);
      toast.error(`Photo was not saved: ${error.message}. Keep this screen open and retry.`);
      return false;
    }
  }

  async function patchItem(id, patch) {
    if (!mountedRef.current) return;
    try {
      await updateQueue((queue) => queue.map((item) => item.id === id ? { ...item, ...patch } : item));
    } catch (error) {
      toast.error(`Batch changes are not saved: ${error.message}. Keep this screen open.`);
    }
  }

  async function processBatchQueue(targetId = null) {
    if (!readyRef.current || busyRef.current) return;
    busyRef.current = true;
    setProcessing(true);
    setProcessedCount(0);
    try {
      if (targetId) await patchItem(targetId, { status: "captured", result: null, error: null });
      const work = queueRef.current.filter((item) => targetId ? item.id === targetId : ["captured", "failed"].includes(item.status));
      for (let i = 0; i < work.length && mountedRef.current; i++) {
        const item = work[i];
        await patchItem(item.id, { status: "processing" });
        try {
          const result = normalizeBatchResult(await aiVisualSearch(item.front));
          if (!mountedRef.current) break;
          if (result) {
            await patchItem(item.id, { result, status: result.confidenceLabel === "high" ? "done" : "review", error: null });
          } else {
            await patchItem(item.id, { status: "failed", error: "Could not identify" });
          }
        } catch (error) {
          await patchItem(item.id, { status: "failed", error: error.message });
        }
        if (mountedRef.current) setProcessedCount(i + 1);
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setProcessing(false);
    }
  }

  async function saveBatchCards({ condition, storageLocation = "" } = {}) {
    if (!readyRef.current || busyRef.current) return;
    if (!CONDITIONS.some((entry) => entry.v === condition)) {
      toast.error("Choose the condition you inspected before saving this batch");
      return;
    }
    busyRef.current = true;
    setProcessing(true);
    setProcessedCount(0);
    const savedEntries = new Map();
    try {
      const summary = await saveApprovedBatch({
        queue: queueRef.current,
        persist: async (item) => {
          if (!mountedRef.current) throw new Error("Resume the batch to finish saving");
          const entryId = item.id; // Stable across partial saves, restarts and retries.
          const frontImgId = item.front ? `img_${entryId}_front` : null;
          const backImgId = item.back ? `img_${entryId}_back` : null;
          let frontImgPhash = null;
          if (frontImgId) {
            await saveImage(frontImgId, item.front);
            if (useServer) await imagesAPI.upload(frontImgId, item.front);
            frontImgPhash = await computeDHash(item.front);
          }
          if (backImgId) {
            await saveImage(backImgId, item.back);
            if (useServer) await imagesAPI.upload(backImgId, item.back);
          }
          const result = item.result;
          let entry = {
            id: entryId, name: result.name, set: result.set, number: result.number,
            cardSet: result.set, cardNumber: result.number, parallel: result.parallel || "",
            year: result.year, rarity: result.rarity, condition,
            binder: "", storageLocation, type: result.type || "sports", status: "inventory",
            costBasis: 0, frontImgId, backImgId, frontImgPhash,
            priceEstimate: { ...result.priceEstimate, evidence: "ai_estimate_unverified", results: result.results || [], costBasisKnown: false },
            priceHistory: result.priceHistory,
            notes: "AI price estimate: sources require verification. Cost basis not recorded.",
            listedOn: [], createdAt: item.createdAt || new Date().toISOString(),
          };
          if (useServer) entry = { ...entry, ...await itemsAPI.create(entry) };
          const current = loadData("catalog", catalog);
          if (!saveData("catalog", [entry, ...current.filter((card) => card.id !== entry.id)])) {
            throw new Error("Local storage is full; the scan has been retained for retry");
          }
          savedEntries.set(item.id, entry);
        },
        onSaved: async (item) => {
          if (!mountedRef.current) throw new Error("Card saved; resume the batch to finish");
          const entry = savedEntries.get(item.id);
          setCatalog((previous) => [entry, ...previous.filter((card) => card.id !== entry.id)]);
          await updateQueue((queue) => queue.filter((scan) => scan.id !== item.id));
          setProcessedCount((count) => count + 1);
        },
        onError: (item, error) => {
          if (mountedRef.current) void patchItem(item.id, { error: `Save failed: ${error.message}` });
        },
      });
      if (mountedRef.current) {
        if (summary.savedIds.length) toast.success(`${summary.savedIds.length} cards saved; ${queueRef.current.length} scans remain`);
        if (summary.failedIds.length) toast.error(`${summary.failedIds.length} cards need a save retry. Their intake IDs are preserved.`);
        if (!queueRef.current.length) setMode(null);
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setProcessing(false);
    }
  }

  function approveBatchItem(id) {
    if (!busyRef.current && queueRef.current.find((item) => item.id === id)?.result?.name) {
      void patchItem(id, { status: "approved", error: null });
    }
  }

  function removeBatchItem(id) {
    if (busyRef.current) return;
    void updateQueue((queue) => queue.filter((item) => item.id !== id)).catch((error) => toast.error(`Batch removal not saved: ${error.message}`));
  }

  return {
    actions: { setBatchMode, addToBatchQueue, processBatchQueue, saveBatchCards, approveBatchItem, removeBatchItem, retryBatchItem: processBatchQueue },
    state: { batchMode, batchQueue, batchProcessing, batchProcessedCount },
  };
}
